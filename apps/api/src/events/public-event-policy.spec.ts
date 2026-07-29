// PHASE_9_PUBLIC_BOOKING
import { derivePublicBookingState } from './public-event-policy';

const base = {
  status: 'PUBLISHED',
  startsAt: new Date('2026-08-01T20:00:00.000Z'),
  endsAt: new Date('2026-08-02T02:00:00.000Z'),
  bookingOpensAt: new Date('2026-07-01T08:00:00.000Z'),
  bookingClosesAt: new Date('2026-08-01T19:00:00.000Z'),
  remainingCapacity: 20,
};

describe('derivePublicBookingState', () => {
  it('returns OPEN inside the booking window', () => {
    expect(
      derivePublicBookingState({
        ...base,
        now: new Date('2026-07-20T12:00:00.000Z'),
      }),
    ).toBe('OPEN');
  });

  it('returns NOT_OPEN before sales begin', () => {
    expect(
      derivePublicBookingState({
        ...base,
        now: new Date('2026-06-20T12:00:00.000Z'),
      }),
    ).toBe('NOT_OPEN');
  });

  it('returns SOLD_OUT when no capacity remains', () => {
    expect(
      derivePublicBookingState({
        ...base,
        remainingCapacity: 0,
        now: new Date('2026-07-20T12:00:00.000Z'),
      }),
    ).toBe('SOLD_OUT');
  });

  it('returns CLOSED after the booking cutoff', () => {
    expect(
      derivePublicBookingState({
        ...base,
        now: new Date('2026-08-01T19:30:00.000Z'),
      }),
    ).toBe('CLOSED');
  });

  it('returns ENDED after the event', () => {
    expect(
      derivePublicBookingState({
        ...base,
        now: new Date('2026-08-02T03:00:00.000Z'),
      }),
    ).toBe('ENDED');
  });
});
