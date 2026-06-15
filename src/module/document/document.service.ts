import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createSuccessResponse } from '../../common/utils/api-response.util';
import { PrismaService } from '../prisma/prisma.service';
import { YjsStorageService } from '../yjs-storage/yjs-storage.service';
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
    const res = await this.prisma.document.findMany({
      where: {
        createdBy: userId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

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
}
