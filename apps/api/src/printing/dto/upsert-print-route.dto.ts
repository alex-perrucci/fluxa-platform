import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PRINT_DOCUMENT_TYPES } from '../printing.constants';

export class UpsertPrintRouteDto {
  @IsUUID()
  locationId!: string;

  @IsIn(PRINT_DOCUMENT_TYPES)
  documentType!: (typeof PRINT_DOCUMENT_TYPES)[number];

  @IsOptional()
  @IsUUID()
  kitchenStationId?: string | null;

  @IsUUID()
  printerId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  copies?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
