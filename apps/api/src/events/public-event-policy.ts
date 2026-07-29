// PHASE_9_PUBLIC_BOOKING
export type PublicBookingState =
  'NOT_OPEN' | 'OPEN' | 'CLOSED' | 'SOLD_OUT' | 'ENDED';

export function derivePublicBookingState(input: {
  status: string;
  startsAt: Date;
  endsAt: Date;
  bookingOpensAt: Date;
  bookingClosesAt: Date;
  remainingCapacity: number;
  now?: Date;
}): PublicBookingState {
  const now = input.now ?? new Date();

  if (input.endsAt.getTime() <= now.getTime()) {
    return 'ENDED';
  }

  if (input.status === 'SOLD_OUT' || input.remainingCapacity <= 0) {
    return 'SOLD_OUT';
  }

  if (now.getTime() < input.bookingOpensAt.getTime()) {
    return 'NOT_OPEN';
  }

  if (now.getTime() >= input.bookingClosesAt.getTime()) {
    return 'CLOSED';
  }

  return 'OPEN';
}
