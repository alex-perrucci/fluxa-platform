// PHASE_10_RESERVATION_OPERATIONS
import { ConflictException } from '@nestjs/common';

export enum ReservationOperationAction {
  CHECK_IN = 'check-in',
  SEAT = 'seat',
  COMPLETE = 'complete',
  NO_SHOW = 'no-show',
}

export type OperationalReservationStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'NO_SHOW'
  | 'REFUND_PENDING'
  | 'REFUNDED';

const TRANSITIONS: Record<
  ReservationOperationAction,
  {
    from: readonly OperationalReservationStatus[];
    to: OperationalReservationStatus;
  }
> = {
  [ReservationOperationAction.CHECK_IN]: {
    from: ['CONFIRMED'],
    to: 'CHECKED_IN',
  },
  [ReservationOperationAction.SEAT]: {
    from: ['CHECKED_IN'],
    to: 'SEATED',
  },
  [ReservationOperationAction.COMPLETE]: {
    from: ['SEATED'],
    to: 'COMPLETED',
  },
  [ReservationOperationAction.NO_SHOW]: {
    from: ['CONFIRMED'],
    to: 'NO_SHOW',
  },
};

export function targetReservationStatus(
  action: ReservationOperationAction,
): OperationalReservationStatus {
  return TRANSITIONS[action].to;
}

export function assertReservationOperationAllowed(
  current: OperationalReservationStatus,
  action: ReservationOperationAction,
): void {
  const transition = TRANSITIONS[action];

  if (!transition.from.includes(current)) {
    throw new ConflictException({
      code: 'RESERVATION_OPERATION_NOT_ALLOWED',
      message: `Operazione ${action} non consentita dallo stato ${current}.`,
    });
  }
}

export function reservationOperationTopic(
  action: ReservationOperationAction,
): string {
  return `reservations.operation.${action}`;
}
