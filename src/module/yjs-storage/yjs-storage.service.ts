import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as Y from 'yjs';
import { PrismaService } from '../prisma/prisma.service';
import { YjsRoomEventsService } from './yjs-room-events.service';

type StoredYDocState =
  | number[]
  | {
      update?: number[];
      state?: number[];
    }
  | null;

// Yjs 文档快照在数据库中的兼容类型：
// 当前主格式是 number[]，也兼容早期包在 update/state 字段里的结构。

type CreateDocumentInput = {
  id?: number | string;
  docId?: number | string;
  documentId?: number | string;
  title?: string;
  createdBy?: number | string;
  content?: number[];
};

// 文档访问级别：read 只要求可查看，write 要求编辑者及以上权限。
export type DocumentAccessLevel = 'read' | 'write';

/**
 * Yjs 文档存储服务。
 * 负责 Y.Doc 快照的编码/解码、文档与历史记录持久化、权限校验，
 * 以及 WebSocket 协作会话的在线连接引用计数。
 */
@Injectable()
export class YjsStorageService {
  // 同一用户连续编辑时，多久以内的历史记录可以合并，避免每个快照都生成一条历史。
  private static readonly EDIT_HISTORY_MERGE_WINDOW_MS = 5 * 60 * 1000;
  private readonly logger = new Logger(YjsStorageService.name);
  // 记录文档 -> 用户 -> 当前连接数的引用计数，用于多标签页在线状态判断。
  private readonly activeConnectionRefs = new Map<
    string,
    Map<string, number>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly roomEvents: YjsRoomEventsService,
  ) {}

  // 将 REST/WS 传入的 id 统一转成安全整数，非法值直接抛出异常。
  normalizeId(id: number | string): number {
    const normalized =
      typeof id === 'number'
        ? id
        : /^-?\d+$/.test(id.trim())
          ? Number(id.trim())
          : Number.NaN;

    if (!Number.isSafeInteger(normalized)) {
      throw new Error(`Invalid numeric id: ${id}`);
    }

    return normalized;
  }

  // 创建一个空 Y.Doc 对应的快照，用于初始化没有内容的文档。
  createEmptyState(): number[] {
    return Array.from(Y.encodeStateAsUpdate(new Y.Doc()));
  }

  // 把数据库 JSON 内容还原为 Yjs 可应用的 Uint8Array 增量数据。
  decodeState(content: StoredYDocState): Uint8Array | null {
    if (!content) {
      return null;
    }

    if (Array.isArray(content)) {
      return Uint8Array.from(content);
    }

    const update = content.update ?? content.state;
    if (!update || !Array.isArray(update)) {
      return null;
    }

    return Uint8Array.from(update);
  }

  // 把内存中的 Y.Doc 完整编码为可落库的 number[] 快照。
  encodeState(doc: Y.Doc): number[] {
    return Array.from(Y.encodeStateAsUpdate(doc));
  }

  // 保存文档快照，默认不记录历史操作者。
  async saveSnapshot(id: number | string, doc: Y.Doc) {
    return this.saveSnapshotByUser(id, doc);
  }

  // 将 Y.Doc 当前状态编码后写入 documents 表，并按需更新编辑历史。
  async saveSnapshotByUser(
    id: number | string,
    doc: Y.Doc,
    userId?: number | string | null,
  ) {
    const documentId = this.normalizeId(id);
    const content = this.encodeState(doc);
    const normalizedUserId =
      userId === undefined || userId === null ? null : this.normalizeId(userId);

    this.logger.log(
      `Saving snapshot for doc=${documentId}, bytes=${content.length}`,
    );

    // 快照写入和版本递增放在同一个事务里，避免 content 与 version 不一致。
    const document = await this.prisma.$transaction(async (tx) => {
      const updatedDocument = await tx.document.update({
        where: { id: documentId },
        data: {
          content,
          version: {
            increment: 1,
          },
        },
      });

      // 只有知道操作者时才写历史，否则只更新文档当前快照。
      if (normalizedUserId !== null) {
        await this.upsertEditHistory(
          tx,
          documentId,
          normalizedUserId,
          updatedDocument.version,
          content,
        );
      }

      return updatedDocument;
    });

    this.logger.log(
      `Saved snapshot for doc=${documentId}, version=${document.version}`,
    );

    return document;
  }

  // 在写入快照的同时维护编辑历史：
  // 同一用户短时间内的连续编辑会合并到最近一条 edit 历史，而不是无限新增。
  private async upsertEditHistory(
    tx: {
      documentHistory: {
        findFirst: (...args: any[]) => Promise<{ id: number } | null>;
        update: (...args: any[]) => Promise<unknown>;
        create: (...args: any[]) => Promise<unknown>;
      };
    },
    documentId: number,
    userId: number,
    version: number,
    content: number[],
  ) {
    const now = new Date();
    const mergeWindowStart = new Date(
      now.getTime() - YjsStorageService.EDIT_HISTORY_MERGE_WINDOW_MS,
    );
    // 先找该用户最近可合并的 edit 记录。
    const latestEditableHistory = await tx.documentHistory.findFirst({
      where: {
        documentId,
        userId,
        action: 'edit',
        createdAt: {
          gte: mergeWindowStart,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
      },
    });

    // 命中合并窗口则更新原记录，否则创建一条新的 edit 历史。
    if (latestEditableHistory) {
      await tx.documentHistory.update({
        where: {
          id: latestEditableHistory.id,
        },
        data: {
          version,
          summary: 'Saved Yjs snapshot',
          content,
          createdAt: now,
          sourceVersion: null,
        },
      });
      return;
    }

    await tx.documentHistory.create({
      data: {
        documentId,
        userId,
        version,
        action: 'edit',
        summary: 'Saved Yjs snapshot',
        content,
      },
    });
  }

  // 返回文档的历史列表，不返回庞大的 content，只返回其字节大小。
  async getDocumentHistories(docId: number | string, userId: number | string) {
    const documentId = this.normalizeId(docId);
    await this.validateDocumentAccess(documentId, userId, 'read');

    const histories = await this.prisma.documentHistory.findMany({
      where: { documentId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return histories.map(({ content, ...history }) => ({
      ...history,
      contentSize: Array.isArray(content) ? content.length : 0,
    }));
  }

  // 手动创建一条文档快照历史，便于用户标记重要版本。
  async createManualSnapshot(
    docId: number | string,
    userId: number | string,
    summary?: string | null,
  ) {
    const documentId = this.normalizeId(docId);
    const normalizedUserId = this.normalizeId(userId);
    await this.validateDocumentAccess(documentId, normalizedUserId, 'write');

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        version: true,
        content: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const history = await this.prisma.documentHistory.create({
      data: {
        documentId,
        userId: normalizedUserId,
        version: document.version,
        action: 'manual_snapshot',
        summary: summary?.trim() || 'Manual snapshot',
        content: document.content,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
      },
    });

    const { content, ...historyWithoutContent } = history;
    return {
      ...historyWithoutContent,
      contentSize: Array.isArray(content) ? content.length : 0,
    };
  }

  // 返回指定历史版本与当前文档的 Yjs 原始 update，供前端重建并 diff。
  async getHistoryCompareSnapshot(
    docId: number | string,
    userId: number | string,
    historyId: number | string,
    field?: string | null,
  ) {
    const documentId = this.normalizeId(docId);
    const normalizedHistoryId = this.normalizeId(historyId);
    await this.validateDocumentAccess(documentId, userId, 'read');

    const [history, document] = await Promise.all([
      this.prisma.documentHistory.findFirst({
        where: {
          id: normalizedHistoryId,
          documentId,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              account: true,
            },
          },
        },
      }),
      this.prisma.document.findUnique({
        where: { id: documentId },
        select: {
          id: true,
          version: true,
          updatedAt: true,
          content: true,
        },
      }),
    ]);

    if (!history) {
      throw new NotFoundException('History record not found');
    }

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (!Array.isArray(history.content)) {
      throw new BadRequestException('History record has no restorable content');
    }

    if (!Array.isArray(document.content)) {
      throw new BadRequestException('Current document has no Yjs snapshot');
    }

    return {
      history: {
        id: history.id,
        version: history.version,
        action: history.action,
        summary: history.summary,
        sourceVersion: history.sourceVersion,
        createdAt: history.createdAt,
        user: history.user,
        update: history.content,
      },
      current: {
        documentId: document.id,
        version: document.version,
        updatedAt: document.updatedAt,
        update: document.content,
      },
      yjs: {
        type: 'tiptap',
        field: field?.trim() || 'default',
      },
      note: 'Frontend must recreate Y.Doc instances from these updates and use the same Tiptap extensions/schema to render or diff rich text.',
    };
  }

  // 记录一次原始的 Yjs update，便于审计或调试。
  // 注意：这不是文档快照，而是每次编辑产生的增量，字段 update 会以 number[] 保存。
  async logDocumentUpdate(
    docId: number | string,
    userId: number | string | null | undefined,
    update: Uint8Array,
  ) {
    const documentId = this.normalizeId(docId);
    const normalizedUserId =
      userId === undefined || userId === null ? null : this.normalizeId(userId);

    return this.prisma.documentUpdate.create({
      data: {
        documentId,
        userId: normalizedUserId,
        update: Array.from(update),
        byteLength: update.byteLength,
      },
    });
  }

  // 将文档恢复到指定历史版本。
  // 这里不会把旧快照直接 applyUpdate 到正在运行的 CRDT 实例，
  // 而是更新数据库中的文档快照，再通过事件通知网关丢弃并重建内存房间。
  async rollbackDocumentToHistory(
    docId: number | string,
    userId: number | string,
    historyId: number | string,
    summary?: string | null,
  ) {
    const documentId = this.normalizeId(docId);
    const normalizedUserId = this.normalizeId(userId);
    const normalizedHistoryId = this.normalizeId(historyId);

    await this.validateDocumentAccess(documentId, normalizedUserId, 'write');

    const sourceHistory = await this.prisma.documentHistory.findFirst({
      where: {
        id: normalizedHistoryId,
        documentId,
      },
    });

    if (!sourceHistory) {
      throw new NotFoundException('History record not found');
    }

    if (!sourceHistory.content) {
      throw new BadRequestException('History record has no restorable content');
    }

    const rollbackSummary =
      summary?.trim() || `Rollback to version ${sourceHistory.version}`;

    // 用事务保证：文档快照、会话状态和新的 rollback 历史记录同时成功。
    const result = await this.prisma.$transaction(async (tx) => {
      const document = await tx.document.update({
        where: { id: documentId },
        data: {
          content: sourceHistory.content,
          version: {
            increment: 1,
          },
        },
        select: {
          id: true,
          title: true,
          summary: true,
          status: true,
          updatedAt: true,
          version: true,
        },
      });

      await tx.collaborationSession.updateMany({
        where: {
          documentId,
          isActive: true,
        },
        data: {
          isActive: false,
          lastSeen: new Date(),
        },
      });

      const rollbackHistory = await tx.documentHistory.create({
        data: {
          documentId,
          userId: normalizedUserId,
          version: document.version,
          action: 'rollback',
          summary: rollbackSummary,
          content: sourceHistory.content,
          sourceVersion: sourceHistory.version,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              account: true,
            },
          },
        },
      });

      const { content, ...historyWithoutContent } = rollbackHistory;

      return {
        document,
        rollbackHistory: {
          ...historyWithoutContent,
          contentSize: Array.isArray(content) ? content.length : 0,
        },
        sourceHistoryId: sourceHistory.id,
        sourceVersion: sourceHistory.version,
      };
    });

    this.logger.log(
      `Rolled back doc=${documentId} by user=${normalizedUserId} to version=${sourceHistory.version}, newVersion=${result.document.version}`,
    );

    // 通知各网关关闭旧房间，客户端会使用 4409/document_rolled_back 重新加载。
    this.clearDocumentConnectionRefs(documentId);
    this.roomEvents.emitDocumentRolledBack({
      documentId,
      version: result.document.version,
      sourceVersion: result.sourceVersion,
      historyId: result.rollbackHistory.id,
      userId: normalizedUserId,
    });

    return result;
  }

  // 兼容 y-websocket persistence 接口的方法：返回原始文档记录。
  async getLocalData(id: number | string) {
    return this.getDocument(id);
  }

  // 读取单条文档记录，包含 content 快照和版本信息。
  async getDocument(id: number | string) {
    const documentId = this.normalizeId(id);
    const document = await this.prisma.document.findUnique({
      where: {
        id: documentId,
      },
    });

    this.logger.debug(
      `Loaded document doc=${documentId}, found=${document ? 'yes' : 'no'}`,
    );

    return document;
  }

  // 读取文档并把 JSON 快照解码为 Yjs 可应用的 Uint8Array。
  async getDocumentUpdate(id: number | string): Promise<Uint8Array | null> {
    const document = await this.getDocument(id);
    if (!document) {
      return null;
    }

    return this.decodeState(document.content as StoredYDocState);
  }

  // 根据传入 id 初始化一个已存在的文档，当前实现不会真正创建新记录，
  // 只是完成 id 校验、文档存在性检查和写权限校验。
  async createDocument(input: CreateDocumentInput) {
    const requestedId = input.id ?? input.documentId ?? input.docId;

    if (requestedId === undefined || requestedId === null) {
      throw new BadRequestException(
        'document id is required. Use POST /document/create to create a new document.',
      );
    }

    const documentId = this.normalizeId(requestedId);
    const requesterId = this.normalizeId(input.createdBy ?? 1);
    const existingDocument = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!existingDocument) {
      throw new NotFoundException('Document not found');
    }

    await this.validateDocumentAccess(documentId, requesterId, 'write');

    this.logger.log(
      `Initialized existing document doc=${existingDocument.id}, title="${existingDocument.title}", createdBy=${existingDocument.createdBy}`,
    );

    return existingDocument;
  }

  // 统一的文档访问校验：
  // 创建者拥有最高权限；其他用户需要是协作者，viewer 只能 read。
  async validateDocumentAccess(
    docId: number | string,
    userId: number | string,
    requiredAccess: DocumentAccessLevel = 'write',
  ) {
    const documentId = this.normalizeId(docId);
    const normalizedUserId = this.normalizeId(userId);
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        createdBy: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // 创建者直接放行，后续的写权限不需要再查协作者表。
    if (document.createdBy === normalizedUserId) {
      return document;
    }

    // 非创建者必须存在于协作者表中，否则没有访问权限。
    const collaborator = await this.prisma.documentCollaborator.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId: normalizedUserId,
        },
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!collaborator) {
      throw new ForbiddenException('No permission to access this document');
    }

    if (requiredAccess === 'write' && collaborator.role !== 'editor') {
      throw new ForbiddenException('viewer role is read-only');
    }

    return document;
  }

  // 查询该文档最近一条协作会话的 id，主要用于旧协议兼容。
  async getSessionInfo(docId: number | string) {
    const res = await this.prisma.collaborationSession.findFirst({
      where: {
        documentId: this.normalizeId(docId),
      },
      orderBy: {
        lastSeen: 'desc',
      },
    });

    return res?.id;
  }

  // 为指定文档和用户创建一条协作会话记录。
  async createSessionRoom(docId: number | string, userId: number | string) {
    return this.prisma.collaborationSession.create({
      data: {
        documentId: this.normalizeId(docId),
        userId: this.normalizeId(userId),
      },
    });
  }

  // 连接进入协作房间时维护在线状态：
  // 先校验写权限，再增加内存引用计数；同一用户已有连接时只加计数，不重复 upsert 会话。
  async handleSessionRoom(docId: number | string, userId: number | string) {
    const documentId = this.normalizeId(docId);
    const normalizedUserId = this.normalizeId(userId);
    await this.validateDocumentAccess(documentId, normalizedUserId, 'write');

    const docKey = documentId.toString();
    const userKey = normalizedUserId.toString();
    const userRefs = this.getDocumentConnectionRefs(docKey);
    const currentRefs = userRefs.get(userKey) ?? 0;
    userRefs.set(userKey, currentRefs + 1);

    // 已有同用户连接时只增加引用计数，避免多标签页重复写会话。
    if (currentRefs > 0) {
      this.logger.debug(
        `Incremented collaboration connection refs doc=${documentId}, user=${normalizedUserId}, refs=${currentRefs + 1}`,
      );
      return { changed: false };
    }

    try {
      this.logger.log(
        `Upserting collaboration session doc=${documentId}, user=${normalizedUserId}`,
      );

      const session = await this.prisma.collaborationSession.upsert({
        where: {
          documentId_userId: {
            documentId,
            userId: normalizedUserId,
          },
        },
        update: {
          isActive: true,
          lastSeen: new Date(),
        },
        create: {
          documentId,
          userId: normalizedUserId,
          isActive: true,
          lastSeen: new Date(),
        },
      });

      this.logger.log(
        `Session ready id=${session.id}, doc=${documentId}, user=${normalizedUserId}, active=${session.isActive}`,
      );

      return { changed: true, session };
    } catch (error) {
      this.decrementConnectionRef(docKey, userKey);
      throw error;
    }
  }

  // 获取文档当前在线用户列表，供 presence 广播使用。
  async getActiveSessions(docId: number | string, userId: number | string) {
    const documentId = this.normalizeId(docId);
    await this.validateDocumentAccess(documentId, userId, 'read');

    return this.prisma.collaborationSession.findMany({
      where: {
        documentId,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
      },
      orderBy: {
        lastSeen: 'desc',
      },
    });
  }

  // 连接断开时扣减引用计数；只有该用户的最后一个连接断开时才把会话标记为离线。
  async markSessionDisconnected(
    docId: number | string,
    userId: number | string,
  ) {
    const documentId = this.normalizeId(docId);
    const normalizedUserId = this.normalizeId(userId);
    const docKey = documentId.toString();
    const userKey = normalizedUserId.toString();
    const remainingRefs = this.decrementConnectionRef(docKey, userKey);

    // 还有其他标签页在线，不修改数据库中的在线状态。
    if (remainingRefs > 0) {
      this.logger.debug(
        `Decremented collaboration connection refs doc=${documentId}, user=${normalizedUserId}, refs=${remainingRefs}`,
      );
      return { changed: false, result: { count: 0 } };
    }

    this.logger.log(
      `Marking session disconnected doc=${documentId}, user=${normalizedUserId}`,
    );

    const result = await this.prisma.collaborationSession.updateMany({
      where: {
        documentId,
        userId: normalizedUserId,
      },
      data: {
        isActive: false,
        lastSeen: new Date(),
      },
    });

    this.logger.log(
      `Marked disconnected doc=${documentId}, user=${normalizedUserId}, updated=${result.count}`,
    );

    return { changed: true, result };
  }

  // 兼容 y-websocket persistence 接口的写回方法。
  async setLocalData(id: number | string, doc: Y.Doc) {
    return this.saveSnapshot(id, doc);
  }

  // 清除某个文档的全部内存连接引用，通常在回滚或权限变更后调用。
  clearDocumentConnectionRefs(docId: number | string) {
    this.activeConnectionRefs.delete(this.normalizeId(docId).toString());
  }

  // 获取文档对应的用户引用计数表，不存在时自动创建。
  private getDocumentConnectionRefs(docKey: string) {
    let userRefs = this.activeConnectionRefs.get(docKey);

    if (!userRefs) {
      userRefs = new Map<string, number>();
      this.activeConnectionRefs.set(docKey, userRefs);
    }

    return userRefs;
  }

  // 用户连接引用减一；最后一个引用被移除时清理空 Map，返回剩余引用数。
  private decrementConnectionRef(docKey: string, userKey: string) {
    const userRefs = this.activeConnectionRefs.get(docKey);

    if (!userRefs) {
      return 0;
    }

    const currentRefs = userRefs.get(userKey) ?? 0;

    if (currentRefs <= 1) {
      userRefs.delete(userKey);

      if (userRefs.size === 0) {
        this.activeConnectionRefs.delete(docKey);
      }

      return 0;
    }

    const nextRefs = currentRefs - 1;
    userRefs.set(userKey, nextRefs);
    return nextRefs;
  }
}
