import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as Y from 'yjs';
import { createSuccessResponse } from '../../common/utils/api-response.util';
import { PrismaService } from '../prisma/prisma.service';
import { YjsRoomEventsService } from '../yjs-storage/yjs-room-events.service';
import { YjsStorageService } from '../yjs-storage/yjs-storage.service';
import {
  AddCollaboratorDto,
  DocumentCollaboratorRole,
} from './dto/add-collaborator.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import {
  CompareHistorySnapshotDto,
  GetDocumentHistoryDto,
  ManualSnapshotDto,
  RollbackDocumentDto,
} from './dto/document-history.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly yjsStorageService: YjsStorageService,
    private readonly roomEvents: YjsRoomEventsService,
  ) {}

  async create(userId: number, createDocumentDto: CreateDocumentDto) {
    const { summary, title } = createDocumentDto;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('用户不存在，无法创建文档');
    }

    const res = await this.prisma.document.create({
      data: {
        content: this.yjsStorageService.createEmptyState(),
        createdBy: userId,
        status: createDocumentDto.status ?? 'active',
        summary: summary?.trim() || null,
        title: title?.trim() || 'Untitled document',
      },
      include: {
        creator: true,
      },
    });

    return createSuccessResponse(res, {
      message: '文档创建成功',
    });
  }

  async getList(userId: number) {
    const documents = await this.prisma.document.findMany({
      where: {
        OR: [
          { createdBy: userId },
          {
            documentCollaborators: {
              some: {
                userId,
              },
            },
          },
        ],
      },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
        documentCollaborators: {
          where: {
            userId,
          },
          select: {
            role: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const res = documents.map(({ documentCollaborators, ...document }) => ({
      id: document.id,
      title: document.title,
      summary: document.summary,
      status: document.status,
      createdBy: document.createdBy,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      version: document.version,
      owner: document.creator,
      creator: document.creator,
      role:
        document.createdBy === userId
          ? 'owner'
          : (documentCollaborators[0]?.role ?? 'editor'),
    }));

    return createSuccessResponse(res, {
      message: '获取文档列表成功',
    });
  }

  async getDetail(userId: number, id: number | string) {
    const documentId = this.yjsStorageService.normalizeId(id);
    await this.yjsStorageService.validateDocumentAccess(
      documentId,
      userId,
      'read',
    );

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
        documentCollaborators: {
          select: {
            id: true,
            documentId: true,
            userId: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: {
                id: true,
                username: true,
                account: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return createSuccessResponse(
      {
        id: document.id,
        title: document.title,
        summary: document.summary,
        owner: document.creator,
        role: this.resolveDocumentRole(document, userId),
        status: document.status,
        updatedAt: document.updatedAt,
        createdAt: document.createdAt,
        version: document.version,
        collaborators: this.buildCollaboratorList(document),
      },
      {
        message: '获取文档详情成功',
      },
    );
  }

  async readContent(userId: number, id: number | string) {
    const documentId = this.yjsStorageService.normalizeId(id);
    await this.yjsStorageService.validateDocumentAccess(
      documentId,
      userId,
      'read',
    );

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        updatedAt: true,
        version: true,
        content: true,
        createdBy: true,
        documentCollaborators: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const ydoc = new Y.Doc();
    const update = this.yjsStorageService.decodeState(document.content as any);

    if (update?.length) {
      Y.applyUpdate(ydoc, update);
    }

    const text = ydoc.getText('document').toString();
    ydoc.destroy();

    return createSuccessResponse(
      {
        id: document.id,
        title: document.title,
        summary: document.summary,
        status: document.status,
        updatedAt: document.updatedAt,
        version: document.version,
        role:
          document.createdBy === userId
            ? 'owner'
            : (document.documentCollaborators[0]?.role ?? 'viewer'),
        content: {
          type: 'text',
          text,
        },
      },
      {
        message: '读取文档内容成功',
      },
    );
  }

  async updateMetadata(userId: number, updateDocumentDto: UpdateDocumentDto) {
    const documentId = this.normalizeRequestId(updateDocumentDto.id, 'id');
    await this.yjsStorageService.validateDocumentAccess(
      documentId,
      userId,
      'write',
    );

    const data: {
      title?: string;
      summary?: string | null;
      status?: 'active' | 'archived';
    } = {};

    if (updateDocumentDto.title !== undefined) {
      const title = updateDocumentDto.title.trim();
      if (!title) {
        throw new BadRequestException('title cannot be empty');
      }
      data.title = title;
    }

    if (updateDocumentDto.summary !== undefined) {
      data.summary = updateDocumentDto.summary.trim() || null;
    }

    if (updateDocumentDto.status !== undefined) {
      data.status = updateDocumentDto.status;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No metadata fields to update');
    }

    const res = await this.prisma.document.update({
      where: { id: documentId },
      data,
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        updatedAt: true,
        version: true,
      },
    });

    return createSuccessResponse(res, {
      message: '更新文档元数据成功',
    });
  }

  async getHistory(userId: number, dto: GetDocumentHistoryDto) {
    const histories = await this.yjsStorageService.getDocumentHistories(
      dto.documentId,
      userId,
    );

    return createSuccessResponse(histories, {
      message: '获取文档历史记录成功',
    });
  }

  async rollback(userId: number, dto: RollbackDocumentDto) {
    const res = await this.yjsStorageService.rollbackDocumentToHistory(
      dto.documentId,
      userId,
      dto.historyId,
      dto.summary,
    );

    return createSuccessResponse(res, {
      message: '文档版本回退成功',
    });
  }

  async createManualSnapshot(userId: number, dto: ManualSnapshotDto) {
    const res = await this.yjsStorageService.createManualSnapshot(
      dto.documentId,
      userId,
      dto.summary,
    );

    return createSuccessResponse(res, {
      message: '手动保存历史版本成功',
    });
  }

  async compareHistorySnapshot(
    userId: number,
    dto: CompareHistorySnapshotDto,
  ) {
    const res = await this.yjsStorageService.getHistoryCompareSnapshot(
      dto.documentId,
      userId,
      dto.historyId,
      dto.field,
    );

    return createSuccessResponse(res, {
      message: '获取历史对比快照成功',
    });
  }

  async getStatistics(userId: number) {
    const visibleDocumentWhere = {
      OR: [
        { createdBy: userId },
        {
          documentCollaborators: {
            some: {
              userId,
            },
          },
        },
      ],
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalDocuments, todayUpdatedDocuments, onlineCollaborators] =
      await Promise.all([
        this.prisma.document.count({
          where: visibleDocumentWhere,
        }),
        this.prisma.document.count({
          where: {
            ...visibleDocumentWhere,
            updatedAt: {
              gte: today,
            },
          },
        }),
        this.prisma.collaborationSession.count({
          where: {
            isActive: true,
            document: visibleDocumentWhere,
          },
        }),
      ]);

    return createSuccessResponse(
      {
        totalDocuments,
        todayUpdatedDocuments,
        onlineCollaborators,
      },
      {
        message: '获取文档统计成功',
      },
    );
  }

  async remove(userId: number, id: number | string) {
    const documentId = this.yjsStorageService.normalizeId(id);
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

    // 关键校验：只允许文档创建者删除自己的文档。
    if (document.createdBy !== userId) {
      throw new ForbiddenException('无权限删除该文档');
    }

    const res = await this.prisma.document.delete({
      where: {
        id: documentId,
      },
    });

    return createSuccessResponse(res, {
      message: '删除文档成功',
    });
  }

  async addCollaborator(
    ownerId: number,
    docId: number | string,
    addCollaboratorDto: AddCollaboratorDto,
  ) {
    const documentId = this.normalizeRequestId(docId, 'documentId');
    const collaboratorUserId =
      await this.resolveCollaboratorUserId(addCollaboratorDto);
    const role = this.normalizeRole(addCollaboratorDto.role);

    if (collaboratorUserId === ownerId) {
      throw new BadRequestException('不能把文档创建者添加为协作者');
    }

    await this.ensureDocumentOwner(documentId, ownerId);

    const user = await this.prisma.user.findUnique({
      where: { id: collaboratorUserId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('用户不存在，无法添加协作者');
    }

    const existed = await this.prisma.documentCollaborator.findFirst({
      where: {
        documentId,
        userId: collaboratorUserId,
      },
      select: { id: true },
    });

    if (existed) {
      throw new ConflictException('该用户已经是文档协作者');
    }

    const res = await this.prisma.documentCollaborator.create({
      data: {
        documentId,
        userId: collaboratorUserId,
        role,
        createdBy: ownerId,
      },
      select: {
        id: true,
        documentId: true,
        userId: true,
        role: true,
        createdBy: true,
        createdAt: true,
      },
    });

    return createSuccessResponse(res, {
      message: '添加协作者成功',
    });
  }

  async getCollaborators(userId: number, docId: number | string) {
    const documentId = this.yjsStorageService.normalizeId(docId);
    await this.yjsStorageService.validateDocumentAccess(
      documentId,
      userId,
      'read',
    );

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
        documentCollaborators: {
          select: {
            id: true,
            documentId: true,
            userId: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            user: {
              select: {
                id: true,
                username: true,
                account: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const res = this.buildCollaboratorList(document);

    return createSuccessResponse(res, {
      message: '获取协作者列表成功',
    });
  }

  async removeCollaborator(
    ownerId: number,
    docId: number | string,
    userId: number | string,
  ) {
    const documentId = this.normalizeRequestId(docId, 'documentId');
    const collaboratorUserId = this.normalizeRequestId(userId, 'userId');
    const document = await this.ensureDocumentOwner(documentId, ownerId);

    if (document.createdBy === collaboratorUserId) {
      throw new BadRequestException('不能通过协作者接口移除文档创建者');
    }

    const collaborator = await this.prisma.documentCollaborator.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId: collaboratorUserId,
        },
      },
      select: { id: true },
    });

    if (!collaborator) {
      throw new NotFoundException('协作者不存在');
    }

    const res = await this.prisma.documentCollaborator.delete({
      where: {
        documentId_userId: {
          documentId,
          userId: collaboratorUserId,
        },
      },
    });

    this.roomEvents.emitDocumentAccessChanged({
      documentId,
      userId: collaboratorUserId,
      reason: 'collaborator_removed',
    });

    return createSuccessResponse(res, {
      message: '移除协作者成功',
    });
  }

  async updateCollaboratorRole(
    ownerId: number,
    docId: number | string,
    userId: number | string,
    role: DocumentCollaboratorRole,
  ) {
    const documentId = this.normalizeRequestId(docId, 'documentId');
    const collaboratorUserId = this.normalizeRequestId(userId, 'userId');
    const nextRole = this.normalizeRole(role);
    const document = await this.ensureDocumentOwner(documentId, ownerId);

    if (document.createdBy === collaboratorUserId) {
      throw new BadRequestException('owner role cannot be changed here');
    }

    const collaborator = await this.prisma.documentCollaborator.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId: collaboratorUserId,
        },
      },
      select: { id: true },
    });

    if (!collaborator) {
      throw new NotFoundException('collaborator not found');
    }

    const res = await this.prisma.documentCollaborator.update({
      where: {
        documentId_userId: {
          documentId,
          userId: collaboratorUserId,
        },
      },
      data: {
        role: nextRole,
      },
      select: {
        id: true,
        documentId: true,
        userId: true,
        role: true,
        updatedAt: true,
      },
    });

    if (nextRole !== 'editor') {
      this.roomEvents.emitDocumentAccessChanged({
        documentId,
        userId: collaboratorUserId,
        reason: 'permission_changed',
      });
    }

    return createSuccessResponse(res, {
      message: '更新协作者角色成功',
    });
  }

  private async ensureDocumentOwner(documentId: number, userId: number) {
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

    if (document.createdBy !== userId) {
      throw new ForbiddenException('只有文档创建者可以管理协作者');
    }

    return document;
  }

  private async resolveCollaboratorUserId(
    addCollaboratorDto: AddCollaboratorDto,
  ) {
    const account = addCollaboratorDto.account?.trim();

    if (addCollaboratorDto.account !== undefined) {
      if (!account) {
        throw new BadRequestException('account is required');
      }

      const user = await this.prisma.user.findFirst({
        where: { account },
        select: { id: true },
      });

      if (!user) {
        throw new NotFoundException('user account not found');
      }

      return user.id;
    }

    return this.normalizeRequestId(
      addCollaboratorDto.userId,
      'userId or account',
    );
  }

  private normalizeRequestId(
    value: number | string | null | undefined,
    fieldName: string,
  ) {
    if (value === null || value === undefined) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    if (typeof value === 'string' && value.trim() === '') {
      throw new BadRequestException(`${fieldName} is required`);
    }

    try {
      return this.yjsStorageService.normalizeId(value);
    } catch {
      throw new BadRequestException(`${fieldName} must be a valid numeric id`);
    }
  }

  private resolveDocumentRole(
    document: {
      createdBy: number;
      documentCollaborators?: Array<{ userId: number; role: string }>;
    },
    userId: number,
  ) {
    if (document.createdBy === userId) {
      return 'owner';
    }

    return (
      document.documentCollaborators?.find(
        (collaborator) => collaborator.userId === userId,
      )?.role ?? 'viewer'
    );
  }

  private buildCollaboratorList(document: {
    id: number;
    createdBy: number;
    creator: {
      id: number;
      username: string;
      account: string;
    };
    documentCollaborators: Array<{
      id: number;
      documentId: number;
      userId: number;
      role: string;
      createdAt: Date;
      updatedAt: Date;
      user: {
        id: number;
        username: string;
        account: string;
      };
    }>;
  }) {
    return [
      {
        id: null,
        documentId: document.id,
        userId: document.createdBy,
        role: 'owner',
        user: document.creator,
        createdAt: null,
        updatedAt: null,
      },
      ...document.documentCollaborators.map((collaborator) => ({
        id: collaborator.id,
        documentId: collaborator.documentId,
        userId: collaborator.userId,
        role: collaborator.role,
        user: collaborator.user,
        createdAt: collaborator.createdAt,
        updatedAt: collaborator.updatedAt,
      })),
    ];
  }

  private normalizeRole(
    role: DocumentCollaboratorRole | null | undefined,
  ): DocumentCollaboratorRole {
    const normalized = role ?? 'editor';

    if (normalized !== 'viewer' && normalized !== 'editor') {
      throw new BadRequestException('role must be viewer or editor');
    }

    return normalized;
  }
}
