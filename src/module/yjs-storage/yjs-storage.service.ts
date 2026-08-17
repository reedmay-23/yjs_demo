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

type CreateDocumentInput = {
  id?: number | string;
  docId?: number | string;
  documentId?: number | string;
  title?: string;
  createdBy?: number | string;
  content?: number[];
};

export type DocumentAccessLevel = 'read' | 'write';

@Injectable()
export class YjsStorageService {
  private static readonly EDIT_HISTORY_MERGE_WINDOW_MS = 5 * 60 * 1000;
  private readonly logger = new Logger(YjsStorageService.name);
  private readonly activeConnectionRefs = new Map<string, Map<string, number>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly roomEvents: YjsRoomEventsService,
  ) {}

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

  createEmptyState(): number[] {
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
    return Array.from(Y.encodeStateAsUpdate(doc));
  }

  async saveSnapshot(id: number | string, doc: Y.Doc) {
    return this.saveSnapshotByUser(id, doc);
  }

  async saveSnapshotByUser(
    id: number | string,
    doc: Y.Doc,
    userId?: number | string | null,
  ) {
    const documentId = this.normalizeId(id);
    const content = this.encodeState(doc);
    const normalizedUserId =
      userId === undefined || userId === null
        ? null
        : this.normalizeId(userId);

    this.logger.log(
      `Saving snapshot for doc=${documentId}, bytes=${content.length}`,
    );

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
      note:
        'Frontend must recreate Y.Doc instances from these updates and use the same Tiptap extensions/schema to render or diff rich text.',
    };
  }

  async logDocumentUpdate(
    docId: number | string,
    userId: number | string | null | undefined,
    update: Uint8Array,
  ) {
    const documentId = this.normalizeId(docId);
    const normalizedUserId =
      userId === undefined || userId === null
        ? null
        : this.normalizeId(userId);

    return this.prisma.documentUpdate.create({
      data: {
        documentId,
        userId: normalizedUserId,
        update: Array.from(update),
        byteLength: update.byteLength,
      },
    });
  }

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

    return this.decodeState(document.content as StoredYDocState);
  }

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

    if (!collaborator) {
      throw new ForbiddenException('No permission to access this document');
    }

    if (requiredAccess === 'write' && collaborator.role !== 'editor') {
      throw new ForbiddenException('viewer role is read-only');
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
    await this.validateDocumentAccess(documentId, normalizedUserId, 'write');

    const docKey = documentId.toString();
    const userKey = normalizedUserId.toString();
    const userRefs = this.getDocumentConnectionRefs(docKey);
    const currentRefs = userRefs.get(userKey) ?? 0;
    userRefs.set(userKey, currentRefs + 1);

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

  async markSessionDisconnected(
    docId: number | string,
    userId: number | string,
  ) {
    const documentId = this.normalizeId(docId);
    const normalizedUserId = this.normalizeId(userId);
    const docKey = documentId.toString();
    const userKey = normalizedUserId.toString();
    const remainingRefs = this.decrementConnectionRef(docKey, userKey);

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

  async setLocalData(id: number | string, doc: Y.Doc) {
    return this.saveSnapshot(id, doc);
  }

  clearDocumentConnectionRefs(docId: number | string) {
    this.activeConnectionRefs.delete(this.normalizeId(docId).toString());
  }

  private getDocumentConnectionRefs(docKey: string) {
    let userRefs = this.activeConnectionRefs.get(docKey);

    if (!userRefs) {
      userRefs = new Map<string, number>();
      this.activeConnectionRefs.set(docKey, userRefs);
    }

    return userRefs;
  }

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
