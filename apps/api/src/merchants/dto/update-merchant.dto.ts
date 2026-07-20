import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { merchantStatus } from '@fluxa/database';

export class UpdateMerchantDto {
  @IsOptional()
  @IsString()
  @Length(2, 220)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  tradeName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{5,32}$/i)
  vatNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @IsOptional()
  @IsIn(merchantStatus.enumValues)
  status?: 'ACTIVE' | 'INACTIVE';
}
