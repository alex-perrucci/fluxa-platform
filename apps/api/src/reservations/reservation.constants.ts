// PHASE_4_RESERVATION_ENGINE
export const RESERVATION_BLOCKING_STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'SEATED',
] as const;

export const RESERVATION_HOLD_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
