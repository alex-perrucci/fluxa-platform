import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { FISCAL_ENVIRONMENTS, type FiscalEnvironment } from '../../fiscal/fiscal.constants';

export class PlatformOpenApiFiscalProfileDto {
  @IsEnum(FISCAL_ENVIRONMENTS)
  environment!: FiscalEnvironment;

  @Transform(({ value }) => String(value).trim())
  @Matches(/^\d{11}$/)
  fiscalId!: string;

  @IsString()
  @Length(2, 220)
  companyName!: string;

  @IsEmail()
  @MaxLength(320)
  companyEmail!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  autoIssueOnPaid!: boolean;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  receiptEmail?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @IsOptional()
  @Transform(({ value }) => String(value).trim().toUpperCase())
  @Matches(/^[A-Z0-9]{11,16}$/)
  taxCode?: string;

  @IsOptional()
  @IsString()
  @Length(4, 200)
  receiptsPassword?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  receiptsPin?: string;
}
