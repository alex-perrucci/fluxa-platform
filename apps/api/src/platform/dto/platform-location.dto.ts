import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class PlatformLocationCopyOptionsDto {
  @IsBoolean()
  layout!: boolean;

  @IsBoolean()
  catalog!: boolean;

  @IsBoolean()
  priceLists!: boolean;

  @IsBoolean()
  fiscalProfile!: boolean;
}

export class CreatePlatformLocationDto {
  @IsUUID()
  merchantId!: string;

  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_-]+$/i)
  code!: string;

  @IsString()
  @Length(2, 180)
  name!: string;

  @IsString()
  @Length(2, 220)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  addressLine2?: string;

  @IsString()
  @Length(3, 20)
  postalCode!: string;

  @IsString()
  @Length(2, 120)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  province?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/i)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  timezone?: string;

  @IsIn(['PERMANENT', 'TEMPORARY'])
  kind!: 'PERMANENT' | 'TEMPORARY';

  @ValidateIf((value: CreatePlatformLocationDto) => value.kind === 'TEMPORARY')
  @IsISO8601({ strict: true })
  activeFrom?: string;

  @ValidateIf((value: CreatePlatformLocationDto) => value.kind === 'TEMPORARY')
  @IsISO8601({ strict: true })
  activeUntil?: string;

  @IsOptional()
  @IsUUID()
  sourceLocationId?: string;

  @IsOptional()
  @Type(() => PlatformLocationCopyOptionsDto)
  copy?: PlatformLocationCopyOptionsDto;
}

export class UpdatePlatformLocationDto {
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
  @Matches(/^[A-Z]{2}$/i)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  timezone?: string;

  @IsOptional()
  @IsIn(['PERMANENT', 'TEMPORARY'])
  kind?: 'PERMANENT' | 'TEMPORARY';

  @IsOptional()
  @IsISO8601({ strict: true })
  activeFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  activeUntil?: string;
}

export class PlatformLocationLifecycleDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status!: 'ACTIVE' | 'INACTIVE';
}
