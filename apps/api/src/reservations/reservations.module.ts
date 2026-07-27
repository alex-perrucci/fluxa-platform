// PHASE_5_RESERVATION_CONVERSION
import { Module } from '@nestjs/common';
import {
  PublicEventReservationsController,
  PublicReservationHoldsController,
  PublicReservationsController,
} from './public-reservations.controller';
import { ReservationConversionService } from './reservation-conversion.service';
import { ReservationEngineService } from './reservation-engine.service';

@Module({
  controllers: [
    PublicEventReservationsController,
    PublicReservationHoldsController,
    PublicReservationsController,
  ],
  providers: [ReservationEngineService, ReservationConversionService],
  exports: [ReservationEngineService, ReservationConversionService],
})
export class ReservationsModule {}
