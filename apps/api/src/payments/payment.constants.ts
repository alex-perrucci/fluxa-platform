export const CHECKOUT_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'] as const;

export const PAYMENT_METHODS = ['CASH', 'CARD', 'OTHER'] as const;

export const PAYMENT_PROVIDERS = [
  'CASH',
  'MANUAL_TERMINAL',
  'EXTERNAL_TERMINAL',
] as const;

export const PAYMENT_STATUSES = [
  'PENDING',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
] as const;

export const PAYMENT_EVENT_TYPES = [
  'CREATED',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
] as const;
