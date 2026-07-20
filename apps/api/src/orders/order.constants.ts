export const ORDER_STATUSES = [
  'OPEN',
  'HELD',
  'AWAITING_PAYMENT',
  'PAID',
  'CANCELLED',
] as const;

export const ORDER_SERVICE_MODES = [
  'COUNTER',
  'TAKEAWAY',
  'DELIVERY',
  'TABLE',
] as const;

export const ORDER_ADJUSTMENT_TYPES = ['FIXED', 'PERCENTAGE'] as const;
