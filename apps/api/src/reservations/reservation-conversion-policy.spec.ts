// PHASE_5_RESERVATION_CONVERSION
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertHoldConvertible,
  assertReservationRetryMatches,
  buildReservationConfirmationCode,
  initialReservationState,
  normalizeReservationCustomer,
} from './reservation-conversion-policy';

describe('reservation conversion policy', () => {
  it('normalizes customer data', () => {
    expect(
      normalizeReservationCustomer({
        customerName: '  Mario   Rossi ',
        customerEmail: ' MARIO@example.com ',
        customerPhone: ' +39 333 1234567 ',
        customerNote: '  Tavolo tranquillo  ',
        requirePhone: true,
      }),
    ).toEqual({
      name: 'Mario Rossi',
      email: 'mario@example.com',
      phone: '+39 333 1234567',
      note: 'Tavolo tranquillo',
    });
  });

  it('requires the phone when configured', () => {
    expect(() =>
      normalizeReservationCustomer({
        customerName: 'Mario Rossi',
        customerEmail: 'mario@example.com',
        requirePhone: true,
      }),
    ).toThrow(BadRequestException);
  });

  it('creates a compact confirmation code', () => {
    const code = buildReservationConfirmationCode();

    expect(code).toMatch(/^FX-[A-F0-9]{20}$/);
    expect(code.length).toBeLessThanOrEqual(24);
  });

  it('creates pending payment state for a paid booking', () => {
    const expiresAt = new Date('2030-07-20T18:15:00.000Z');

    expect(
      initialReservationState(
        1_000,
        expiresAt,
        new Date('2030-07-20T18:00:00.000Z'),
      ),
    ).toEqual({
      status: 'PENDING_PAYMENT',
      paymentExpiresAt: expiresAt,
      confirmedAt: null,
    });
  });

  it('confirms a free booking immediately', () => {
    const now = new Date('2030-07-20T18:00:00.000Z');

    expect(
      initialReservationState(0, new Date('2030-07-20T18:15:00.000Z'), now),
    ).toEqual({
      status: 'CONFIRMED',
      paymentExpiresAt: null,
      confirmedAt: now,
    });
  });

  it('rejects an expired active hold', () => {
    expect(() =>
      assertHoldConvertible({
        status: 'ACTIVE',
        expiresAt: new Date('2030-07-20T18:00:00.000Z'),
        now: new Date('2030-07-20T18:00:01.000Z'),
      }),
    ).toThrow(ConflictException);
  });

  it('accepts an identical conversion retry', () => {
    expect(() =>
      assertReservationRetryMatches(
        {
          publicTokenHash: 'a'.repeat(64),
          customerName: 'Mario Rossi',
          customerEmail: 'mario@example.com',
          customerPhone: '+39 333 1234567',
          customerNote: null,
        },
        {
          publicTokenHash: 'a'.repeat(64),
          customer: {
            name: 'Mario Rossi',
            email: 'mario@example.com',
            phone: '+39 333 1234567',
            note: null,
          },
        },
      ),
    ).not.toThrow();
  });

  it('rejects a retry using another public token', () => {
    expect(() =>
      assertReservationRetryMatches(
        {
          publicTokenHash: 'a'.repeat(64),
          customerName: 'Mario Rossi',
          customerEmail: 'mario@example.com',
          customerPhone: null,
          customerNote: null,
        },
        {
          publicTokenHash: 'b'.repeat(64),
          customer: {
            name: 'Mario Rossi',
            email: 'mario@example.com',
            phone: null,
            note: null,
          },
        },
      ),
    ).toThrow(ConflictException);
  });
});
