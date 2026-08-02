// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import { Module } from '@nestjs/common';
import { EventInventoryReservationEngineService } from './event-inventory-reservation-engine.service';
import {
  PublicEventReservationsController,
  PublicReservationHoldsController,
  PublicReservationsController,
} from './public-reservations.controller';
import { ReservationConversionService } from './reservation-conversion.service';
import { ReservationEngineService } from './reservation-engine.service';
import {
  PublicReservationCheckoutController,
  ReservationPaymentWebhookController,
} from './reservation-stripe.controller';
import { ReservationStripeService } from './reservation-stripe.service';

@Module({
  controllers: [
    PublicEventReservationsController,
    PublicReservationHoldsController,
    PublicReservationsController,
    PublicReservationCheckoutController,
    ReservationPaymentWebhookController,
  ],
  providers: [
    ReservationEngineService,
    EventInventoryReservationEngineService,
    ReservationConversionService,
    ReservationStripeService,
  ],
  exports: [
    ReservationEngineService,
    EventInventoryReservationEngineService,
    ReservationConversionService,
    ReservationStripeService,
  ],
})
export class ReservationsModule {}
