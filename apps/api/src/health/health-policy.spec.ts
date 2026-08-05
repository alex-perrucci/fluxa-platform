import {
  overallStatus,
  statusFromJob,
  statusFromLastSeen,
} from './health-policy';

describe('health policy', () => {
  const now = new Date('2026-08-05T10:00:00.000Z');

  it('classifies printer heartbeat freshness', () => {
    expect(statusFromLastSeen(false, null, now)).toBe('NOT_CONFIGURED');
    expect(
      statusFromLastSeen(true, new Date('2026-08-05T09:59:00.000Z'), now),
    ).toBe('OK');
    expect(
      statusFromLastSeen(true, new Date('2026-08-05T09:55:00.000Z'), now),
    ).toBe('DEGRADED');
    expect(
      statusFromLastSeen(true, new Date('2026-08-05T09:40:00.000Z'), now),
    ).toBe('DOWN');
  });

  it('classifies persisted provider jobs', () => {
    expect(statusFromJob('COMPLETED')).toBe('OK');
    expect(statusFromJob('RETRY')).toBe('DEGRADED');
    expect(statusFromJob('FAILED')).toBe('DOWN');
  });

  it('uses the worst actionable status for the aggregate', () => {
    expect(overallStatus(['OK', 'NOT_CONFIGURED'])).toBe('OK');
    expect(overallStatus(['OK', 'UNKNOWN'])).toBe('DEGRADED');
    expect(overallStatus(['OK', 'DOWN'])).toBe('DOWN');
  });
});
