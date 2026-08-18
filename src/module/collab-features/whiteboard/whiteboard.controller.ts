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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { WhiteboardService } from './whiteboard.service';
import {
  CreateWhiteboardDto,
  UpdateWhiteboardDto,
  AddWhiteboardElementDto,
  UpdateWhiteboardElementDto,
} from './dto/whiteboard.dto';

type TokenRequest = Request & {
  user: { sub: number; username: string };
};

@ApiTags('协同白板')
@ApiBearerAuth('access-token')
@Controller('whiteboard')
export class WhiteboardController {
  constructor(private readonly whiteboardService: WhiteboardService) {}

  @Post()
  @ApiOperation({ summary: '创建白板' })
  create(
    @Req() req: TokenRequest,
    @Body() createWhiteboardDto: CreateWhiteboardDto,
  ) {
    return this.whiteboardService.create(req.user.sub, createWhiteboardDto);
  }

  @Get('document/:documentId')
  @ApiOperation({ summary: '获取文档下的所有白板' })
  findByDocument(
    @Req() req: TokenRequest,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.whiteboardService.findByDocument(req.user.sub, documentId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取白板详情' })
  findOne(@Req() req: TokenRequest, @Param('id', ParseIntPipe) id: number) {
    return this.whiteboardService.findOne(req.user.sub, id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新白板信息' })
  update(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateWhiteboardDto: UpdateWhiteboardDto,
  ) {
    return this.whiteboardService.update(req.user.sub, id, updateWhiteboardDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除白板' })
  remove(@Req() req: TokenRequest, @Param('id', ParseIntPipe) id: number) {
    return this.whiteboardService.remove(req.user.sub, id);
  }

  @Post(':id/element')
  @ApiOperation({ summary: '添加白板元素' })
  addElement(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() addElementDto: AddWhiteboardElementDto,
  ) {
    return this.whiteboardService.addElement(req.user.sub, id, addElementDto);
  }

  @Put(':id/element/:elementId')
  @ApiOperation({ summary: '更新白板元素' })
  updateElement(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('elementId', ParseIntPipe) elementId: number,
    @Body() updateElementDto: UpdateWhiteboardElementDto,
  ) {
    return this.whiteboardService.updateElement(
      req.user.sub,
      id,
      elementId,
      updateElementDto,
    );
  }

  @Delete(':id/element/:elementId')
  @ApiOperation({ summary: '删除白板元素' })
  removeElement(
    @Req() req: TokenRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('elementId', ParseIntPipe) elementId: number,
  ) {
    return this.whiteboardService.removeElement(req.user.sub, id, elementId);
  }
}
