import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { TaskBoardService } from './task-board.service';
import {
  CreateTaskBoardDto,
  UpdateTaskBoardDto,
  CreateTaskColumnDto,
  UpdateTaskColumnDto,
  CreateTaskCardDto,
  UpdateTaskCardDto,
  MoveTaskCardDto,
} from './dto/task-board.dto';

type TokenRequest = Request & {
  user: { sub: number; username: string };
};

@ApiTags('任务看板')
@ApiBearerAuth('access-token')
@Controller('task-board')
export class TaskBoardController {
  constructor(private readonly taskBoardService: TaskBoardService) {}

  @Post()
  @ApiOperation({ summary: '创建任务看板' })
  createBoard(
    @Req() req: TokenRequest,
    @Body() createBoardDto: CreateTaskBoardDto,
  ) {
    return this.taskBoardService.createBoard(req.user.sub, createBoardDto);
  }

  @Get('document/:documentId')
  @ApiOperation({ summary: '获取文档下的所有看板' })
  getBoardsByDocument(
    @Req() req: TokenRequest,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.taskBoardService.getBoardsByDocument(req.user.sub, documentId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取看板详情' })
  getBoard(@Req() req: TokenRequest, @Param('id', ParseIntPipe) id: number) {
    return this.taskBoardService.getBoard(req.user.sub, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新看板' })
  updateBoard(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateBoardDto: UpdateTaskBoardDto,
  ) {
    return this.taskBoardService.updateBoard(req.user.sub, id, updateBoardDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除看板' })
  removeBoard(@Req() req: TokenRequest, @Param('id', ParseIntPipe) id: number) {
    return this.taskBoardService.removeBoard(req.user.sub, id);
  }

  @Post(':id/column')
  @ApiOperation({ summary: '创建列' })
  createColumn(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() createColumnDto: CreateTaskColumnDto,
  ) {
    return this.taskBoardService.createColumn(
      req.user.sub,
      id,
      createColumnDto,
    );
  }

  @Put('column/:columnId')
  @ApiOperation({ summary: '更新列' })
  updateColumn(
    @Req() req: TokenRequest,
    @Param('columnId', ParseIntPipe) columnId: number,
    @Body() updateColumnDto: UpdateTaskColumnDto,
  ) {
    return this.taskBoardService.updateColumn(
      req.user.sub,
      columnId,
      updateColumnDto,
    );
  }

  @Delete('column/:columnId')
  @ApiOperation({ summary: '删除列' })
  removeColumn(
    @Req() req: TokenRequest,
    @Param('columnId', ParseIntPipe) columnId: number,
  ) {
    return this.taskBoardService.removeColumn(req.user.sub, columnId);
  }

  @Post('column/:columnId/card')
  @ApiOperation({ summary: '创建任务卡片' })
  createCard(
    @Req() req: TokenRequest,
    @Param('columnId', ParseIntPipe) columnId: number,
    @Body() createCardDto: CreateTaskCardDto,
  ) {
    return this.taskBoardService.createCard(
      req.user.sub,
      columnId,
      createCardDto,
    );
  }

  @Put('card/:cardId')
  @ApiOperation({ summary: '更新任务卡片' })
  updateCard(
    @Req() req: TokenRequest,
    @Param('cardId', ParseIntPipe) cardId: number,
    @Body() updateCardDto: UpdateTaskCardDto,
  ) {
    return this.taskBoardService.updateCard(
      req.user.sub,
      cardId,
      updateCardDto,
    );
  }

  @Put('card/:cardId/move')
  @ApiOperation({ summary: '移动任务卡片' })
  moveCard(
    @Req() req: TokenRequest,
    @Param('cardId', ParseIntPipe) cardId: number,
    @Body() moveCardDto: MoveTaskCardDto,
  ) {
    return this.taskBoardService.moveCard(req.user.sub, cardId, moveCardDto);
  }

  @Delete('card/:cardId')
  @ApiOperation({ summary: '删除任务卡片' })
  removeCard(
    @Req() req: TokenRequest,
    @Param('cardId', ParseIntPipe) cardId: number,
  ) {
    return this.taskBoardService.removeCard(req.user.sub, cardId);
  }
}
