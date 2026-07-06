import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDocumentDto {
  @ApiPropertyOptional({
    description: '兼容旧字段，实际创建人以 token 为准',
    example: 0,
  })
  @IsOptional()
  id?: number;

  @ApiProperty({
    description: '文档标题',
    example: '项目方案',
  })
  @IsString({ message: '标题必须是字符串' })
  @IsNotEmpty({ message: '标题不能为空' })
  @MaxLength(255, { message: '标题最多 255 个字符' })
  title?: string;

  @ApiPropertyOptional({
    description: '文档摘要',
    example: '用于记录项目方案的协作文档',
  })
  @IsOptional()
  @IsString({ message: '摘要必须是字符串' })
  @MaxLength(1000, { message: '摘要最多 1000 个字符' })
  summary?: string;

  @ApiPropertyOptional({
    description: '文档状态',
    enum: ['active', 'archived'],
    default: 'active',
  })
  @IsOptional()
  @IsIn(['active', 'archived'], { message: 'status must be active or archived' })
  status?: 'active' | 'archived';
}
