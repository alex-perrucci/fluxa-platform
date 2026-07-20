import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CATALOG_STATUSES, PRODUCT_UNITS } from '../catalog.constants';

export class UpdateProductDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  vatRateId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  @Matches(/^[A-Z0-9_.-]+$/i)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  barcode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @IsIn(PRODUCT_UNITS)
  unit?: (typeof PRODUCT_UNITS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  quantityScale?: number;

  @IsOptional()
  @IsBoolean()
  trackAvailability?: boolean;

  @IsOptional()
  @IsIn(CATALOG_STATUSES)
  status?: (typeof CATALOG_STATUSES)[number];
}
