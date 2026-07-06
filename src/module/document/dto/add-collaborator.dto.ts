import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional } from 'class-validator';

export type DocumentCollaboratorRole = 'viewer' | 'editor';

export class AddCollaboratorDto {
  @ApiProperty({
    description: '文档 ID',
    example: 1,
  })
  @IsInt({ message: '文档 ID 必须是整数' })
  documentId: number;

  @ApiProperty({
    description: '协作者用户 ID',
    example: 2,
  })
  @IsInt({ message: '用户 ID 必须是整数' })
  userId: number;

  @ApiPropertyOptional({
    description: '协作者角色，viewer 只读，editor 可编辑',
    enum: ['viewer', 'editor'],
    default: 'editor',
  })
  @IsOptional()
  @IsIn(['viewer', 'editor'], { message: 'role must be viewer or editor' })
  role?: DocumentCollaboratorRole;
}

export class GetCollaboratorsDto {
  @ApiProperty({
    description: '文档 ID',
    example: 1,
  })
  @IsInt({ message: '文档 ID 必须是整数' })
  documentId: number;
}

export class RemoveCollaboratorDto {
  @ApiProperty({
    description: '文档 ID',
    example: 1,
  })
  @IsInt({ message: '文档 ID 必须是整数' })
  documentId: number;

  @ApiProperty({
    description: '协作者用户 ID',
    example: 2,
  })
  @IsInt({ message: '用户 ID 必须是整数' })
  userId: number;
}

export class UpdateCollaboratorRoleDto extends RemoveCollaboratorDto {
  @ApiProperty({
    description: '协作者角色',
    enum: ['viewer', 'editor'],
    example: 'viewer',
  })
  @IsIn(['viewer', 'editor'], { message: 'role must be viewer or editor' })
  role: DocumentCollaboratorRole;
}
