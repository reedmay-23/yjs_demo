import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  SYSTEM = 'system',
}

export enum ChatContextType {
  CHAT = 'chat',
  INLINE_COMMENT = 'inline_comment',
}

export class CreateChatRoomDto {
  @ApiProperty({
    description: '文档ID',
    example: 1,
  })
  @IsInt({ message: 'documentId must be an integer' })
  @Min(1, { message: 'documentId must be positive' })
  documentId: number;

  @ApiPropertyOptional({
    description: '聊天室名称',
    example: '文档讨论区',
  })
  @IsOptional()
  @IsString({ message: 'name must be a string' })
  @MaxLength(255, { message: 'name cannot exceed 255 characters' })
  name?: string;
}

export class SendMessageDto {
  @ApiProperty({
    description: '消息内容',
    example: '大家好，这个文档需要修改一下',
  })
  @IsString({ message: 'content must be a string' })
  @IsNotEmpty({ message: 'content cannot be empty' })
  @MaxLength(5000, { message: 'content cannot exceed 5000 characters' })
  content: string;

  @ApiPropertyOptional({
    description: '消息类型',
    example: MessageType.TEXT,
    enum: MessageType,
  })
  @IsOptional()
  @IsEnum(MessageType, { message: 'messageType must be a valid message type' })
  messageType?: MessageType;

  @ApiPropertyOptional({
    description: '回复消息ID',
    example: 10,
  })
  @IsOptional()
  @IsInt({ message: 'parentId must be an integer' })
  @Min(1, { message: 'parentId must be positive' })
  parentId?: number;

  @ApiPropertyOptional({
    description: '@提及的用户ID列表',
    example: [1, 2, 3],
  })
  @IsOptional()
  @IsArray({ message: 'mentions must be an array' })
  @ArrayMaxSize(100, { message: 'mentions cannot exceed 100 users' })
  @ArrayUnique({ message: 'mentions cannot contain duplicates' })
  @IsInt({ each: true, message: 'each mention must be an integer' })
  @Min(1, { each: true, message: 'each mention must be positive' })
  mentions?: number[];
}

export class CreateInlineCommentDto {
  @ApiProperty({
    description: '备注内容',
    example: '这里的结论需要补充数据来源',
  })
  @IsString({ message: 'content must be a string' })
  @IsNotEmpty({ message: 'content cannot be empty' })
  @MaxLength(5000, { message: 'content cannot exceed 5000 characters' })
  content: string;

  @ApiProperty({
    description: '创建备注时框选的文档原文',
    example: '本季度收入同比增长 20%',
  })
  @IsString({ message: 'quotedText must be a string' })
  @IsNotEmpty({ message: 'quotedText cannot be empty' })
  @MaxLength(10000, { message: 'quotedText cannot exceed 10000 characters' })
  quotedText: string;

  @ApiPropertyOptional({
    description: '@提及的用户 ID 列表',
    example: [1, 2],
  })
  @IsOptional()
  @IsArray({ message: 'mentions must be an array' })
  @ArrayMaxSize(100, { message: 'mentions cannot exceed 100 users' })
  @ArrayUnique({ message: 'mentions cannot contain duplicates' })
  @IsInt({ each: true, message: 'each mention must be an integer' })
  @Min(1, { each: true, message: 'each mention must be positive' })
  mentions?: number[];
}

export class UpdateMessageDto {
  @ApiProperty({
    description: '更新后的消息内容',
    example: '修改后的消息内容',
  })
  @IsString({ message: 'content must be a string' })
  @IsNotEmpty({ message: 'content cannot be empty' })
  @MaxLength(5000, { message: 'content cannot exceed 5000 characters' })
  content: string;
}

export class AddReactionDto {
  @ApiProperty({
    description: '表情符号',
    example: '👍',
  })
  @IsString({ message: 'emoji must be a string' })
  @IsNotEmpty({ message: 'emoji cannot be empty' })
  @MaxLength(16, { message: 'emoji cannot exceed 16 characters' })
  emoji: string;
}

export class ChatMessageResponseDto {
  @ApiProperty({ description: '消息ID' })
  id: number;

  @ApiProperty({ description: '聊天室ID' })
  roomId: number;

  @ApiProperty({ description: '发送者ID' })
  userId: number;

  @ApiProperty({ description: '消息内容' })
  content: string;

  @ApiProperty({ description: '消息类型' })
  messageType: MessageType;

  @ApiProperty({
    description: '消息所属场景',
    enum: ChatContextType,
  })
  contextType: ChatContextType;

  @ApiPropertyOptional({ description: '正文备注框选的原文' })
  quotedText: string | null;

  @ApiPropertyOptional({ description: '回复消息ID' })
  parentId: number | null;

  @ApiPropertyOptional({ description: '@提及的用户ID列表' })
  mentions: number[] | null;

  @ApiPropertyOptional({ description: '表情反应' })
  reactions: Record<string, number[]> | null;

  @ApiProperty({ description: '是否已编辑' })
  isEdited: boolean;

  @ApiProperty({ description: '是否已删除' })
  isDeleted: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: '发送者信息' })
  user?: {
    id: number;
    username: string;
    account: string;
  };

  @ApiPropertyOptional({ description: '回复的消息信息' })
  parent?: ChatMessageResponseDto;

  @ApiPropertyOptional({
    description: '回复列表',
    type: [ChatMessageResponseDto],
  })
  replies?: ChatMessageResponseDto[];
}

export class ChatRoomResponseDto {
  @ApiProperty({ description: '聊天室ID' })
  id: number;

  @ApiProperty({ description: '文档ID' })
  documentId: number;

  @ApiProperty({ description: '聊天室名称' })
  name: string;

  @ApiProperty({ description: '是否激活' })
  isActive: boolean;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: '消息数量' })
  messageCount?: number;
}
