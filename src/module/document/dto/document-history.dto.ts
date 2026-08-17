import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class GetDocumentHistoryDto {
  @ApiProperty({
    description: 'Document ID.',
    example: 1,
  })
  @IsInt({ message: 'documentId must be an integer' })
  documentId: number;
}

export class RollbackDocumentDto extends GetDocumentHistoryDto {
  @ApiProperty({
    description: 'Target history record ID.',
    example: 10,
  })
  @IsInt({ message: 'historyId must be an integer' })
  historyId: number;

  @ApiPropertyOptional({
    description: 'Rollback reason shown in history.',
    example: 'Restore the confirmed draft.',
  })
  @IsOptional()
  @IsString({ message: 'summary must be a string' })
  @MaxLength(500, { message: 'summary cannot exceed 500 characters' })
  summary?: string;
}

export class ManualSnapshotDto extends GetDocumentHistoryDto {
  @ApiPropertyOptional({
    description: 'Manual version note.',
    example: 'Before submitting the final review.',
  })
  @IsOptional()
  @IsString({ message: 'summary must be a string' })
  @MaxLength(500, { message: 'summary cannot exceed 500 characters' })
  summary?: string;
}

export class CompareHistorySnapshotDto extends GetDocumentHistoryDto {
  @ApiProperty({
    description: 'History record ID to compare with current document snapshot.',
    example: 10,
  })
  @IsInt({ message: 'historyId must be an integer' })
  historyId: number;

  @ApiPropertyOptional({
    description: 'Yjs field used by Tiptap Collaboration.',
    example: 'default',
  })
  @IsOptional()
  @IsString({ message: 'field must be a string' })
  field?: string;
}
