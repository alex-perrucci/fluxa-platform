// PHASE_4_RESERVATION_ENGINE
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class AvailabilityQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  partySize!: number;
}
