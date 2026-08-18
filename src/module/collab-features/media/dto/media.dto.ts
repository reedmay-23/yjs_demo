import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
}

export enum AnnotationType {
  COMMENT = 'comment',
  HIGHLIGHT = 'highlight',
  DRAWING = 'drawing',
  TIMESTAMP = 'timestamp',
}

export class UploadMediaDto {
  @ApiProperty({
    description: '文档ID',
    example: 1,
  })
  @IsInt({ message: 'documentId must be an integer' })
  @Min(1, { message: 'documentId must be positive' })
  documentId: number;

  @ApiProperty({
    description: '文件名',
    example: 'photo.jpg',
  })
  @IsString({ message: 'fileName must be a string' })
  @MaxLength(255, { message: 'fileName cannot exceed 255 characters' })
  fileName: string;

  @ApiProperty({
    description: '文件类型',
    example: MediaType.IMAGE,
    enum: MediaType,
  })
  @IsEnum(MediaType, { message: 'fileType must be a valid media type' })
  fileType: MediaType;

  @ApiProperty({
    description: '文件大小（字节）',
    example: 1024000,
  })
  @IsInt({ message: 'fileSize must be an integer' })
  @Min(0, { message: 'fileSize cannot be negative' })
  fileSize: number;

  @ApiProperty({
    description: '文件路径',
    example: '/uploads/media/photo.jpg',
  })
  @IsString({ message: 'filePath must be a string' })
  @MaxLength(500, { message: 'filePath cannot exceed 500 characters' })
  filePath: string;

  @ApiProperty({
    description: 'MIME类型',
    example: 'image/jpeg',
  })
  @IsString({ message: 'mimeType must be a string' })
  @MaxLength(100, { message: 'mimeType cannot exceed 100 characters' })
  mimeType: string;

  @ApiPropertyOptional({
    description: '媒体元数据',
    example: {
      width: 1920,
      height: 1080,
      duration: 120.5,
    },
  })
  @IsOptional()
  @IsObject({ message: 'metadata must be an object' })
  metadata?: Record<string, any>;
}

export class UpdateMediaDto {
  @ApiPropertyOptional({
    description: '文件名',
    example: 'updated_photo.jpg',
  })
  @IsOptional()
  @IsString({ message: 'fileName must be a string' })
  @MaxLength(255, { message: 'fileName cannot exceed 255 characters' })
  fileName?: string;

  @ApiPropertyOptional({
    description: '媒体元数据',
    example: {
      width: 1920,
      height: 1080,
      duration: 120.5,
    },
  })
  @IsOptional()
  @IsObject({ message: 'metadata must be an object' })
  metadata?: Record<string, any>;
}

export class CreateAnnotationDto {
  @ApiProperty({
    description: '标注类型',
    example: AnnotationType.COMMENT,
    enum: AnnotationType,
  })
  @IsEnum(AnnotationType, {
    message: 'annotationType must be a valid annotation type',
  })
  annotationType: AnnotationType;

  @ApiProperty({
    description: '标注内容',
    example: '这里需要修改一下',
  })
  @IsString({ message: 'content must be a string' })
  @MaxLength(5000, { message: 'content cannot exceed 5000 characters' })
  content: string;

  @ApiProperty({
    description: '标注位置信息',
    example: {
      x: 100,
      y: 200,
      width: 300,
      height: 150,
    },
  })
  @IsObject({ message: 'position must be an object' })
  position: Record<string, any>;

  @ApiPropertyOptional({
    description: '视频/音频开始时间（秒）',
    example: 10.5,
  })
  @IsOptional()
  @IsNumber({}, { message: 'startTime must be a number' })
  @Min(0, { message: 'startTime cannot be negative' })
  startTime?: number;

  @ApiPropertyOptional({
    description: '视频/音频结束时间（秒）',
    example: 15.0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'endTime must be a number' })
  @Min(0, { message: 'endTime cannot be negative' })
  endTime?: number;
}

export class UpdateAnnotationDto {
  @ApiPropertyOptional({
    description: '标注内容',
    example: '更新后的标注内容',
  })
  @IsOptional()
  @IsString({ message: 'content must be a string' })
  @MaxLength(5000, { message: 'content cannot exceed 5000 characters' })
  content?: string;

  @ApiPropertyOptional({
    description: '标注位置信息',
    example: {
      x: 150,
      y: 250,
      width: 350,
      height: 200,
    },
  })
  @IsOptional()
  @IsObject({ message: 'position must be an object' })
  position?: Record<string, any>;

  @ApiPropertyOptional({
    description: '视频/音频开始时间（秒）',
    example: 12.0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'startTime must be a number' })
  @Min(0, { message: 'startTime cannot be negative' })
  startTime?: number;

  @ApiPropertyOptional({
    description: '视频/音频结束时间（秒）',
    example: 18.0,
  })
  @IsOptional()
  @IsNumber({}, { message: 'endTime must be a number' })
  @Min(0, { message: 'endTime cannot be negative' })
  endTime?: number;
}

export class MediaAnnotationResponseDto {
  @ApiProperty({ description: '标注ID' })
  id: number;

  @ApiProperty({ description: '媒体文件ID' })
  mediaId: number;

  @ApiProperty({ description: '用户ID' })
  userId: number;

  @ApiProperty({ description: '标注类型' })
  annotationType: AnnotationType;

  @ApiProperty({ description: '标注内容' })
  content: string;

  @ApiProperty({ description: '标注位置信息' })
  position: Record<string, any>;

  @ApiPropertyOptional({ description: '开始时间' })
  startTime: number | null;

  @ApiPropertyOptional({ description: '结束时间' })
  endTime: number | null;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: '用户信息' })
  user?: {
    id: number;
    username: string;
    account: string;
  };
}

export class MediaFileResponseDto {
  @ApiProperty({ description: '媒体文件ID' })
  id: number;

  @ApiProperty({ description: '文档ID' })
  documentId: number;

  @ApiProperty({ description: '文件名' })
  fileName: string;

  @ApiProperty({ description: '文件类型' })
  fileType: MediaType;

  @ApiProperty({ description: '文件大小' })
  fileSize: number;

  @ApiProperty({ description: '文件路径' })
  filePath: string;

  @ApiProperty({ description: 'MIME类型' })
  mimeType: string;

  @ApiPropertyOptional({ description: '媒体元数据' })
  metadata: Record<string, any> | null;

  @ApiProperty({ description: '上传者ID' })
  uploadedBy: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: '上传者信息' })
  uploader?: {
    id: number;
    username: string;
    account: string;
  };

  @ApiPropertyOptional({
    description: '标注列表',
    type: [MediaAnnotationResponseDto],
  })
  annotations?: MediaAnnotationResponseDto[];
}
