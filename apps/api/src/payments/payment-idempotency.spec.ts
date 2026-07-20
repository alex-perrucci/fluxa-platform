import { financialRequestHash } from './payment-idempotency';

describe('financialRequestHash', () => {
  it('is stable when object keys are reordered', () => {
    expect(financialRequestHash({ b: 2, a: 1 })).toBe(
      financialRequestHash({ a: 1, b: 2 }),
    );
  });

  it('changes when a financially relevant value changes', () => {
    expect(financialRequestHash({ amountCents: 100 })).not.toBe(
      financialRequestHash({ amountCents: 101 }),
    );
  });
});
