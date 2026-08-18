import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export class CreateTaskBoardDto {
  @ApiProperty({
    description: '文档ID',
    example: 1,
  })
  @IsInt({ message: 'documentId must be an integer' })
  @Min(1, { message: 'documentId must be positive' })
  documentId: number;

  @ApiPropertyOptional({
    description: '看板标题',
    example: '项目任务看板',
  })
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  @MaxLength(255, { message: 'title cannot exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: '看板描述',
    example: '用于管理项目任务的看板',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(1000, { message: 'description cannot exceed 1000 characters' })
  description?: string;
}

export class UpdateTaskBoardDto {
  @ApiPropertyOptional({
    description: '看板标题',
    example: '更新后的标题',
  })
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  @MaxLength(255, { message: 'title cannot exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: '看板描述',
    example: '更新后的描述',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(1000, { message: 'description cannot exceed 1000 characters' })
  description?: string;
}

export class CreateTaskColumnDto {
  @ApiProperty({
    description: '列标题',
    example: '待办',
  })
  @IsString({ message: 'title must be a string' })
  @MaxLength(255, { message: 'title cannot exceed 255 characters' })
  title: string;

  @ApiPropertyOptional({
    description: '列颜色',
    example: '#ff0000',
  })
  @IsOptional()
  @IsString({ message: 'color must be a string' })
  @MaxLength(32, { message: 'color cannot exceed 32 characters' })
  color?: string;

  @ApiPropertyOptional({
    description: '列位置',
    example: 0,
  })
  @IsOptional()
  @IsInt({ message: 'position must be an integer' })
  @Min(0, { message: 'position cannot be negative' })
  position?: number;
}

export class UpdateTaskColumnDto {
  @ApiPropertyOptional({
    description: '列标题',
    example: '更新后的标题',
  })
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  @MaxLength(255, { message: 'title cannot exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: '列颜色',
    example: '#00ff00',
  })
  @IsOptional()
  @IsString({ message: 'color must be a string' })
  @MaxLength(32, { message: 'color cannot exceed 32 characters' })
  color?: string;

  @ApiPropertyOptional({
    description: '列位置',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'position must be an integer' })
  @Min(0, { message: 'position cannot be negative' })
  position?: number;
}

export class CreateTaskCardDto {
  @ApiProperty({
    description: '任务标题',
    example: '完成前端页面开发',
  })
  @IsString({ message: 'title must be a string' })
  @MaxLength(255, { message: 'title cannot exceed 255 characters' })
  title: string;

  @ApiPropertyOptional({
    description: '任务描述',
    example: '需要完成用户登录页面的开发',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiPropertyOptional({
    description: '任务优先级',
    example: TaskPriority.MEDIUM,
    enum: TaskPriority,
  })
  @IsOptional()
  @IsEnum(TaskPriority, { message: 'priority must be a valid priority' })
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: '截止日期',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString({}, { message: 'dueDate must be a valid date' })
  dueDate?: string;

  @ApiPropertyOptional({
    description: '负责人ID',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'assigneeId must be an integer' })
  @Min(1, { message: 'assigneeId must be positive' })
  assigneeId?: number;

  @ApiPropertyOptional({
    description: '标签列表',
    example: ['前端', '紧急'],
  })
  @IsOptional()
  @IsArray({ message: 'tags must be an array' })
  @ArrayMaxSize(50, { message: 'tags cannot exceed 50 items' })
  @IsString({ each: true, message: 'each tag must be a string' })
  tags?: string[];

  @ApiPropertyOptional({
    description: '卡片位置',
    example: 0,
  })
  @IsOptional()
  @IsInt({ message: 'position must be an integer' })
  @Min(0, { message: 'position cannot be negative' })
  position?: number;
}

export class UpdateTaskCardDto {
  @ApiPropertyOptional({
    description: '任务标题',
    example: '更新后的标题',
  })
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  @MaxLength(255, { message: 'title cannot exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: '任务描述',
    example: '更新后的描述',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @ApiPropertyOptional({
    description: '任务优先级',
    example: TaskPriority.HIGH,
    enum: TaskPriority,
  })
  @IsOptional()
  @IsEnum(TaskPriority, { message: 'priority must be a valid priority' })
  priority?: TaskPriority;

  @ApiPropertyOptional({
    description: '截止日期',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString({}, { message: 'dueDate must be a valid date' })
  dueDate?: string;

  @ApiPropertyOptional({
    description: '负责人ID',
    example: 2,
  })
  @IsOptional()
  @IsInt({ message: 'assigneeId must be an integer' })
  @Min(1, { message: 'assigneeId must be positive' })
  assigneeId?: number;

  @ApiPropertyOptional({
    description: '标签列表',
    example: ['前端', '紧急', '已修改'],
  })
  @IsOptional()
  @IsArray({ message: 'tags must be an array' })
  @ArrayMaxSize(50, { message: 'tags cannot exceed 50 items' })
  @IsString({ each: true, message: 'each tag must be a string' })
  tags?: string[];

  @ApiPropertyOptional({
    description: '卡片位置',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'position must be an integer' })
  @Min(0, { message: 'position cannot be negative' })
  position?: number;
}

export class MoveTaskCardDto {
  @ApiProperty({
    description: '目标列ID',
    example: 2,
  })
  @IsInt({ message: 'targetColumnId must be an integer' })
  @Min(1, { message: 'targetColumnId must be positive' })
  targetColumnId: number;

  @ApiProperty({
    description: '目标位置',
    example: 0,
  })
  @IsInt({ message: 'position must be an integer' })
  @Min(0, { message: 'position cannot be negative' })
  position: number;
}

export class TaskCardResponseDto {
  @ApiProperty({ description: '任务ID' })
  id: number;

  @ApiProperty({ description: '列ID' })
  columnId: number;

  @ApiProperty({ description: '任务标题' })
  title: string;

  @ApiPropertyOptional({ description: '任务描述' })
  description: string | null;

  @ApiProperty({ description: '位置' })
  position: number;

  @ApiProperty({ description: '优先级' })
  priority: TaskPriority;

  @ApiPropertyOptional({ description: '截止日期' })
  dueDate: Date | null;

  @ApiPropertyOptional({ description: '负责人ID' })
  assigneeId: number | null;

  @ApiPropertyOptional({ description: '标签列表' })
  tags: string[] | null;

  @ApiPropertyOptional({ description: '附件信息' })
  attachments: any[] | null;

  @ApiProperty({ description: '创建者ID' })
  createdBy: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: '负责人信息' })
  assignee?: {
    id: number;
    username: string;
    account: string;
  };

  @ApiPropertyOptional({ description: '创建者信息' })
  creator?: {
    id: number;
    username: string;
    account: string;
  };
}

export class TaskColumnResponseDto {
  @ApiProperty({ description: '列ID' })
  id: number;

  @ApiProperty({ description: '看板ID' })
  boardId: number;

  @ApiProperty({ description: '列标题' })
  title: string;

  @ApiProperty({ description: '位置' })
  position: number;

  @ApiPropertyOptional({ description: '列颜色' })
  color: string | null;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: '任务卡片列表',
    type: [TaskCardResponseDto],
  })
  cards?: TaskCardResponseDto[];
}

export class TaskBoardResponseDto {
  @ApiProperty({ description: '看板ID' })
  id: number;

  @ApiProperty({ description: '文档ID' })
  documentId: number;

  @ApiProperty({ description: '看板标题' })
  title: string;

  @ApiPropertyOptional({ description: '看板描述' })
  description: string | null;

  @ApiProperty({ description: '创建者ID' })
  createdBy: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: '列列表', type: [TaskColumnResponseDto] })
  columns?: TaskColumnResponseDto[];
}
