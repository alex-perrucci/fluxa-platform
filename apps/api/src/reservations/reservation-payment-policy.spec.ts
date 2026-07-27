// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import { ConflictException } from '@nestjs/common';
import {
  assertReservationCheckoutAllowed,
  buildBookingReturnUrls,
  buildReservationCheckoutRequestHash,
  isLateReservationPayment,
  normalizeProviderFeeCents,
} from './reservation-payment-policy';

describe('reservation payment policy', () => {
  it('builds a stable checkout request hash', () => {
    const input = {
      reservationId: '286e849e-97f9-416a-b35c-068236f1f458',
      amountCents: 1_000,
      currency: 'eur',
    };

    expect(buildReservationCheckoutRequestHash(input)).toBe(
      buildReservationCheckoutRequestHash(input),
    );
  });

  it('allows a non-expired pending payment', () => {
    expect(() =>
      assertReservationCheckoutAllowed({
        status: 'PENDING_PAYMENT',
        amountCents: 1_000,
        paymentExpiresAt: new Date('2030-07-20T18:15:00.000Z'),
        now: new Date('2030-07-20T18:00:00.000Z'),
      }),
    ).not.toThrow();
  });

  it('rejects a confirmed reservation', () => {
    expect(() =>
      assertReservationCheckoutAllowed({
        status: 'CONFIRMED',
        amountCents: 1_000,
        paymentExpiresAt: null,
      }),
    ).toThrow(ConflictException);
  });

  it('builds server-controlled return URLs', () => {
    expect(
      buildBookingReturnUrls(
        'https://booking.example.com',
        '550e8400-e29b-41d4-a716-446655440000',
      ),
    ).toEqual({
      successUrl:
        'https://booking.example.com/booking/success?reservationToken=550e8400-e29b-41d4-a716-446655440000&session_id={CHECKOUT_SESSION_ID}',
      cancelUrl:
        'https://booking.example.com/booking/cancel?reservationToken=550e8400-e29b-41d4-a716-446655440000',
    });
  });

  it('classifies an expired payment as late', () => {
    expect(
      isLateReservationPayment({
        reservationStatus: 'PENDING_PAYMENT',
        paymentExpiresAt: new Date('2030-07-20T18:00:00.000Z'),
        now: new Date('2030-07-20T18:00:01.000Z'),
      }),
    ).toBe(true);
  });

  it('normalizes an unavailable provider fee to zero', () => {
    expect(normalizeProviderFeeCents(undefined)).toBe(0);
    expect(normalizeProviderFeeCents(-1)).toBe(0);
    expect(normalizeProviderFeeCents(48)).toBe(48);
  });
});
