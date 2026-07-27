// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CreateReservationCheckoutDto } from './dto/create-reservation-checkout.dto';
import { ReservationStripeService } from './reservation-stripe.service';

@Public()
@Controller('public/reservations')
export class PublicReservationCheckoutController {
  constructor(private readonly stripePayments: ReservationStripeService) {}

  @Post(':reservationToken/checkout-sessions')
  createCheckout(
    @Param('reservationToken', new ParseUUIDPipe({ version: '4' }))
    reservationToken: string,
    @Body() dto: CreateReservationCheckoutDto,
  ) {
    return this.stripePayments.createCheckout(reservationToken, dto);
  }
}

@Public()
@Controller('public/reservation-payments')
export class ReservationPaymentWebhookController {
  constructor(private readonly stripePayments: ReservationStripeService) {}

  @Post('stripe/webhook')
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!request.rawBody) {
      throw new BadRequestException({
        code: 'STRIPE_RAW_BODY_MISSING',
        message: 'Corpo raw del webhook Stripe non disponibile.',
      });
    }

    const event = this.stripePayments.constructWebhookEvent(
      request.rawBody,
      signature,
    );

    return this.stripePayments.handleWebhook(event);
  }
}
