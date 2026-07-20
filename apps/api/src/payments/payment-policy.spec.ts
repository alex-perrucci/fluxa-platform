import {
  assertPaymentAmount,
  calculateCashChange,
  summarizeCheckout,
  validateMethodProvider,
} from './payment-policy';

describe('payment policy', () => {
  it('summarizes captured, pending and remaining amounts', () => {
    expect(
      summarizeCheckout(1000, [
        { status: 'CAPTURED', amountCents: 400, changeCents: 50 },
        { status: 'PENDING', amountCents: 300, changeCents: 0 },
        { status: 'FAILED', amountCents: 200, changeCents: 0 },
      ]),
    ).toEqual({
      orderTotalCents: 1000,
      capturedCents: 400,
      pendingCents: 300,
      remainingCents: 600,
      availableCents: 300,
      changeCents: 50,
      completed: false,
    });
  });

  it('marks a checkout completed only when captured equals total', () => {
    expect(
      summarizeCheckout(120, [
        { status: 'CAPTURED', amountCents: 120, changeCents: 80 },
      ]).completed,
    ).toBe(true);
  });

  it('rejects captured totals above the order total', () => {
    expect(() =>
      summarizeCheckout(100, [
        { status: 'CAPTURED', amountCents: 101, changeCents: 0 },
      ]),
    ).toThrow();
  });

  it('rejects captured plus pending totals above the order total', () => {
    expect(() =>
      summarizeCheckout(100, [
        { status: 'CAPTURED', amountCents: 60, changeCents: 0 },
        { status: 'PENDING', amountCents: 41, changeCents: 0 },
      ]),
    ).toThrow();
  });

  it('calculates cash change', () => {
    expect(calculateCashChange(120, 200)).toBe(80);
  });

  it('rejects insufficient cash tendered', () => {
    expect(() => calculateCashChange(120, 119)).toThrow();
  });

  it('accepts an amount equal to the available balance', () => {
    expect(() => assertPaymentAmount(500, 500)).not.toThrow();
  });

  it('rejects an amount above the available balance', () => {
    expect(() => assertPaymentAmount(501, 500)).toThrow();
  });

  it('requires CASH provider for cash payments', () => {
    expect(() =>
      validateMethodProvider('CASH', 'MANUAL_TERMINAL', 100),
    ).toThrow();
  });

  it('rejects tendered amount for card payments', () => {
    expect(() =>
      validateMethodProvider('CARD', 'MANUAL_TERMINAL', 100),
    ).toThrow();
  });
});
