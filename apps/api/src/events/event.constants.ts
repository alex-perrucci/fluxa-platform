// PHASE_3_EVENTS_MODULE
export const EVENT_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'SOLD_OUT',
  'CANCELLED',
  'COMPLETED',
  'ARCHIVED',
] as const;

export const EVENT_WRITE_ROLES = ['OWNER', 'ADMIN', 'MANAGER'] as const;
