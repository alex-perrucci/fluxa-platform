import {
  eventBookingRules,
  eventMedia,
  eventStatus,
  eventTableInventory,
  events,
  platformFeeLedger,
  platformFeeLedgerEntryType,
  platformFeeRuleScope,
  platformFeeRules,
  reservationAssignmentStatus,
  reservationHoldStatus,
  reservationHolds,
  reservationPaymentStatus,
  reservationPayments,
  reservations,
  reservationStatus,
  reservationStatusHistory,
  reservationTableAssignments,
} from './schema';

describe('Phase 2 events and reservations schema', () => {
  it('exports every Phase 2 table', () => {
    expect([
      events,
      eventMedia,
      eventTableInventory,
      eventBookingRules,
      platformFeeRules,
      reservationHolds,
      reservations,
      reservationTableAssignments,
      reservationPayments,
      platformFeeLedger,
      reservationStatusHistory,
    ]).not.toContain(undefined);
  });

  it('keeps the event lifecycle explicit', () => {
    expect(eventStatus.enumValues).toEqual([
      'DRAFT',
      'PUBLISHED',
      'SOLD_OUT',
      'CANCELLED',
      'COMPLETED',
      'ARCHIVED',
    ]);
  });

  it('keeps reservation, hold and payment states separate', () => {
    expect(reservationStatus.enumValues).toEqual([
      'PENDING_PAYMENT',
      'CONFIRMED',
      'CHECKED_IN',
      'SEATED',
      'COMPLETED',
      'CANCELLED',
      'EXPIRED',
      'NO_SHOW',
      'REFUND_PENDING',
      'REFUNDED',
    ]);

    expect(reservationHoldStatus.enumValues).toEqual([
      'ACTIVE',
      'CONVERTED',
      'EXPIRED',
      'CANCELLED',
    ]);

    expect(reservationAssignmentStatus.enumValues).toEqual([
      'ACTIVE',
      'RELEASED',
    ]);

    expect(reservationPaymentStatus.enumValues).toEqual([
      'CREATED',
      'REQUIRES_ACTION',
      'PAID',
      'FAILED',
      'CANCELLED',
      'PARTIALLY_REFUNDED',
      'REFUNDED',
    ]);
  });

  it('supports fee precedence and an immutable ledger', () => {
    expect(platformFeeRuleScope.enumValues).toEqual([
      'GLOBAL',
      'ORGANIZATION',
      'EVENT',
    ]);

    expect(platformFeeLedgerEntryType.enumValues).toEqual([
      'CHARGE',
      'REFUND',
      'ADJUSTMENT',
    ]);
  });
});
