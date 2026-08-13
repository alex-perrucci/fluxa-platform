import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CATALOG_STATUSES } from '../catalog.constants';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_-]+$/i)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?:#[0-9A-F]{6})?$/i)
  colorHex?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsIn(CATALOG_STATUSES)
  status?: (typeof CATALOG_STATUSES)[number];
}
