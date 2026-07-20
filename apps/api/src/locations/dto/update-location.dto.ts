import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { locationStatus } from '@fluxa/database';

export class UpdateLocationDto {
  @IsOptional()
  @IsUUID()
  merchantId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_-]+$/i)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(2, 180)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 220)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @Length(3, 20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  province?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  timezone?: string;

  @IsOptional()
  @IsIn(locationStatus.enumValues)
  status?: 'ACTIVE' | 'INACTIVE';
}
