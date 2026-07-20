import { mutationRequestHash } from './order-idempotency';

describe('order mutation idempotency', () => {
  it('is stable across object key order', () => {
    expect(mutationRequestHash({ a: 1, b: { c: 2, d: 3 } })).toBe(
      mutationRequestHash({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('changes when a material value changes', () => {
    expect(mutationRequestHash({ quantity: 1 })).not.toBe(
      mutationRequestHash({ quantity: 2 }),
    );
  });
});
