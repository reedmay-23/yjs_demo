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
  CreateChatRoomDto,
  SendMessageDto,
  UpdateMessageDto,
  AddReactionDto,
  ChatContextType,
  CreateInlineCommentDto,
  MessageType,
} from './dto/chat.dto';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建聊天室
   */
  async createRoom(userId: number, dto: CreateChatRoomDto) {
    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(dto.documentId, userId, 'read');

    const room = await this.prisma.chatRoom.upsert({
      where: { documentId: dto.documentId },
      update: {},
      create: {
        documentId: dto.documentId,
        name: dto.name || 'Document Chat',
      },
    });

    this.logger.log(
      `Created chat room ${room.id} for document ${dto.documentId}`,
    );

    return createSuccessResponse(room, {
      message: '聊天室创建成功',
    });
  }

  /**
   * 获取聊天室信息
   */
  async getRoom(userId: number, documentId: number) {
    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(documentId, userId, 'read');

    const room = await this.prisma.chatRoom.findUnique({
      where: { documentId },
      include: {
        _count: {
          select: { messages: true },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('聊天室不存在');
    }

    return createSuccessResponse(room, {
      message: '获取聊天室信息成功',
    });
  }

  /**
   * Create a root discussion message bound to selected document text.
   */
  async createInlineComment(
    userId: number,
    documentId: number,
    dto: CreateInlineCommentDto,
  ) {
    await this.validateDocumentAccess(documentId, userId, 'read');

    const room = await this.prisma.chatRoom.upsert({
      where: { documentId },
      update: {},
      create: {
        documentId,
        name: 'Document Chat',
      },
    });

    const comment = await this.prisma.chatMessage.create({
      data: {
        roomId: room.id,
        userId,
        content: dto.content,
        messageType: MessageType.TEXT,
        contextType: ChatContextType.INLINE_COMMENT,
        quotedText: dto.quotedText,
        mentions: dto.mentions || [],
        reactions: {},
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

    this.logger.log(
      `User ${userId} created inline comment ${comment.id} in document ${documentId}`,
    );

    return createSuccessResponse(comment, {
      message: '正文备注创建成功',
    });
  }

  /**
   * 发送消息
   */
  async sendMessage(userId: number, documentId: number, dto: SendMessageDto) {
    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(documentId, userId, 'read');

    const room = await this.prisma.chatRoom.findUnique({
      where: { documentId },
    });

    if (!room) {
      throw new NotFoundException('聊天室不存在');
    }

    // 验证回复消息是否存在
    let contextType = ChatContextType.CHAT;
    if (dto.parentId !== undefined) {
      const parentMessage = await this.prisma.chatMessage.findUnique({
        where: { id: dto.parentId },
      });

      if (!parentMessage || parentMessage.roomId !== room.id) {
        throw new BadRequestException('回复的消息不存在');
      }

      contextType = parentMessage.contextType as ChatContextType;
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        roomId: room.id,
        userId,
        content: dto.content,
        messageType: dto.messageType || MessageType.TEXT,
        contextType,
        parentId: dto.parentId,
        mentions: dto.mentions || [],
        reactions: {},
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

    this.logger.log(
      `User ${userId} sent message ${message.id} in room ${room.id}`,
    );

    return createSuccessResponse(message, {
      message: '消息发送成功',
    });
  }

  /**
   * 获取消息列表
   */
  async getMessages(
    userId: number,
    documentId: number,
    page: number = 1,
    limit: number = 50,
    before?: number,
    contextType: ChatContextType = ChatContextType.CHAT,
  ) {
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page must be a positive integer');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }
    if (before !== undefined && (!Number.isInteger(before) || before < 1)) {
      throw new BadRequestException('before must be a positive integer');
    }
    if (!Object.values(ChatContextType).includes(contextType)) {
      throw new BadRequestException('contextType is invalid');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(documentId, userId, 'read');

    const room = await this.prisma.chatRoom.findUnique({
      where: { documentId },
    });

    if (!room) {
      throw new NotFoundException('聊天室不存在');
    }

    const where: any = {
      roomId: room.id,
      isDeleted: false,
      contextType,
    };

    if (before !== undefined) {
      where.id = { lt: before };
    }

    const messages = await this.prisma.chatMessage.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
        parent: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                account: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    });

    const total = await this.prisma.chatMessage.count({
      where: { roomId: room.id, isDeleted: false, contextType },
    });

    return createSuccessResponse(
      {
        messages: messages.reverse(),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      {
        message: '获取消息列表成功',
      },
    );
  }

  /**
   * 获取消息的回复列表
   */
  async getReplies(userId: number, messageId: number) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: { room: true },
    });

    if (!message) {
      throw new NotFoundException('消息不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(message.room.documentId, userId, 'read');

    const replies = await this.prisma.chatMessage.findMany({
      where: {
        parentId: messageId,
        isDeleted: false,
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
      orderBy: { createdAt: 'asc' },
    });

    return createSuccessResponse(replies, {
      message: '获取回复列表成功',
    });
  }

  /**
   * Return a comment root and all of its replies in one request.
   */
  async getThread(userId: number, messageId: number) {
    const root = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: {
        room: true,
        user: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
      },
    });

    if (!root || root.isDeleted) {
      throw new NotFoundException('备注不存在');
    }

    if (root.parentId !== null) {
      throw new BadRequestException('只能通过根消息获取完整讨论串');
    }

    await this.validateDocumentAccess(root.room.documentId, userId, 'read');

    const replies = await this.prisma.chatMessage.findMany({
      where: {
        parentId: messageId,
        isDeleted: false,
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
      orderBy: { createdAt: 'asc' },
    });

    const { room, ...message } = root;
    return createSuccessResponse(
      { message, replies },
      { message: '获取备注讨论成功' },
    );
  }

  /**
   * 更新消息
   */
  async updateMessage(
    userId: number,
    messageId: number,
    dto: UpdateMessageDto,
  ) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: { room: true },
    });

    if (!message) {
      throw new NotFoundException('消息不存在');
    }

    if (message.isDeleted) {
      throw new BadRequestException('已删除的消息不能编辑');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(message.room.documentId, userId, 'read');

    // 只能编辑自己的消息
    if (message.userId !== userId) {
      throw new ForbiddenException('只能编辑自己的消息');
    }

    const updatedMessage = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content: dto.content,
        isEdited: true,
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

    this.logger.log(`User ${userId} updated message ${messageId}`);

    return createSuccessResponse(updatedMessage, {
      message: '消息更新成功',
    });
  }

  /**
   * 删除消息（软删除）
   */
  async deleteMessage(userId: number, messageId: number) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: { room: true },
    });

    if (!message) {
      throw new NotFoundException('消息不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(message.room.documentId, userId, 'read');

    // 只能删除自己的消息
    if (message.userId !== userId) {
      throw new ForbiddenException('只能删除自己的消息');
    }

    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        content: '[消息已删除]',
      },
    });

    this.logger.log(`User ${userId} deleted message ${messageId}`);

    return createSuccessResponse(null, {
      message: '消息删除成功',
    });
  }

  /**
   * 添加表情反应
   */
  async addReaction(userId: number, messageId: number, dto: AddReactionDto) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: { room: true },
    });

    if (!message) {
      throw new NotFoundException('消息不存在');
    }

    if (message.isDeleted) {
      throw new BadRequestException('已删除的消息不能添加表情反应');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(message.room.documentId, userId, 'read');

    const reactions = (message.reactions as Record<string, number[]>) || {};
    const emojiReactions = reactions[dto.emoji] || [];

    // 检查用户是否已经添加过该表情
    if (emojiReactions.includes(userId)) {
      // 移除表情反应
      const updatedReactions = emojiReactions.filter((id) => id !== userId);
      if (updatedReactions.length === 0) {
        delete reactions[dto.emoji];
      } else {
        reactions[dto.emoji] = updatedReactions;
      }
    } else {
      // 添加表情反应
      reactions[dto.emoji] = [...emojiReactions, userId];
    }

    const updatedMessage = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { reactions },
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

    this.logger.log(
      `User ${userId} toggled reaction ${dto.emoji} on message ${messageId}`,
    );

    return createSuccessResponse(updatedMessage, {
      message: '表情反应更新成功',
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
