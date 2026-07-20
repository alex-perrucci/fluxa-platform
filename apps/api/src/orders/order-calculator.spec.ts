import {
  calculateGrossFromQuantity,
  calculateOrderTotals,
  calculateVatFromGross,
} from './order-calculator';

describe('order calculator', () => {
  it('calculates integer and decimal quantities without floats', () => {
    expect(calculateGrossFromQuantity(120, 2, 0)).toBe(240);
    expect(calculateGrossFromQuantity(1990, 1250, 3)).toBe(2488);
  });

  it.each([
    [2200, 122, 100, 22],
    [1000, 110, 100, 10],
    [500, 105, 100, 5],
    [400, 104, 100, 4],
    [0, 100, 100, 0],
  ])(
    'extracts VAT %s from an inclusive gross',
    (rate, gross, expectedNet, expectedTax) => {
      expect(calculateVatFromGross(gross, rate)).toEqual({
        netCents: expectedNet,
        taxCents: expectedTax,
      });
    },
  );

  it('allocates fixed discounts and reconciles VAT summaries', () => {
    const result = calculateOrderTotals(
      [
        {
          id: 'a',
          grossCents: 120,
          vatRateBasisPoints: 1000,
          vatNatureCode: null,
        },
        {
          id: 'b',
          grossCents: 220,
          vatRateBasisPoints: 2200,
          vatNatureCode: null,
        },
      ],
      [{ id: 'discount', type: 'FIXED', value: 40 }],
    );

    expect(result.subtotalCents).toBe(340);
    expect(result.discountCents).toBe(40);
    expect(result.totalCents).toBe(300);
    expect(
      result.lines.reduce((sum, line) => sum + line.allocatedDiscountCents, 0),
    ).toBe(40);
    expect(result.netTotalCents + result.taxTotalCents).toBe(300);
  });

  it('calculates percentage discounts in basis points', () => {
    const result = calculateOrderTotals(
      [
        {
          id: 'a',
          grossCents: 999,
          vatRateBasisPoints: 1000,
          vatNatureCode: null,
        },
      ],
      [{ id: 'discount', type: 'PERCENTAGE', value: 1000 }],
    );

    expect(result.discountCents).toBe(100);
    expect(result.totalCents).toBe(899);
  });

  it('rejects discounts greater than the subtotal', () => {
    expect(() =>
      calculateOrderTotals(
        [
          {
            id: 'a',
            grossCents: 100,
            vatRateBasisPoints: 1000,
            vatNatureCode: null,
          },
        ],
        [{ id: 'discount', type: 'FIXED', value: 101 }],
      ),
    ).toThrow('DISCOUNT_EXCEEDS_SUBTOTAL');
  });
});
