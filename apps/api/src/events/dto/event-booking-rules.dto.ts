// PHASE_3_EVENTS_MODULE
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class EventBookingRulesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minPartySize?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxPartySize!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  holdMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bookingCutoffMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cancellationCutoffMinutes?: number;

  @IsOptional()
  @IsBoolean()
  autoAssignSmallestTable?: boolean;

  @IsOptional()
  @IsBoolean()
  allowManualAssignment?: boolean;

  @IsOptional()
  @IsBoolean()
  requirePhone?: boolean;
}
