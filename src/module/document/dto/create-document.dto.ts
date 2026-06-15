import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class CreateDocumentDto {
  @ApiProperty({
    description: '用户id',
    example: '0',
  })
  @IsNotEmpty({ message: '用户不能为空' })
  id: number;

  @ApiProperty({
    description: '文本标题',
    example: '标题',
  })
  title?: string;
}
