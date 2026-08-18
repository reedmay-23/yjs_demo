import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWhiteboardDto {
  @ApiProperty({
    description: '文档ID',
    example: 1,
  })
  @IsInt({ message: 'documentId must be an integer' })
  @Min(1, { message: 'documentId must be positive' })
  documentId: number;

  @ApiPropertyOptional({
    description: '白板标题',
    example: '项目架构图',
  })
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  @MaxLength(255, { message: 'title cannot exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: '白板描述',
    example: '用于绘制项目架构图的协作白板',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(1000, { message: 'description cannot exceed 1000 characters' })
  description?: string;
}

export class UpdateWhiteboardDto {
  @ApiPropertyOptional({
    description: '白板标题',
    example: '更新后的标题',
  })
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  @MaxLength(255, { message: 'title cannot exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: '白板描述',
    example: '更新后的描述',
  })
  @IsOptional()
  @IsString({ message: 'description must be a string' })
  @MaxLength(1000, { message: 'description cannot exceed 1000 characters' })
  description?: string;
}

export class AddWhiteboardElementDto {
  @ApiProperty({
    description: '元素类型',
    example: 'pen',
    enum: ['pen', 'shape', 'text', 'image', 'line', 'arrow'],
  })
  @IsString({ message: 'elementType must be a string' })
  @IsIn(['pen', 'shape', 'text', 'image', 'line', 'arrow'], {
    message: 'elementType is not supported',
  })
  elementType: string;

  @ApiProperty({
    description: '元素属性',
    example: {
      points: [
        [0, 0],
        [100, 100],
      ],
      strokeColor: '#000000',
      strokeWidth: 2,
    },
  })
  @IsObject({ message: 'properties must be an object' })
  properties: Record<string, any>;

  @ApiPropertyOptional({
    description: '图层层级',
    example: 0,
  })
  @IsOptional()
  @IsInt({ message: 'zIndex must be an integer' })
  @Min(0, { message: 'zIndex cannot be negative' })
  zIndex?: number;
}

export class UpdateWhiteboardElementDto {
  @ApiPropertyOptional({
    description: '元素属性',
    example: {
      points: [
        [0, 0],
        [100, 100],
      ],
      strokeColor: '#ff0000',
    },
  })
  @IsOptional()
  @IsObject({ message: 'properties must be an object' })
  properties?: Record<string, any>;

  @ApiPropertyOptional({
    description: '图层层级',
    example: 1,
  })
  @IsOptional()
  @IsInt({ message: 'zIndex must be an integer' })
  @Min(0, { message: 'zIndex cannot be negative' })
  zIndex?: number;
}

export class WhiteboardElementResponseDto {
  @ApiProperty({ description: '元素ID' })
  id: number;

  @ApiProperty({ description: '白板ID' })
  whiteboardId: number;

  @ApiProperty({ description: '元素类型' })
  elementType: string;

  @ApiProperty({ description: '元素属性' })
  properties: Record<string, any>;

  @ApiProperty({ description: '图层层级' })
  zIndex: number;

  @ApiProperty({ description: '创建者ID' })
  createdBy: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

export class WhiteboardResponseDto {
  @ApiProperty({ description: '白板ID' })
  id: number;

  @ApiProperty({ description: '文档ID' })
  documentId: number;

  @ApiProperty({ description: '白板标题' })
  title: string;

  @ApiProperty({ description: '白板描述' })
  description: string | null;

  @ApiProperty({ description: '版本号' })
  version: number;

  @ApiProperty({ description: '创建者ID' })
  createdBy: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: '白板元素列表',
    type: [WhiteboardElementResponseDto],
  })
  elements?: WhiteboardElementResponseDto[];
}
