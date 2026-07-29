// PHASE_10_RESERVATION_OPERATIONS
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class ReservationOperationDto {
  @IsUUID('4')
  mutationId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
