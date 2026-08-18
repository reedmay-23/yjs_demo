import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { SpreadsheetService } from './spreadsheet.service';
import {
  CreateSpreadsheetDto,
  UpdateSpreadsheetDto,
  UpdateCellDto,
  UpdateMultipleCellsDto,
} from './dto/spreadsheet.dto';

type TokenRequest = Request & {
  user: { sub: number; username: string };
};

@ApiTags('表格协作编辑')
@ApiBearerAuth('access-token')
@Controller('spreadsheet')
export class SpreadsheetController {
  constructor(private readonly spreadsheetService: SpreadsheetService) {}

  @Post()
  @ApiOperation({ summary: '创建表格' })
  create(
    @Req() req: TokenRequest,
    @Body() createSpreadsheetDto: CreateSpreadsheetDto,
  ) {
    return this.spreadsheetService.create(req.user.sub, createSpreadsheetDto);
  }

  @Get('document/:documentId')
  @ApiOperation({ summary: '获取文档下的所有表格' })
  findByDocument(
    @Req() req: TokenRequest,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.spreadsheetService.findByDocument(req.user.sub, documentId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取表格详情' })
  findOne(@Req() req: TokenRequest, @Param('id', ParseIntPipe) id: number) {
    return this.spreadsheetService.findOne(req.user.sub, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新表格信息' })
  update(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSpreadsheetDto: UpdateSpreadsheetDto,
  ) {
    return this.spreadsheetService.update(
      req.user.sub,
      id,
      updateSpreadsheetDto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除表格' })
  remove(@Req() req: TokenRequest, @Param('id', ParseIntPipe) id: number) {
    return this.spreadsheetService.remove(req.user.sub, id);
  }

  @Get(':id/cell')
  @ApiOperation({ summary: '获取单元格数据' })
  @ApiQuery({ name: 'row', type: Number })
  @ApiQuery({ name: 'col', type: Number })
  getCell(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('row', ParseIntPipe) row: number,
    @Query('col', ParseIntPipe) col: number,
  ) {
    return this.spreadsheetService.getCell(req.user.sub, id, row, col);
  }

  @Put(':id/cell')
  @ApiOperation({ summary: '更新单个单元格' })
  updateCell(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCellDto: UpdateCellDto,
  ) {
    return this.spreadsheetService.updateCell(req.user.sub, id, updateCellDto);
  }

  @Put(':id/cells')
  @ApiOperation({ summary: '批量更新单元格' })
  updateMultipleCells(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMultipleCellsDto: UpdateMultipleCellsDto,
  ) {
    return this.spreadsheetService.updateMultipleCells(
      req.user.sub,
      id,
      updateMultipleCellsDto,
    );
  }

  @Delete(':id/cell')
  @ApiOperation({ summary: '删除单元格' })
  @ApiQuery({ name: 'row', type: Number })
  @ApiQuery({ name: 'col', type: Number })
  deleteCell(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('row', ParseIntPipe) row: number,
    @Query('col', ParseIntPipe) col: number,
  ) {
    return this.spreadsheetService.deleteCell(req.user.sub, id, row, col);
  }
}
