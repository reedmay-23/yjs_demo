import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as Y from 'yjs';
import { PrismaService } from '../prisma/prisma.service';

type StoredYDocState =
  | number[]
  | {
      update?: number[];
      state?: number[];
    }
  | null;

type CreateDocumentInput = {
  id?: number | string;
  title?: string;
  createdBy?: number | string;
  content?: number[];
};

@Injectable()
export class YjsStorageService {
  private readonly logger = new Logger(YjsStorageService.name);

  constructor(private readonly prisma: PrismaService) {}

  normalizeId(id: number | string): number {
    // WebSocket 和 HTTP 参数大多是字符串，这里统一收敛成数据库使用的数字主键。
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

  createEmptyState(): number[] {
    // 新文档默认保存一份空白 Y.Doc 的完整状态，便于后续统一恢复流程。
    return Array.from(Y.encodeStateAsUpdate(new Y.Doc()));
  }

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

  encodeState(doc: Y.Doc): number[] {
    // Prisma 当前字段是 JsonB，所以把二进制状态转成 number[] 再持久化。
    return Array.from(Y.encodeStateAsUpdate(doc));
  }

  async saveSnapshot(id: number | string, doc: Y.Doc) {
    const documentId = this.normalizeId(id);
    // 每次保存都重新编码整份状态，确保数据库快照可直接恢复出完整文档。
    const content = this.encodeState(doc);

    this.logger.log(
      `Saving snapshot for doc=${documentId}, bytes=${content.length}`,
    );

    const document = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        content,
        version: {
          increment: 1,
        },
      },
    });

    this.logger.log(
      `Saved snapshot for doc=${documentId}, version=${document.version}`,
    );

    return document;
  }

  async getLocalData(id: number | string) {
    return this.getDocument(id);
  }

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

  async getDocumentUpdate(id: number | string): Promise<Uint8Array | null> {
    const document = await this.getDocument(id);
    if (!document) {
      return null;
    }

    // 从 JsonB 中取出 number[] 后再还原成 Yjs 可消费的 Uint8Array。
    return this.decodeState(document.content as StoredYDocState);
  }

  async createDocument(input: CreateDocumentInput) {
    // 未传内容时自动创建一份空白 Yjs 状态，避免后续首次加载时无快照可恢复。
    const content = input.content ?? this.createEmptyState();
    const createdBy = this.normalizeId(input.createdBy ?? 1);
    const user = await this.prisma.user.findUnique({
      where: { id: createdBy },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('用户不存在，无法创建文档');
    }

    const document = await this.prisma.document.create({
      data: {
        ...(input.id ? { id: this.normalizeId(input.id) } : {}),
        title: input.title?.trim() || 'Untitled document',
        createdBy,
        content,
      },
    });

    this.logger.log(
      `Created document doc=${document.id}, title="${document.title}", createdBy=${document.createdBy}`,
    );

    return document;
  }

  async validateDocumentAccess(docId: number | string, userId: number | string) {
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
      throw new NotFoundException('文档不存在');
    }

    if (document.createdBy === normalizedUserId) {
      return document;
    }

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

    if (!collaborator || collaborator.role !== 'editor') {
      throw new ForbiddenException('无权限访问该文档');
    }

    return document;
  }

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

  async createSessionRoom(docId: number | string, userId: number | string) {
    return this.prisma.collaborationSession.create({
      data: {
        documentId: this.normalizeId(docId),
        userId: this.normalizeId(userId),
      },
    });
  }

  async handleSessionRoom(docId: number | string, userId: number | string) {
    const documentId = this.normalizeId(docId);
    const normalizedUserId = this.normalizeId(userId);

    await this.validateDocumentAccess(documentId, normalizedUserId);

    this.logger.log(
      `Upserting collaboration session doc=${documentId}, user=${normalizedUserId}`,
    );

    // 用 upsert 保证“进入房间”这个动作具备幂等性：重复进入只刷新在线状态。
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

    return session;
  }

  async getActiveSessions(docId: number | string, userId: number | string) {
    const documentId = this.normalizeId(docId);
    await this.validateDocumentAccess(documentId, userId);

    const res = await this.prisma.collaborationSession.findMany({
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

    return res;
  }

  async markSessionDisconnected(
    docId: number | string,
    userId: number | string,
  ) {
    const documentId = this.normalizeId(docId);
    const normalizedUserId = this.normalizeId(userId);

    // 断开连接时不删会话，只更新在线状态和最后活跃时间。
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

    return result;
  }

  async setLocalData(id: number | string, doc: Y.Doc) {
    return this.saveSnapshot(id, doc);
  }
}
