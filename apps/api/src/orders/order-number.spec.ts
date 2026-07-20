import { businessDateForTimezone, formatOrderNumber } from './order-number';

describe('order numbering', () => {
  it('uses the location timezone for the business date', () => {
    const date = new Date('2026-07-20T22:30:00.000Z');

    expect(businessDateForTimezone(date, 'Europe/Rome')).toBe('2026-07-21');
  });

  it('formats an internal Fluxa order number', () => {
    expect(formatOrderNumber('2026-07-20', 42)).toBe('ORD-20260720-000042');
  });
});
