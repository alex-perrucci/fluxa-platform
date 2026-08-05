export type OperationalHealthStatus =
  'OK' | 'DEGRADED' | 'DOWN' | 'NOT_CONFIGURED' | 'UNKNOWN';

export function statusFromLastSeen(
  enabled: boolean,
  lastSeenAt: Date | null,
  now = new Date(),
): OperationalHealthStatus {
  if (!enabled) return 'NOT_CONFIGURED';
  if (!lastSeenAt) return 'UNKNOWN';
  const ageMs = now.getTime() - lastSeenAt.getTime();
  if (ageMs <= 2 * 60_000) return 'OK';
  if (ageMs <= 10 * 60_000) return 'DEGRADED';
  return 'DOWN';
}

export function statusFromJob(status: string | null): OperationalHealthStatus {
  if (!status) return 'UNKNOWN';
  if (['COMPLETED', 'ISSUED', 'VOIDED', 'CAPTURED'].includes(status)) {
    return 'OK';
  }
  if (
    ['QUEUED', 'CLAIMED', 'PROCESSING', 'RETRY', 'PENDING'].includes(status)
  ) {
    return 'DEGRADED';
  }
  if (['FAILED', 'REJECTED'].includes(status)) return 'DOWN';
  if (['CANCELLED', 'DISABLED'].includes(status)) return 'NOT_CONFIGURED';
  return 'UNKNOWN';
}

export function overallStatus(
  statuses: OperationalHealthStatus[],
): OperationalHealthStatus {
  if (statuses.includes('DOWN')) return 'DOWN';
  if (statuses.includes('DEGRADED') || statuses.includes('UNKNOWN')) {
    return 'DEGRADED';
  }
  if (statuses.every((status) => status === 'NOT_CONFIGURED')) {
    return 'NOT_CONFIGURED';
  }
  return 'OK';
}
