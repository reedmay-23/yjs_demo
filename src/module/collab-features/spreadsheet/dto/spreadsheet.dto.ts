import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSpreadsheetDto {
  @ApiProperty({
    description: '文档ID',
    example: 1,
  })
  @IsInt({ message: 'documentId must be an integer' })
  @Min(1, { message: 'documentId must be positive' })
  documentId: number;

  @ApiPropertyOptional({
    description: '表格标题',
    example: '销售数据表',
  })
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  @MaxLength(255, { message: 'title cannot exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: '行数',
    example: 100,
  })
  @IsOptional()
  @IsInt({ message: 'rowCount must be an integer' })
  @Min(1, { message: 'rowCount must be at least 1' })
  @Max(10000, { message: 'rowCount cannot exceed 10000' })
  rowCount?: number;

  @ApiPropertyOptional({
    description: '列数',
    example: 26,
  })
  @IsOptional()
  @IsInt({ message: 'colCount must be an integer' })
  @Min(1, { message: 'colCount must be at least 1' })
  @Max(1000, { message: 'colCount cannot exceed 1000' })
  colCount?: number;
}

export class UpdateSpreadsheetDto {
  @ApiPropertyOptional({
    description: '表格标题',
    example: '更新后的标题',
  })
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  @MaxLength(255, { message: 'title cannot exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: '行数',
    example: 200,
  })
  @IsOptional()
  @IsInt({ message: 'rowCount must be an integer' })
  @Min(1, { message: 'rowCount must be at least 1' })
  @Max(10000, { message: 'rowCount cannot exceed 10000' })
  rowCount?: number;

  @ApiPropertyOptional({
    description: '列数',
    example: 52,
  })
  @IsOptional()
  @IsInt({ message: 'colCount must be an integer' })
  @Min(1, { message: 'colCount must be at least 1' })
  @Max(1000, { message: 'colCount cannot exceed 1000' })
  colCount?: number;
}

export class UpdateCellDto {
  @ApiProperty({
    description: '行号',
    example: 0,
  })
  @IsInt({ message: 'row must be an integer' })
  @Min(0, { message: 'row cannot be negative' })
  row: number;

  @ApiProperty({
    description: '列号',
    example: 0,
  })
  @IsInt({ message: 'col must be an integer' })
  @Min(0, { message: 'col cannot be negative' })
  col: number;

  @ApiPropertyOptional({
    description: '单元格值',
    example: 'Hello World',
  })
  @IsOptional()
  @IsString({ message: 'value must be a string' })
  value?: string;

  @ApiPropertyOptional({
    description: '公式',
    example: '=SUM(A1:A10)',
  })
  @IsOptional()
  @IsString({ message: 'formula must be a string' })
  @MaxLength(1000, { message: 'formula cannot exceed 1000 characters' })
  formula?: string;

  @ApiPropertyOptional({
    description: '单元格格式',
    example: {
      bold: true,
      italic: false,
      fontSize: 12,
      color: '#000000',
      backgroundColor: '#ffffff',
    },
  })
  @IsOptional()
  @IsObject({ message: 'format must be an object' })
  format?: Record<string, any>;

  @ApiPropertyOptional({
    description: '数据验证规则',
    example: {
      type: 'number',
      min: 0,
      max: 100,
    },
  })
  @IsOptional()
  @IsObject({ message: 'validation must be an object' })
  validation?: Record<string, any>;
}

export class UpdateMultipleCellsDto {
  @ApiProperty({
    description: '单元格更新列表',
    type: [UpdateCellDto],
  })
  @IsArray({ message: 'cells must be an array' })
  @ArrayNotEmpty({ message: 'cells cannot be empty' })
  @ArrayMaxSize(1000, { message: 'at most 1000 cells can be updated at once' })
  @ValidateNested({ each: true })
  @Type(() => UpdateCellDto)
  cells: UpdateCellDto[];
}

export class SpreadsheetCellResponseDto {
  @ApiProperty({ description: '单元格ID' })
  id: number;

  @ApiProperty({ description: '表格ID' })
  spreadsheetId: number;

  @ApiProperty({ description: '行号' })
  row: number;

  @ApiProperty({ description: '列号' })
  col: number;

  @ApiPropertyOptional({ description: '单元格值' })
  value: string | null;

  @ApiPropertyOptional({ description: '公式' })
  formula: string | null;

  @ApiPropertyOptional({ description: '单元格格式' })
  format: Record<string, any> | null;

  @ApiPropertyOptional({ description: '数据验证规则' })
  validation: Record<string, any> | null;

  @ApiProperty({ description: '创建者ID' })
  createdBy: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;
}

export class SpreadsheetResponseDto {
  @ApiProperty({ description: '表格ID' })
  id: number;

  @ApiProperty({ description: '文档ID' })
  documentId: number;

  @ApiProperty({ description: '表格标题' })
  title: string;

  @ApiProperty({ description: '行数' })
  rowCount: number;

  @ApiProperty({ description: '列数' })
  colCount: number;

  @ApiProperty({ description: '版本号' })
  version: number;

  @ApiProperty({ description: '创建者ID' })
  createdBy: number;

  @ApiProperty({ description: '创建时间' })
  createdAt: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: '单元格数据',
    type: [SpreadsheetCellResponseDto],
  })
  cells?: SpreadsheetCellResponseDto[];
}
