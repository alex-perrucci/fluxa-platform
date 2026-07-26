// PHASE_4_RESERVATION_ENGINE
import { Module } from '@nestjs/common';
import {
  PublicEventReservationsController,
  PublicReservationHoldsController,
} from './public-reservations.controller';
import { ReservationEngineService } from './reservation-engine.service';

@Module({
  controllers: [
    PublicEventReservationsController,
    PublicReservationHoldsController,
  ],
  providers: [ReservationEngineService],
  exports: [ReservationEngineService],
})
export class ReservationsModule {}
