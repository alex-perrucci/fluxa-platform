// PHASE_10_RESERVATION_OPERATIONS
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ReservationFeedQueryDto {
  @IsUUID('4')
  locationId!: string;

  @IsOptional()
  @IsDateString()
  after?: string;

  @IsOptional()
  @IsUUID('4')
  afterId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
