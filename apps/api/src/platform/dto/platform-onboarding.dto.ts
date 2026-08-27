// PHASE_8_TRUE_CONTROL_CENTER
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SUBSCRIPTION_PLANS,
  type SubscriptionPlan,
} from '../../subscriptions/entitlements';

export class PlatformOnboardingTableDto {
  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_.-]+$/i)
  code!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  capacity!: number;
}

export class PlatformOnboardingDto {
  @IsString()
  @Length(2, 180)
  organizationName!: string;

  @IsString()
  @Length(3, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  organizationSlug!: string;

  @IsIn(SUBSCRIPTION_PLANS)
  plan!: SubscriptionPlan;

  @IsEmail()
  @MaxLength(320)
  ownerEmail!: string;

  @IsString()
  @Length(2, 160)
  ownerDisplayName!: string;

  @IsString()
  @Length(12, 200)
  ownerTemporaryPassword!: string;

  @IsString()
  @Length(2, 220)
  legalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  tradeName?: string;

  @IsString()
  @Matches(/^[A-Z0-9]{5,32}$/i)
  vatNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_-]+$/i)
  locationCode!: string;

  @IsString()
  @Length(2, 180)
  locationName!: string;

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
  @Length(3, 80)
  timezone?: string;

  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_.-]+$/i)
  areaCode!: string;

  @IsString()
  @Length(2, 120)
  areaName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PlatformOnboardingTableDto)
  tables!: PlatformOnboardingTableDto[];
}
