import {
  assertAdminPrintTransition,
  assertPrinterSupportsDocument,
  buildPrintRouteKey,
  retryDelaySeconds,
} from './print-policy';

describe('print policy', () => {
  it('builds stable route keys', () => {
    expect(buildPrintRouteKey('ORDER_RECEIPT')).toBe('ORDER_RECEIPT:DEFAULT');
    expect(buildPrintRouteKey('KITCHEN_TICKET', 'station-1')).toBe(
      'KITCHEN_TICKET:station-1',
    );
  });

  it('requires a station for kitchen routes', () => {
    expect(() => buildPrintRouteKey('KITCHEN_TICKET')).toThrow();
  });

  it('enforces printer purpose', () => {
    expect(() =>
      assertPrinterSupportsDocument('KITCHEN', 'ORDER_RECEIPT'),
    ).toThrow();
    expect(() =>
      assertPrinterSupportsDocument('GENERIC', 'ORDER_RECEIPT'),
    ).not.toThrow();
  });

  it('uses bounded exponential retry delays', () => {
    expect(retryDelaySeconds(1)).toBe(5);
    expect(retryDelaySeconds(2)).toBe(10);
    expect(retryDelaySeconds(20)).toBe(300);
  });

  it('allows only safe administrative transitions', () => {
    expect(() => assertAdminPrintTransition('FAILED', 'RETRY')).not.toThrow();
    expect(() => assertAdminPrintTransition('COMPLETED', 'RETRY')).toThrow();
    expect(() => assertAdminPrintTransition('QUEUED', 'CANCEL')).not.toThrow();
  });
});
