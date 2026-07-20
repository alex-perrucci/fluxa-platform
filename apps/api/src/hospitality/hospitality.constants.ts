export const HOSPITALITY_MANAGER_ROLES = ['OWNER', 'ADMIN', 'MANAGER'] as const;
export const HOSPITALITY_OPERATOR_ROLES = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'CASHIER',
  'WAITER',
] as const;

export const TABLE_SESSION_STATUSES = ['OPEN', 'CLOSED', 'CANCELLED'] as const;
export const KITCHEN_TICKET_STATUSES = [
  'QUEUED',
  'IN_PROGRESS',
  'READY',
  'SERVED',
  'CANCELLED',
] as const;
