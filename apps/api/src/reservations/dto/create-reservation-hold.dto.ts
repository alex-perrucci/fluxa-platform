// PHASE_4_RESERVATION_ENGINE
import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Min } from 'class-validator';

export class CreateReservationHoldDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  partySize!: number;

  @IsUUID('4')
  holdToken!: string;

  @IsString()
  @Length(8, 200)
  idempotencyKey!: string;
}
