// PHASE_8_TRUE_CONTROL_CENTER
const tones: Record<string, string> = {
  ACTIVE: 'badge-success',
  PUBLISHED: 'badge-success',
  CONFIRMED: 'badge-success',
  COMPLETED: 'badge-neutral',
  DRAFT: 'badge-warning',
  PENDING_PAYMENT: 'badge-warning',
  CHECKED_IN: 'badge-info',
  SEATED: 'badge-info',
  SOLD_OUT: 'badge-violet',
  REFUND_PENDING: 'badge-danger',
  CANCELLED: 'badge-danger',
  EXPIRED: 'badge-neutral',
  NO_SHOW: 'badge-neutral',
  REFUNDED: 'badge-violet',
  SUSPENDED: 'badge-danger',
  ARCHIVED: 'badge-neutral',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge ${tones[status] ?? 'badge-neutral'}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
