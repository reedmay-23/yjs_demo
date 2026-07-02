import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createSuccessResponse } from '../../common/utils/api-response.util';
import { PrismaService } from '../prisma/prisma.service';
import { YjsStorageService } from '../yjs-storage/yjs-storage.service';
import { AddCollaboratorDto } from './dto/add-collaborator.dto';
import { CreateDocumentDto } from './dto/create-document.dto';

@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly yjsStorageService: YjsStorageService,
  ) {}

  async create(userId: number, createDocumentDto: CreateDocumentDto) {
    const { title } = createDocumentDto;
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
      ...document,
      role:
        document.createdBy === userId
          ? 'owner'
          : (documentCollaborators[0]?.role ?? 'editor'),
    }));

    return createSuccessResponse(res, {
      message: '获取文档列表成功',
    });
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
    const collaboratorUserId = this.normalizeRequestId(
      addCollaboratorDto.userId,
      'userId',
    );
    const role = addCollaboratorDto.role ?? 'editor';

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
    await this.yjsStorageService.validateDocumentAccess(documentId, userId);

    const res = await this.prisma.documentCollaborator.findMany({
      where: {
        documentId,
      },
      select: {
        id: true,
        documentId: true,
        userId: true,
        role: true,
        createdAt: true,
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
    });

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

    return createSuccessResponse(res, {
      message: '移除协作者成功',
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
}
