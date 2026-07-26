// PHASE_3_EVENTS_MODULE
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @Length(3, 220)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(3, 180)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i)
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20_000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  coverImageUrl?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  bookingOpensAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  bookingClosesAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bookingAmountCents?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/i)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  cancellationPolicy?: string | null;
}
