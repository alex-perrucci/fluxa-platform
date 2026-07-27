// PHASE_3_EVENTS_MODULE
import { IsString, Length } from 'class-validator';

export class CancelEventDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}
