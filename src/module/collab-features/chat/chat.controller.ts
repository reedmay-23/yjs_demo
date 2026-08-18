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
import { ChatService } from './chat.service';
import {
  CreateChatRoomDto,
  SendMessageDto,
  UpdateMessageDto,
  AddReactionDto,
  ChatContextType,
  CreateInlineCommentDto,
} from './dto/chat.dto';

type TokenRequest = Request & {
  user: { sub: number; username: string };
};

@ApiTags('实时聊天')
@ApiBearerAuth('access-token')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('room')
  @ApiOperation({ summary: '创建聊天室' })
  createRoom(
    @Req() req: TokenRequest,
    @Body() createRoomDto: CreateChatRoomDto,
  ) {
    return this.chatService.createRoom(req.user.sub, createRoomDto);
  }

  @Get('room/:documentId')
  @ApiOperation({ summary: '获取聊天室信息' })
  getRoom(
    @Req() req: TokenRequest,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.chatService.getRoom(req.user.sub, documentId);
  }

  @Post('room/:documentId/message')
  @ApiOperation({ summary: '发送消息' })
  sendMessage(
    @Req() req: TokenRequest,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(
      req.user.sub,
      documentId,
      sendMessageDto,
    );
  }

  @Post('room/:documentId/comment')
  @ApiOperation({ summary: '为框选的文档正文创建备注' })
  createInlineComment(
    @Req() req: TokenRequest,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: CreateInlineCommentDto,
  ) {
    return this.chatService.createInlineComment(req.user.sub, documentId, dto);
  }

  @Get('room/:documentId/messages')
  @ApiOperation({ summary: '获取消息列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'before', required: false, type: Number })
  @ApiQuery({
    name: 'contextType',
    required: false,
    enum: ChatContextType,
  })
  getMessages(
    @Req() req: TokenRequest,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('before') before?: number,
    @Query('contextType') contextType?: ChatContextType,
  ) {
    return this.chatService.getMessages(
      req.user.sub,
      documentId,
      page || 1,
      limit || 50,
      before,
      contextType,
    );
  }

  @Get('message/:messageId/replies')
  @ApiOperation({ summary: '获取消息的回复列表' })
  getReplies(
    @Req() req: TokenRequest,
    @Param('messageId', ParseIntPipe) messageId: number,
  ) {
    return this.chatService.getReplies(req.user.sub, messageId);
  }

  @Get('message/:messageId/thread')
  @ApiOperation({ summary: '获取备注根消息及其全部回复' })
  getThread(
    @Req() req: TokenRequest,
    @Param('messageId', ParseIntPipe) messageId: number,
  ) {
    return this.chatService.getThread(req.user.sub, messageId);
  }

  @Put('message/:messageId')
  @ApiOperation({ summary: '更新消息' })
  updateMessage(
    @Req() req: TokenRequest,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body() updateMessageDto: UpdateMessageDto,
  ) {
    return this.chatService.updateMessage(
      req.user.sub,
      messageId,
      updateMessageDto,
    );
  }

  @Delete('message/:messageId')
  @ApiOperation({ summary: '删除消息' })
  deleteMessage(
    @Req() req: TokenRequest,
    @Param('messageId', ParseIntPipe) messageId: number,
  ) {
    return this.chatService.deleteMessage(req.user.sub, messageId);
  }

  @Post('message/:messageId/reaction')
  @ApiOperation({ summary: '添加表情反应' })
  addReaction(
    @Req() req: TokenRequest,
    @Param('messageId', ParseIntPipe) messageId: number,
    @Body() addReactionDto: AddReactionDto,
  ) {
    return this.chatService.addReaction(
      req.user.sub,
      messageId,
      addReactionDto,
    );
  }
}
