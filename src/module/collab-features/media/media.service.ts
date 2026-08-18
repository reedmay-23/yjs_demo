import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { createSuccessResponse } from '../../../common/utils/api-response.util';
import {
  UploadMediaDto,
  UpdateMediaDto,
  CreateAnnotationDto,
  UpdateAnnotationDto,
  MediaType,
} from './dto/media.dto';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 上传媒体文件
   */
  async upload(userId: number, dto: UploadMediaDto) {
    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(dto.documentId, userId, 'write');

    const media = await this.prisma.mediaFile.create({
      data: {
        documentId: dto.documentId,
        fileName: dto.fileName,
        fileType: dto.fileType,
        fileSize: dto.fileSize,
        filePath: dto.filePath,
        mimeType: dto.mimeType,
        metadata: dto.metadata || {},
        uploadedBy: userId,
      },
      include: {
        uploader: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
      },
    });

    this.logger.log(
      `Uploaded media ${media.id} for document ${dto.documentId}`,
    );

    return createSuccessResponse(media, {
      message: '媒体文件上传成功',
    });
  }

  /**
   * 获取媒体文件详情
   */
  async findOne(userId: number, mediaId: number) {
    const media = await this.prisma.mediaFile.findUnique({
      where: { id: mediaId },
      include: {
        uploader: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
        annotations: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                account: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!media) {
      throw new NotFoundException('媒体文件不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(media.documentId, userId, 'read');

    return createSuccessResponse(media, {
      message: '获取媒体文件详情成功',
    });
  }

  /**
   * 获取文档下的所有媒体文件
   */
  async findByDocument(
    userId: number,
    documentId: number,
    fileType?: MediaType,
  ) {
    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(documentId, userId, 'read');

    const where: any = { documentId };
    if (fileType) {
      where.fileType = fileType;
    }

    const mediaFiles = await this.prisma.mediaFile.findMany({
      where,
      include: {
        uploader: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
        _count: {
          select: { annotations: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return createSuccessResponse(mediaFiles, {
      message: '获取媒体文件列表成功',
    });
  }

  /**
   * 更新媒体文件信息
   */
  async update(userId: number, mediaId: number, dto: UpdateMediaDto) {
    const media = await this.prisma.mediaFile.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new NotFoundException('媒体文件不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(media.documentId, userId, 'write');

    const updatedMedia = await this.prisma.mediaFile.update({
      where: { id: mediaId },
      data: {
        fileName: dto.fileName,
        metadata: dto.metadata,
      },
      include: {
        uploader: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
      },
    });

    this.logger.log(`Updated media ${mediaId}`);

    return createSuccessResponse(updatedMedia, {
      message: '媒体文件更新成功',
    });
  }

  /**
   * 删除媒体文件
   */
  async remove(userId: number, mediaId: number) {
    const media = await this.prisma.mediaFile.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new NotFoundException('媒体文件不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(media.documentId, userId, 'write');

    await this.prisma.mediaFile.delete({
      where: { id: mediaId },
    });

    this.logger.log(`Deleted media ${mediaId}`);

    return createSuccessResponse(null, {
      message: '媒体文件删除成功',
    });
  }

  /**
   * 创建标注
   */
  async createAnnotation(
    userId: number,
    mediaId: number,
    dto: CreateAnnotationDto,
  ) {
    const media = await this.prisma.mediaFile.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new NotFoundException('媒体文件不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(media.documentId, userId, 'write');

    if (
      dto.startTime !== undefined &&
      dto.endTime !== undefined &&
      dto.startTime >= dto.endTime
    ) {
      throw new BadRequestException('开始时间必须小于结束时间');
    }

    const annotation = await this.prisma.mediaAnnotation.create({
      data: {
        mediaId,
        userId,
        annotationType: dto.annotationType,
        content: dto.content,
        position: dto.position,
        startTime: dto.startTime,
        endTime: dto.endTime,
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

    this.logger.log(`Created annotation ${annotation.id} for media ${mediaId}`);

    return createSuccessResponse(annotation, {
      message: '标注创建成功',
    });
  }

  /**
   * 获取媒体文件的标注列表
   */
  async getAnnotations(userId: number, mediaId: number) {
    const media = await this.prisma.mediaFile.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new NotFoundException('媒体文件不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(media.documentId, userId, 'read');

    const annotations = await this.prisma.mediaAnnotation.findMany({
      where: { mediaId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return createSuccessResponse(annotations, {
      message: '获取标注列表成功',
    });
  }

  /**
   * 更新标注
   */
  async updateAnnotation(
    userId: number,
    annotationId: number,
    dto: UpdateAnnotationDto,
  ) {
    const annotation = await this.prisma.mediaAnnotation.findUnique({
      where: { id: annotationId },
      include: { media: true },
    });

    if (!annotation) {
      throw new NotFoundException('标注不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(
      annotation.media.documentId,
      userId,
      'write',
    );

    // 只能编辑自己的标注
    if (annotation.userId !== userId) {
      throw new ForbiddenException('只能编辑自己的标注');
    }

    const nextStartTime = dto.startTime ?? annotation.startTime;
    const nextEndTime = dto.endTime ?? annotation.endTime;
    if (
      nextStartTime !== null &&
      nextEndTime !== null &&
      nextStartTime >= nextEndTime
    ) {
      throw new BadRequestException('开始时间必须小于结束时间');
    }

    const updatedAnnotation = await this.prisma.mediaAnnotation.update({
      where: { id: annotationId },
      data: {
        content: dto.content,
        position: dto.position,
        startTime: dto.startTime,
        endTime: dto.endTime,
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

    this.logger.log(`Updated annotation ${annotationId}`);

    return createSuccessResponse(updatedAnnotation, {
      message: '标注更新成功',
    });
  }

  /**
   * 删除标注
   */
  async removeAnnotation(userId: number, annotationId: number) {
    const annotation = await this.prisma.mediaAnnotation.findUnique({
      where: { id: annotationId },
      include: { media: true },
    });

    if (!annotation) {
      throw new NotFoundException('标注不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(
      annotation.media.documentId,
      userId,
      'write',
    );

    // 只能删除自己的标注
    if (annotation.userId !== userId) {
      throw new ForbiddenException('只能删除自己的标注');
    }

    await this.prisma.mediaAnnotation.delete({
      where: { id: annotationId },
    });

    this.logger.log(`Deleted annotation ${annotationId}`);

    return createSuccessResponse(null, {
      message: '标注删除成功',
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
