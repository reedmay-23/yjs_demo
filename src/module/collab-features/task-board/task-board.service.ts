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
  CreateTaskBoardDto,
  UpdateTaskBoardDto,
  CreateTaskColumnDto,
  UpdateTaskColumnDto,
  CreateTaskCardDto,
  UpdateTaskCardDto,
  MoveTaskCardDto,
} from './dto/task-board.dto';

@Injectable()
export class TaskBoardService {
  private readonly logger = new Logger(TaskBoardService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建任务看板
   */
  async createBoard(userId: number, dto: CreateTaskBoardDto) {
    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(dto.documentId, userId, 'write');

    const board = await this.prisma.taskBoard.create({
      data: {
        documentId: dto.documentId,
        title: dto.title || 'Task Board',
        description: dto.description,
        createdBy: userId,
        columns: {
          create: [
            { title: '待办', position: 0, color: '#ff6b6b' },
            { title: '进行中', position: 1, color: '#ffd93d' },
            { title: '已完成', position: 2, color: '#6bcb77' },
          ],
        },
      },
      include: {
        columns: {
          orderBy: { position: 'asc' },
        },
      },
    });

    this.logger.log(
      `Created task board ${board.id} for document ${dto.documentId}`,
    );

    return createSuccessResponse(board, {
      message: '任务看板创建成功',
    });
  }

  /**
   * 获取看板详情
   */
  async getBoard(userId: number, boardId: number) {
    const board = await this.prisma.taskBoard.findUnique({
      where: { id: boardId },
      include: {
        columns: {
          orderBy: { position: 'asc' },
          include: {
            cards: {
              orderBy: { position: 'asc' },
              include: {
                assignee: {
                  select: {
                    id: true,
                    username: true,
                    account: true,
                  },
                },
                creator: {
                  select: {
                    id: true,
                    username: true,
                    account: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!board) {
      throw new NotFoundException('看板不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(board.documentId, userId, 'read');

    return createSuccessResponse(board, {
      message: '获取看板详情成功',
    });
  }

  /**
   * 获取文档下的所有看板
   */
  async getBoardsByDocument(userId: number, documentId: number) {
    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(documentId, userId, 'read');

    const boards = await this.prisma.taskBoard.findMany({
      where: { documentId },
      include: {
        _count: {
          select: {
            columns: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return createSuccessResponse(boards, {
      message: '获取看板列表成功',
    });
  }

  /**
   * 更新看板
   */
  async updateBoard(userId: number, boardId: number, dto: UpdateTaskBoardDto) {
    const board = await this.prisma.taskBoard.findUnique({
      where: { id: boardId },
    });

    if (!board) {
      throw new NotFoundException('看板不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(board.documentId, userId, 'write');

    const updatedBoard = await this.prisma.taskBoard.update({
      where: { id: boardId },
      data: {
        title: dto.title,
        description: dto.description,
      },
    });

    this.logger.log(`Updated task board ${boardId}`);

    return createSuccessResponse(updatedBoard, {
      message: '看板更新成功',
    });
  }

  /**
   * 删除看板
   */
  async removeBoard(userId: number, boardId: number) {
    const board = await this.prisma.taskBoard.findUnique({
      where: { id: boardId },
    });

    if (!board) {
      throw new NotFoundException('看板不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(board.documentId, userId, 'write');

    await this.prisma.taskBoard.delete({
      where: { id: boardId },
    });

    this.logger.log(`Deleted task board ${boardId}`);

    return createSuccessResponse(null, {
      message: '看板删除成功',
    });
  }

  /**
   * 创建列
   */
  async createColumn(
    userId: number,
    boardId: number,
    dto: CreateTaskColumnDto,
  ) {
    const board = await this.prisma.taskBoard.findUnique({
      where: { id: boardId },
    });

    if (!board) {
      throw new NotFoundException('看板不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(board.documentId, userId, 'write');

    // 获取当前最大位置
    const maxPosition = await this.prisma.taskColumn.aggregate({
      where: { boardId },
      _max: { position: true },
    });

    const column = await this.prisma.taskColumn.create({
      data: {
        boardId,
        title: dto.title,
        color: dto.color,
        position: dto.position ?? (maxPosition._max.position ?? -1) + 1,
      },
    });

    this.logger.log(`Created column ${column.id} in board ${boardId}`);

    return createSuccessResponse(column, {
      message: '列创建成功',
    });
  }

  /**
   * 更新列
   */
  async updateColumn(
    userId: number,
    columnId: number,
    dto: UpdateTaskColumnDto,
  ) {
    const column = await this.prisma.taskColumn.findUnique({
      where: { id: columnId },
      include: { board: true },
    });

    if (!column) {
      throw new NotFoundException('列不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(column.board.documentId, userId, 'write');

    const updatedColumn = await this.prisma.taskColumn.update({
      where: { id: columnId },
      data: {
        title: dto.title,
        color: dto.color,
        position: dto.position,
      },
    });

    this.logger.log(`Updated column ${columnId}`);

    return createSuccessResponse(updatedColumn, {
      message: '列更新成功',
    });
  }

  /**
   * 删除列
   */
  async removeColumn(userId: number, columnId: number) {
    const column = await this.prisma.taskColumn.findUnique({
      where: { id: columnId },
      include: { board: true },
    });

    if (!column) {
      throw new NotFoundException('列不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(column.board.documentId, userId, 'write');

    await this.prisma.taskColumn.delete({
      where: { id: columnId },
    });

    this.logger.log(`Deleted column ${columnId}`);

    return createSuccessResponse(null, {
      message: '列删除成功',
    });
  }

  /**
   * 创建任务卡片
   */
  async createCard(userId: number, columnId: number, dto: CreateTaskCardDto) {
    const column = await this.prisma.taskColumn.findUnique({
      where: { id: columnId },
      include: { board: true },
    });

    if (!column) {
      throw new NotFoundException('列不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(column.board.documentId, userId, 'write');

    // 验证负责人是否存在
    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: dto.assigneeId },
      });

      if (!assignee) {
        throw new BadRequestException('负责人不存在');
      }
    }

    // 获取当前最大位置
    const maxPosition = await this.prisma.taskCard.aggregate({
      where: { columnId },
      _max: { position: true },
    });

    const card = await this.prisma.taskCard.create({
      data: {
        columnId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'medium',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assigneeId: dto.assigneeId,
        tags: dto.tags || [],
        position: dto.position ?? (maxPosition._max.position ?? -1) + 1,
        createdBy: userId,
      },
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
        creator: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
      },
    });

    this.logger.log(`Created card ${card.id} in column ${columnId}`);

    return createSuccessResponse(card, {
      message: '任务卡片创建成功',
    });
  }

  /**
   * 更新任务卡片
   */
  async updateCard(userId: number, cardId: number, dto: UpdateTaskCardDto) {
    const card = await this.prisma.taskCard.findUnique({
      where: { id: cardId },
      include: { column: { include: { board: true } } },
    });

    if (!card) {
      throw new NotFoundException('任务卡片不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(
      card.column.board.documentId,
      userId,
      'write',
    );

    // 验证负责人是否存在
    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: dto.assigneeId },
      });

      if (!assignee) {
        throw new BadRequestException('负责人不存在');
      }
    }

    const updatedCard = await this.prisma.taskCard.update({
      where: { id: cardId },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        assigneeId: dto.assigneeId,
        tags: dto.tags,
        position: dto.position,
      },
      include: {
        assignee: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
        creator: {
          select: {
            id: true,
            username: true,
            account: true,
          },
        },
      },
    });

    this.logger.log(`Updated card ${cardId}`);

    return createSuccessResponse(updatedCard, {
      message: '任务卡片更新成功',
    });
  }

  /**
   * 移动任务卡片
   */
  async moveCard(userId: number, cardId: number, dto: MoveTaskCardDto) {
    const card = await this.prisma.taskCard.findUnique({
      where: { id: cardId },
      include: { column: { include: { board: true } } },
    });

    if (!card) {
      throw new NotFoundException('任务卡片不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(
      card.column.board.documentId,
      userId,
      'write',
    );

    // 验证目标列是否存在
    const targetColumn = await this.prisma.taskColumn.findUnique({
      where: { id: dto.targetColumnId },
    });

    if (!targetColumn || targetColumn.boardId !== card.column.boardId) {
      throw new BadRequestException('目标列不存在');
    }

    const targetCardCount = await this.prisma.taskCard.count({
      where: { columnId: dto.targetColumnId, id: { not: cardId } },
    });
    const targetPosition = Math.min(dto.position, targetCardCount);

    const updatedCard = await this.prisma.$transaction(async (tx) => {
      if (card.columnId === dto.targetColumnId) {
        if (targetPosition < card.position) {
          await tx.taskCard.updateMany({
            where: {
              columnId: card.columnId,
              position: { gte: targetPosition, lt: card.position },
              id: { not: cardId },
            },
            data: { position: { increment: 1 } },
          });
        } else if (targetPosition > card.position) {
          await tx.taskCard.updateMany({
            where: {
              columnId: card.columnId,
              position: { gt: card.position, lte: targetPosition },
              id: { not: cardId },
            },
            data: { position: { decrement: 1 } },
          });
        }
      } else {
        await tx.taskCard.updateMany({
          where: {
            columnId: card.columnId,
            position: { gt: card.position },
          },
          data: { position: { decrement: 1 } },
        });
        await tx.taskCard.updateMany({
          where: {
            columnId: dto.targetColumnId,
            position: { gte: targetPosition },
          },
          data: { position: { increment: 1 } },
        });
      }

      return tx.taskCard.update({
        where: { id: cardId },
        data: {
          columnId: dto.targetColumnId,
          position: targetPosition,
        },
        include: {
          assignee: {
            select: { id: true, username: true, account: true },
          },
          creator: {
            select: { id: true, username: true, account: true },
          },
        },
      });
    });

    this.logger.log(
      `Moved card ${cardId} to column ${dto.targetColumnId} at position ${targetPosition}`,
    );

    return createSuccessResponse(updatedCard, {
      message: '任务卡片移动成功',
    });
  }

  /**
   * 删除任务卡片
   */
  async removeCard(userId: number, cardId: number) {
    const card = await this.prisma.taskCard.findUnique({
      where: { id: cardId },
      include: { column: { include: { board: true } } },
    });

    if (!card) {
      throw new NotFoundException('任务卡片不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(
      card.column.board.documentId,
      userId,
      'write',
    );

    await this.prisma.taskCard.delete({
      where: { id: cardId },
    });

    this.logger.log(`Deleted card ${cardId}`);

    return createSuccessResponse(null, {
      message: '任务卡片删除成功',
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
