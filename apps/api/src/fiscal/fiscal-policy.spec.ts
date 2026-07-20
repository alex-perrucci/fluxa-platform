import {
  acubeVatRateCode,
  allocateFiscalPayments,
  assertOrderFiscalizable,
  centsToDecimal,
  scaledQuantity,
} from './fiscal-policy';

describe('fiscal policy', () => {
  it('maps rates and nature codes for A-Cube', () => {
    expect(acubeVatRateCode(2200)).toBe('22');
    expect(acubeVatRateCode(0, 'N2.2')).toBe('N2');
  });

  it('rejects unsupported rates', () => {
    expect(() => acubeVatRateCode(1700)).toThrow();
  });

  it('requires a paid positive order', () => {
    expect(() =>
      assertOrderFiscalizable({
        status: 'OPEN',
        totalCents: 100,
        itemCount: 1,
      }),
    ).toThrow();
    expect(() =>
      assertOrderFiscalizable({
        status: 'PAID',
        totalCents: 100,
        itemCount: 1,
      }),
    ).not.toThrow();
  });

  it('allocates cash and electronic payments exactly', () => {
    expect(
      allocateFiscalPayments(1000, [
        { method: 'CASH', amountCents: 400 },
        { method: 'CARD', amountCents: 600 },
      ]),
    ).toEqual({ cashCents: 400, electronicCents: 600 });
  });

  it('formats provider decimals deterministically', () => {
    expect(centsToDecimal(1234)).toBe('12.34');
    expect(scaledQuantity(1250, 3)).toBe('1.250');
    expect(scaledQuantity(2, 0)).toBe('2.00');
  });
});
