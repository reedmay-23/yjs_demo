import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createSuccessResponse } from '../../../common/utils/api-response.util';
import {
  CreateWhiteboardDto,
  UpdateWhiteboardDto,
  AddWhiteboardElementDto,
  UpdateWhiteboardElementDto,
} from './dto/whiteboard.dto';

@Injectable()
export class WhiteboardService {
  private readonly logger = new Logger(WhiteboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建新白板
   */
  async create(userId: number, dto: CreateWhiteboardDto) {
    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(dto.documentId, userId, 'write');

    const whiteboard = await this.prisma.whiteboard.create({
      data: {
        documentId: dto.documentId,
        title: dto.title || 'Untitled Whiteboard',
        description: dto.description,
        content: {}, // 初始空内容
        createdBy: userId,
      },
    });

    this.logger.log(
      `Created whiteboard ${whiteboard.id} for document ${dto.documentId}`,
    );

    return createSuccessResponse(whiteboard, {
      message: '白板创建成功',
    });
  }

  /**
   * 获取白板详情
   */
  async findOne(userId: number, whiteboardId: number) {
    const whiteboard = await this.prisma.whiteboard.findUnique({
      where: { id: whiteboardId },
      include: {
        elements: {
          orderBy: { zIndex: 'asc' },
        },
      },
    });

    if (!whiteboard) {
      throw new NotFoundException('白板不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(whiteboard.documentId, userId, 'read');

    return createSuccessResponse(whiteboard, {
      message: '获取白板详情成功',
    });
  }

  /**
   * 获取文档下的所有白板
   */
  async findByDocument(userId: number, documentId: number) {
    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(documentId, userId, 'read');

    const whiteboards = await this.prisma.whiteboard.findMany({
      where: { documentId },
      include: {
        _count: {
          select: { elements: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return createSuccessResponse(whiteboards, {
      message: '获取白板列表成功',
    });
  }

  /**
   * 更新白板信息
   */
  async update(userId: number, whiteboardId: number, dto: UpdateWhiteboardDto) {
    const whiteboard = await this.prisma.whiteboard.findUnique({
      where: { id: whiteboardId },
    });

    if (!whiteboard) {
      throw new NotFoundException('白板不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(whiteboard.documentId, userId, 'write');

    const updatedWhiteboard = await this.prisma.whiteboard.update({
      where: { id: whiteboardId },
      data: {
        title: dto.title,
        description: dto.description,
        version: { increment: 1 },
      },
    });

    this.logger.log(`Updated whiteboard ${whiteboardId}`);

    return createSuccessResponse(updatedWhiteboard, {
      message: '白板更新成功',
    });
  }

  /**
   * 删除白板
   */
  async remove(userId: number, whiteboardId: number) {
    const whiteboard = await this.prisma.whiteboard.findUnique({
      where: { id: whiteboardId },
    });

    if (!whiteboard) {
      throw new NotFoundException('白板不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(whiteboard.documentId, userId, 'write');

    await this.prisma.whiteboard.delete({
      where: { id: whiteboardId },
    });

    this.logger.log(`Deleted whiteboard ${whiteboardId}`);

    return createSuccessResponse(null, {
      message: '白板删除成功',
    });
  }

  /**
   * 添加白板元素
   */
  async addElement(
    userId: number,
    whiteboardId: number,
    dto: AddWhiteboardElementDto,
  ) {
    const whiteboard = await this.prisma.whiteboard.findUnique({
      where: { id: whiteboardId },
    });

    if (!whiteboard) {
      throw new NotFoundException('白板不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(whiteboard.documentId, userId, 'write');

    const element = await this.prisma.whiteboardElement.create({
      data: {
        whiteboardId,
        elementType: dto.elementType,
        properties: dto.properties,
        zIndex: dto.zIndex || 0,
        createdBy: userId,
      },
    });

    // 更新白板版本
    await this.prisma.whiteboard.update({
      where: { id: whiteboardId },
      data: { version: { increment: 1 } },
    });

    this.logger.log(
      `Added element ${element.id} to whiteboard ${whiteboardId}`,
    );

    return createSuccessResponse(element, {
      message: '元素添加成功',
    });
  }

  /**
   * 更新白板元素
   */
  async updateElement(
    userId: number,
    whiteboardId: number,
    elementId: number,
    dto: UpdateWhiteboardElementDto,
  ) {
    const whiteboard = await this.prisma.whiteboard.findUnique({
      where: { id: whiteboardId },
    });

    if (!whiteboard) {
      throw new NotFoundException('白板不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(whiteboard.documentId, userId, 'write');

    const element = await this.prisma.whiteboardElement.findUnique({
      where: { id: elementId },
    });

    if (!element || element.whiteboardId !== whiteboardId) {
      throw new NotFoundException('元素不存在');
    }

    const updatedElement = await this.prisma.whiteboardElement.update({
      where: { id: elementId },
      data: {
        properties: dto.properties,
        zIndex: dto.zIndex,
      },
    });

    // 更新白板版本
    await this.prisma.whiteboard.update({
      where: { id: whiteboardId },
      data: { version: { increment: 1 } },
    });

    this.logger.log(
      `Updated element ${elementId} in whiteboard ${whiteboardId}`,
    );

    return createSuccessResponse(updatedElement, {
      message: '元素更新成功',
    });
  }

  /**
   * 删除白板元素
   */
  async removeElement(userId: number, whiteboardId: number, elementId: number) {
    const whiteboard = await this.prisma.whiteboard.findUnique({
      where: { id: whiteboardId },
    });

    if (!whiteboard) {
      throw new NotFoundException('白板不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(whiteboard.documentId, userId, 'write');

    const element = await this.prisma.whiteboardElement.findUnique({
      where: { id: elementId },
    });

    if (!element || element.whiteboardId !== whiteboardId) {
      throw new NotFoundException('元素不存在');
    }

    await this.prisma.whiteboardElement.delete({
      where: { id: elementId },
    });

    // 更新白板版本
    await this.prisma.whiteboard.update({
      where: { id: whiteboardId },
      data: { version: { increment: 1 } },
    });

    this.logger.log(
      `Removed element ${elementId} from whiteboard ${whiteboardId}`,
    );

    return createSuccessResponse(null, {
      message: '元素删除成功',
    });
  }

  /**
   * 验证用户对文档的访问权限
   */
  private async validateDocumentAccess(
    documentId: number,
    userId: number,
    requiredAccess: 'read' | 'write',
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        documentCollaborators: {
          where: { userId },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('文档不存在');
    }

    // 文档创建者拥有所有权限
    if (document.createdBy === userId) {
      return;
    }

    // 检查协作者权限
    const collaborator = document.documentCollaborators[0];
    if (!collaborator) {
      throw new ForbiddenException('无权访问此文档');
    }

    if (requiredAccess === 'write' && collaborator.role === 'viewer') {
      throw new ForbiddenException('只读用户无法执行此操作');
    }
  }
}
