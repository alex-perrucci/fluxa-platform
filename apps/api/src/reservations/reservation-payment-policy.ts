// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';

export function buildReservationCheckoutRequestHash(input: {
  reservationId: string;
  amountCents: number;
  currency: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        reservationId: input.reservationId,
        amountCents: input.amountCents,
        currency: input.currency.toUpperCase(),
      }),
    )
    .digest('hex');
}

export function assertReservationCheckoutAllowed(input: {
  status: string;
  amountCents: number;
  paymentExpiresAt: Date | null;
  now?: Date;
}): void {
  const now = input.now ?? new Date();

  if (input.amountCents <= 0) {
    throw new ConflictException({
      code: 'RESERVATION_PAYMENT_NOT_REQUIRED',
      message: 'Questa prenotazione non richiede un pagamento.',
    });
  }

  if (input.status !== 'PENDING_PAYMENT') {
    throw new ConflictException({
      code: 'RESERVATION_NOT_PENDING_PAYMENT',
      message: 'La prenotazione non è in attesa di pagamento.',
    });
  }

  if (
    !input.paymentExpiresAt ||
    input.paymentExpiresAt.getTime() <= now.getTime()
  ) {
    throw new ConflictException({
      code: 'RESERVATION_PAYMENT_EXPIRED',
      message: 'Il tempo disponibile per il pagamento è terminato.',
    });
  }
}

export function buildBookingReturnUrls(
  baseUrlInput: string,
  reservationToken: string,
): {
  successUrl: string;
  cancelUrl: string;
} {
  let baseUrl: URL;

  try {
    baseUrl = new URL(baseUrlInput);
  } catch {
    throw new BadRequestException({
      code: 'BOOKING_WEB_BASE_URL_INVALID',
      message: 'La configurazione del sito prenotazioni non è valida.',
    });
  }

  const success = new URL('/booking/success', baseUrl);
  success.searchParams.set('reservationToken', reservationToken);
  success.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');

  const cancel = new URL('/booking/cancel', baseUrl);
  cancel.searchParams.set('reservationToken', reservationToken);

  return {
    successUrl: success
      .toString()
      .replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}'),
    cancelUrl: cancel.toString(),
  };
}

export function isLateReservationPayment(input: {
  reservationStatus: string;
  paymentExpiresAt: Date | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();

  return (
    input.reservationStatus !== 'PENDING_PAYMENT' ||
    !input.paymentExpiresAt ||
    input.paymentExpiresAt.getTime() <= now.getTime()
  );
}

export function normalizeProviderFeeCents(
  providerFeeCents: number | null | undefined,
): number {
  if (
    providerFeeCents === null ||
    providerFeeCents === undefined ||
    !Number.isInteger(providerFeeCents) ||
    providerFeeCents < 0
  ) {
    return 0;
  }

  return providerFeeCents;
}
