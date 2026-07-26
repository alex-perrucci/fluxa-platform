// PHASE_3_EVENTS_MODULE
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EventBookingRulesDto } from './event-booking-rules.dto';

export class CreateEventDto {
  @IsUUID()
  locationId!: string;

  @IsString()
  @Length(3, 220)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(3, 180)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i)
  slug?: string;

  @IsString()
  @Length(1, 20_000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  coverImageUrl?: string;

  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsISO8601({ strict: true })
  endsAt!: string;

  @IsISO8601({ strict: true })
  bookingOpensAt!: string;

  @IsISO8601({ strict: true })
  bookingClosesAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  bookingAmountCents!: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/i)
  currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  cancellationPolicy?: string;

  @ValidateNested()
  @Type(() => EventBookingRulesDto)
  bookingRules!: EventBookingRulesDto;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  tableIds?: string[];
}
