// PHASE_4_RESERVATION_ENGINE
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertEventAcceptsHolds,
  assertEventCapacityAvailable,
  assertPartySizeAllowed,
  buildReservationHoldRequestHash,
  calculatePlatformFee,
  hashPublicToken,
  remainingEventCapacity,
} from './reservation-policy';

describe('reservation policy', () => {
  it('hashes public hold tokens without storing the raw token', () => {
    expect(
      hashPublicToken('550e8400-e29b-41d4-a716-446655440000'),
    ).toHaveLength(64);
  });

  it('builds a stable request hash', () => {
    const input = {
      eventId: '2ad31d8e-3df7-4cc6-9ce1-51698f6a3bb9',
      partySize: 4,
      publicTokenHash: 'a'.repeat(64),
    };

    expect(buildReservationHoldRequestHash(input)).toBe(
      buildReservationHoldRequestHash(input),
    );
    expect(
      buildReservationHoldRequestHash({
        ...input,
        partySize: 5,
      }),
    ).not.toBe(buildReservationHoldRequestHash(input));
  });

  it('calculates the platform fee in integer cents', () => {
    expect(calculatePlatformFee(1_000, 750)).toEqual({
      platformFeeCents: 75,
      merchantGrossCents: 925,
    });
  });

  it('accepts a published event inside its booking window', () => {
    expect(() =>
      assertEventAcceptsHolds(
        {
          id: 'event',
          status: 'PUBLISHED',
          bookingOpensAt: new Date('2030-06-01T00:00:00.000Z'),
          bookingClosesAt: new Date('2030-07-01T00:00:00.000Z'),
          startsAt: new Date('2030-07-01T20:00:00.000Z'),
          bookingAmountCents: 1_000,
          capacity: 100,
          currency: 'EUR',
        },
        new Date('2030-06-15T00:00:00.000Z'),
      ),
    ).not.toThrow();
  });

  it('rejects a closed booking window', () => {
    expect(() =>
      assertEventAcceptsHolds(
        {
          id: 'event',
          status: 'PUBLISHED',
          bookingOpensAt: new Date('2030-06-01T00:00:00.000Z'),
          bookingClosesAt: new Date('2030-07-01T00:00:00.000Z'),
          startsAt: new Date('2030-07-01T20:00:00.000Z'),
          bookingAmountCents: 1_000,
          capacity: 100,
          currency: 'EUR',
        },
        new Date('2030-07-01T00:00:00.000Z'),
      ),
    ).toThrow(ConflictException);
  });

  it('enforces the configured party-size range', () => {
    expect(() =>
      assertPartySizeAllowed(8, {
        minPartySize: 1,
        maxPartySize: 8,
        holdMinutes: 15,
      }),
    ).not.toThrow();

    expect(() =>
      assertPartySizeAllowed(9, {
        minPartySize: 1,
        maxPartySize: 8,
        holdMinutes: 15,
      }),
    ).toThrow(BadRequestException);
  });

  it('calculates remaining capacity and blocks overbooking', () => {
    expect(remainingEventCapacity(100, 88)).toBe(12);
    expect(() => assertEventCapacityAvailable(100, 88, 12)).not.toThrow();
    expect(() => assertEventCapacityAvailable(100, 88, 13)).toThrow(
      ConflictException,
    );
  });
});
