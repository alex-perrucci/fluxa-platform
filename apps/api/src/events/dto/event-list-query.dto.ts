// PHASE_3_EVENTS_MODULE
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EVENT_STATUSES } from '../event.constants';

export class EventListQueryDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsIn(EVENT_STATUSES)
  status?: (typeof EVENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
