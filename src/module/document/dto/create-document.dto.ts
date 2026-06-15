import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDocumentDto {
  @ApiPropertyOptional({
    description: '兼容旧字段，实际创建人以 token 为准',
    example: '0',
  })
  @IsOptional()
  id?: number;

  @ApiProperty({
    description: '文本标题',
    example: '标题',
  })
  @IsString({ message: '标题必须是字符串' })
  @IsNotEmpty({ message: '标题不能为空' })
  @MaxLength(255, { message: '标题最多 255 个字符' })
  title?: string;
}
