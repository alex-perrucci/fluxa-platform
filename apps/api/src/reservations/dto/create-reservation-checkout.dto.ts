// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import { IsString, Length } from 'class-validator';

export class CreateReservationCheckoutDto {
  @IsString()
  @Length(8, 200)
  idempotencyKey!: string;
}
