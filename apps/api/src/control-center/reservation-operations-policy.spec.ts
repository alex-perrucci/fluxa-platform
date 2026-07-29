// PHASE_10_RESERVATION_OPERATIONS
import { ConflictException } from '@nestjs/common';
import {
  assertReservationOperationAllowed,
  ReservationOperationAction,
  targetReservationStatus,
} from './reservation-operations-policy';

describe('reservation operations policy', () => {
  it('allows check-in only from confirmed', () => {
    expect(() =>
      assertReservationOperationAllowed(
        'CONFIRMED',
        ReservationOperationAction.CHECK_IN,
      ),
    ).not.toThrow();

    expect(() =>
      assertReservationOperationAllowed(
        'PENDING_PAYMENT',
        ReservationOperationAction.CHECK_IN,
      ),
    ).toThrow(ConflictException);
  });

  it('maps the operational flow', () => {
    expect(targetReservationStatus(ReservationOperationAction.CHECK_IN)).toBe(
      'CHECKED_IN',
    );
    expect(targetReservationStatus(ReservationOperationAction.SEAT)).toBe(
      'SEATED',
    );
    expect(targetReservationStatus(ReservationOperationAction.COMPLETE)).toBe(
      'COMPLETED',
    );
    expect(targetReservationStatus(ReservationOperationAction.NO_SHOW)).toBe(
      'NO_SHOW',
    );
  });

  it('prevents completion before seating', () => {
    expect(() =>
      assertReservationOperationAllowed(
        'CHECKED_IN',
        ReservationOperationAction.COMPLETE,
      ),
    ).toThrow(ConflictException);
  });
});
