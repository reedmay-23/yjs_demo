import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDocumentDto {
  @ApiProperty({
    description: '文档 ID',
    example: 1,
  })
  @IsInt({ message: '文档 ID 必须是整数' })
  id: number;

  @ApiPropertyOptional({
    description: '文档标题',
    example: '项目方案 v2',
  })
  @IsOptional()
  @IsString({ message: '标题必须是字符串' })
  @MaxLength(255, { message: '标题最多 255 个字符' })
  title?: string;

  @ApiPropertyOptional({
    description: '文档摘要',
    example: '更新后的项目方案摘要',
  })
  @IsOptional()
  @IsString({ message: '摘要必须是字符串' })
  @MaxLength(1000, { message: '摘要最多 1000 个字符' })
  summary?: string;

  @ApiPropertyOptional({
    description: '文档状态',
    enum: ['active', 'archived'],
  })
  @IsOptional()
  @IsIn(['active', 'archived'], { message: 'status must be active or archived' })
  status?: 'active' | 'archived';
}
