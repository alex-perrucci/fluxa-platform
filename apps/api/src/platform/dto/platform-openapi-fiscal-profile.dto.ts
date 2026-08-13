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
import {
  FISCAL_ENVIRONMENTS,
  type FiscalEnvironment,
} from '../../fiscal/fiscal.constants';

export class PlatformOpenApiFiscalProfileDto {
  @IsEnum(FISCAL_ENVIRONMENTS)
  environment!: FiscalEnvironment;

  @Transform(({ value }) => String(value).trim())
  @Matches(/^\d{11}$/)
  fiscalId!: string;

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
}
