import {
  assertKitchenTicketTransition,
  assertTableSessionTransition,
  buildActiveTableKey,
  formatKitchenTicketNumber,
  remainingKitchenQuantity,
} from './hospitality-policy';

describe('hospitality policy', () => {
  it('accepts closing an open table session', () => {
    expect(() => assertTableSessionTransition('OPEN', 'CLOSED')).not.toThrow();
  });

  it('accepts cancelling an open table session', () => {
    expect(() =>
      assertTableSessionTransition('OPEN', 'CANCELLED'),
    ).not.toThrow();
  });

  it('rejects reopening a closed session', () => {
    expect(() => assertTableSessionTransition('CLOSED', 'OPEN')).toThrow();
  });

  it('accepts the complete kitchen lifecycle', () => {
    expect(() =>
      assertKitchenTicketTransition('QUEUED', 'IN_PROGRESS'),
    ).not.toThrow();
    expect(() =>
      assertKitchenTicketTransition('IN_PROGRESS', 'READY'),
    ).not.toThrow();
    expect(() =>
      assertKitchenTicketTransition('READY', 'SERVED'),
    ).not.toThrow();
  });

  it('accepts cancelling a queued ticket', () => {
    expect(() =>
      assertKitchenTicketTransition('QUEUED', 'CANCELLED'),
    ).not.toThrow();
  });

  it('rejects serving a queued ticket directly', () => {
    expect(() => assertKitchenTicketTransition('QUEUED', 'SERVED')).toThrow();
  });

  it('calculates unsent quantity without going negative', () => {
    expect(remainingKitchenQuantity(5, 2)).toBe(3);
    expect(remainingKitchenQuantity(2, 5)).toBe(0);
  });

  it('builds deterministic table occupancy keys', () => {
    expect(buildActiveTableKey('org', 'table')).toBe('org:table');
  });

  it('formats kitchen ticket numbers', () => {
    expect(formatKitchenTicketNumber('2026-07-20', 12)).toBe(
      'KIT-20260720-0012',
    );
  });
});
