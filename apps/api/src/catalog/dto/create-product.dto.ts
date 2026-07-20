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
import { PRODUCT_UNITS } from '../catalog.constants';

export class CreateProductDto {
  @IsUUID()
  categoryId!: string;

  @IsUUID()
  vatRateId!: string;

  @IsString()
  @Length(1, 50)
  @Matches(/^[A-Z0-9_.-]+$/i)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  barcode?: string;

  @IsString()
  @Length(2, 180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  imageUrl?: string;

  @IsIn(PRODUCT_UNITS)
  unit!: (typeof PRODUCT_UNITS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  quantityScale?: number;

  @IsOptional()
  @IsBoolean()
  trackAvailability?: boolean;
}
