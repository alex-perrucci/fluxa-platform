// PHASE_3_EVENTS_MODULE
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertEventArchivable,
  assertEventCancellable,
  assertEventPublishable,
  assertInventoryFitsEvent,
  assertRulesFitCapacity,
  normalizeBookingRules,
  normalizeEventSlug,
  validateEventSchedule,
} from './event-policy';

describe('event policy', () => {
  const schedule = {
    startsAt: new Date('2030-07-20T20:00:00.000Z'),
    endsAt: new Date('2030-07-21T02:00:00.000Z'),
    bookingOpensAt: new Date('2030-06-01T08:00:00.000Z'),
    bookingClosesAt: new Date('2030-07-20T18:00:00.000Z'),
    bookingAmountCents: 1000,
    capacity: 120,
    timezone: 'Europe/Rome',
    currency: 'EUR',
  };

  it('normalizes an event slug', () => {
    expect(normalizeEventSlug('  Serata d’Estate 2026  ')).toBe(
      'serata-d-estate-2026',
    );
  });

  it('accepts a valid event schedule', () => {
    expect(() => validateEventSchedule(schedule)).not.toThrow();
  });

  it('rejects booking closure after event start', () => {
    expect(() =>
      validateEventSchedule({
        ...schedule,
        bookingClosesAt: new Date('2030-07-20T21:00:00.000Z'),
      }),
    ).toThrow(BadRequestException);
  });

  it('applies booking-rule defaults', () => {
    expect(
      normalizeBookingRules({
        maxPartySize: 8,
      }),
    ).toEqual({
      minPartySize: 1,
      maxPartySize: 8,
      holdMinutes: 15,
      bookingCutoffMinutes: 0,
      cancellationCutoffMinutes: 0,
      autoAssignSmallestTable: true,
      allowManualAssignment: true,
      requirePhone: true,
    });
  });

  it('rejects a party size larger than the biggest table', () => {
    expect(() =>
      assertRulesFitCapacity(
        normalizeBookingRules({ maxPartySize: 10 }),
        100,
        8,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects insufficient table inventory', () => {
    expect(() =>
      assertInventoryFitsEvent(
        100,
        {
          tableCount: 10,
          activeTableCount: 10,
          inventoryCapacity: 80,
          maxTableCapacity: 8,
        },
        false,
      ),
    ).toThrow(ConflictException);
  });

  it('accepts a publishable event', () => {
    expect(() =>
      assertEventPublishable(
        {
          status: 'DRAFT',
          startsAt: schedule.startsAt,
          bookingClosesAt: schedule.bookingClosesAt,
          capacity: 100,
        },
        {
          tableCount: 15,
          activeTableCount: 15,
          inventoryCapacity: 120,
          maxTableCapacity: 8,
        },
        normalizeBookingRules({ maxPartySize: 8 }),
        new Date('2030-05-01T00:00:00.000Z'),
      ),
    ).not.toThrow();
  });

  it('allows cancellation only for a public event', () => {
    expect(() => assertEventCancellable('PUBLISHED')).not.toThrow();
    expect(() => assertEventCancellable('DRAFT')).toThrow(ConflictException);
  });

  it('prevents direct archival of a public event', () => {
    expect(() => assertEventArchivable('CANCELLED')).not.toThrow();
    expect(() => assertEventArchivable('PUBLISHED')).toThrow(ConflictException);
  });
});
