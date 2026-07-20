import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  FISCAL_DOCUMENT_STATUSES,
  FISCAL_DOCUMENT_TYPES,
  type FiscalDocumentStatus,
  type FiscalDocumentType,
} from '../fiscal.constants';

export class FiscalDocumentListQueryDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsEnum(FISCAL_DOCUMENT_TYPES)
  type?: FiscalDocumentType;

  @IsOptional()
  @IsEnum(FISCAL_DOCUMENT_STATUSES)
  status?: FiscalDocumentStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}
