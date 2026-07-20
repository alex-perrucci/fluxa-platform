import {
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CATALOG_STATUSES } from '../catalog.constants';

export class UpdatePriceListDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_-]+$/i)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(2, 140)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  @MaxLength(40)
  startsAt?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  @MaxLength(40)
  endsAt?: string | null;

  @IsOptional()
  @IsIn(CATALOG_STATUSES)
  status?: (typeof CATALOG_STATUSES)[number];
}
