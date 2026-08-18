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
  CreateSpreadsheetDto,
  UpdateSpreadsheetDto,
  UpdateCellDto,
  UpdateMultipleCellsDto,
} from './dto/spreadsheet.dto';

@Injectable()
export class SpreadsheetService {
  private readonly logger = new Logger(SpreadsheetService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建表格
   */
  async create(userId: number, dto: CreateSpreadsheetDto) {
    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(dto.documentId, userId, 'write');

    const spreadsheet = await this.prisma.spreadsheet.create({
      data: {
        documentId: dto.documentId,
        title: dto.title || 'Untitled Spreadsheet',
        rowCount: dto.rowCount || 100,
        colCount: dto.colCount || 26,
        content: {}, // 初始空内容
        createdBy: userId,
      },
    });

    this.logger.log(
      `Created spreadsheet ${spreadsheet.id} for document ${dto.documentId}`,
    );

    return createSuccessResponse(spreadsheet, {
      message: '表格创建成功',
    });
  }

  /**
   * 获取表格详情
   */
  async findOne(userId: number, spreadsheetId: number) {
    const spreadsheet = await this.prisma.spreadsheet.findUnique({
      where: { id: spreadsheetId },
      include: {
        cells: {
          orderBy: [{ row: 'asc' }, { col: 'asc' }],
        },
      },
    });

    if (!spreadsheet) {
      throw new NotFoundException('表格不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(spreadsheet.documentId, userId, 'read');

    return createSuccessResponse(spreadsheet, {
      message: '获取表格详情成功',
    });
  }

  /**
   * 获取文档下的所有表格
   */
  async findByDocument(userId: number, documentId: number) {
    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(documentId, userId, 'read');

    const spreadsheets = await this.prisma.spreadsheet.findMany({
      where: { documentId },
      include: {
        _count: {
          select: { cells: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return createSuccessResponse(spreadsheets, {
      message: '获取表格列表成功',
    });
  }

  /**
   * 更新表格信息
   */
  async update(
    userId: number,
    spreadsheetId: number,
    dto: UpdateSpreadsheetDto,
  ) {
    const spreadsheet = await this.prisma.spreadsheet.findUnique({
      where: { id: spreadsheetId },
    });

    if (!spreadsheet) {
      throw new NotFoundException('表格不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(spreadsheet.documentId, userId, 'write');

    const updatedSpreadsheet = await this.prisma.spreadsheet.update({
      where: { id: spreadsheetId },
      data: {
        title: dto.title,
        rowCount: dto.rowCount,
        colCount: dto.colCount,
        version: { increment: 1 },
      },
    });

    this.logger.log(`Updated spreadsheet ${spreadsheetId}`);

    return createSuccessResponse(updatedSpreadsheet, {
      message: '表格更新成功',
    });
  }

  /**
   * 删除表格
   */
  async remove(userId: number, spreadsheetId: number) {
    const spreadsheet = await this.prisma.spreadsheet.findUnique({
      where: { id: spreadsheetId },
    });

    if (!spreadsheet) {
      throw new NotFoundException('表格不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(spreadsheet.documentId, userId, 'write');

    await this.prisma.spreadsheet.delete({
      where: { id: spreadsheetId },
    });

    this.logger.log(`Deleted spreadsheet ${spreadsheetId}`);

    return createSuccessResponse(null, {
      message: '表格删除成功',
    });
  }

  /**
   * 更新单个单元格
   */
  async updateCell(userId: number, spreadsheetId: number, dto: UpdateCellDto) {
    const spreadsheet = await this.prisma.spreadsheet.findUnique({
      where: { id: spreadsheetId },
    });

    if (!spreadsheet) {
      throw new NotFoundException('表格不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(spreadsheet.documentId, userId, 'write');

    // 验证单元格位置是否有效
    if (
      dto.row < 0 ||
      dto.row >= spreadsheet.rowCount ||
      dto.col < 0 ||
      dto.col >= spreadsheet.colCount
    ) {
      throw new BadRequestException('单元格位置无效');
    }

    const cell = await this.prisma.spreadsheetCell.upsert({
      where: {
        spreadsheetId_row_col: {
          spreadsheetId,
          row: dto.row,
          col: dto.col,
        },
      },
      update: {
        value: dto.value,
        formula: dto.formula,
        format: dto.format,
        validation: dto.validation,
      },
      create: {
        spreadsheetId,
        row: dto.row,
        col: dto.col,
        value: dto.value,
        formula: dto.formula,
        format: dto.format,
        validation: dto.validation,
        createdBy: userId,
      },
    });

    // 更新表格版本
    await this.prisma.spreadsheet.update({
      where: { id: spreadsheetId },
      data: { version: { increment: 1 } },
    });

    this.logger.log(
      `Updated cell (${dto.row}, ${dto.col}) in spreadsheet ${spreadsheetId}`,
    );

    return createSuccessResponse(cell, {
      message: '单元格更新成功',
    });
  }

  /**
   * 批量更新单元格
   */
  async updateMultipleCells(
    userId: number,
    spreadsheetId: number,
    dto: UpdateMultipleCellsDto,
  ) {
    const spreadsheet = await this.prisma.spreadsheet.findUnique({
      where: { id: spreadsheetId },
    });

    if (!spreadsheet) {
      throw new NotFoundException('表格不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(spreadsheet.documentId, userId, 'write');

    const results = [];

    // 使用事务批量更新
    await this.prisma.$transaction(async (tx) => {
      for (const cellDto of dto.cells) {
        // 验证单元格位置是否有效
        if (
          cellDto.row < 0 ||
          cellDto.row >= spreadsheet.rowCount ||
          cellDto.col < 0 ||
          cellDto.col >= spreadsheet.colCount
        ) {
          throw new BadRequestException(
            `单元格位置 (${cellDto.row}, ${cellDto.col}) 无效`,
          );
        }

        const cell = await tx.spreadsheetCell.upsert({
          where: {
            spreadsheetId_row_col: {
              spreadsheetId,
              row: cellDto.row,
              col: cellDto.col,
            },
          },
          update: {
            value: cellDto.value,
            formula: cellDto.formula,
            format: cellDto.format,
            validation: cellDto.validation,
          },
          create: {
            spreadsheetId,
            row: cellDto.row,
            col: cellDto.col,
            value: cellDto.value,
            formula: cellDto.formula,
            format: cellDto.format,
            validation: cellDto.validation,
            createdBy: userId,
          },
        });

        results.push(cell);
      }

      // 更新表格版本
      await tx.spreadsheet.update({
        where: { id: spreadsheetId },
        data: { version: { increment: 1 } },
      });
    });

    this.logger.log(
      `Updated ${results.length} cells in spreadsheet ${spreadsheetId}`,
    );

    return createSuccessResponse(results, {
      message: '单元格批量更新成功',
    });
  }

  /**
   * 获取单元格数据
   */
  async getCell(
    userId: number,
    spreadsheetId: number,
    row: number,
    col: number,
  ) {
    const spreadsheet = await this.prisma.spreadsheet.findUnique({
      where: { id: spreadsheetId },
    });

    if (!spreadsheet) {
      throw new NotFoundException('表格不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(spreadsheet.documentId, userId, 'read');

    // 验证单元格位置是否有效
    if (
      row < 0 ||
      row >= spreadsheet.rowCount ||
      col < 0 ||
      col >= spreadsheet.colCount
    ) {
      throw new BadRequestException('单元格位置无效');
    }

    const cell = await this.prisma.spreadsheetCell.findUnique({
      where: {
        spreadsheetId_row_col: {
          spreadsheetId,
          row,
          col,
        },
      },
    });

    return createSuccessResponse(cell, {
      message: '获取单元格数据成功',
    });
  }

  /**
   * 删除单元格
   */
  async deleteCell(
    userId: number,
    spreadsheetId: number,
    row: number,
    col: number,
  ) {
    const spreadsheet = await this.prisma.spreadsheet.findUnique({
      where: { id: spreadsheetId },
    });

    if (!spreadsheet) {
      throw new NotFoundException('表格不存在');
    }

    // 验证用户对文档的访问权限
    await this.validateDocumentAccess(spreadsheet.documentId, userId, 'write');

    // 验证单元格位置是否有效
    if (
      row < 0 ||
      row >= spreadsheet.rowCount ||
      col < 0 ||
      col >= spreadsheet.colCount
    ) {
      throw new BadRequestException('单元格位置无效');
    }

    await this.prisma.spreadsheetCell.deleteMany({
      where: {
        spreadsheetId,
        row,
        col,
      },
    });

    // 更新表格版本
    await this.prisma.spreadsheet.update({
      where: { id: spreadsheetId },
      data: { version: { increment: 1 } },
    });

    this.logger.log(
      `Deleted cell (${row}, ${col}) from spreadsheet ${spreadsheetId}`,
    );

    return createSuccessResponse(null, {
      message: '单元格删除成功',
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
