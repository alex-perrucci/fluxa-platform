import { BadRequestException } from '@nestjs/common';
import {
  buildPriceKey,
  normalizePagination,
  pickEffectivePrice,
  validateDateRange,
  validateVatDefinition,
} from './catalog-policy';

describe('catalog policy', () => {
  it('normalizes pagination', () => {
    expect(normalizePagination({ page: 2, pageSize: 50 })).toEqual({
      page: 2,
      pageSize: 50,
      offset: 50,
    });
  });

  it('requires a nature code for zero VAT', () => {
    expect(() => validateVatDefinition(0, null)).toThrow(BadRequestException);
    expect(() => validateVatDefinition(0, 'N2.2')).not.toThrow();
  });

  it('rejects nature code for positive VAT', () => {
    expect(() => validateVatDefinition(2200, 'N2.2')).toThrow(
      BadRequestException,
    );
  });

  it('builds stable price keys', () => {
    expect(buildPriceKey('product')).toBe('PRODUCT:product:BASE');
    expect(buildPriceKey('product', 'variant')).toBe(
      'PRODUCT:product:VARIANT:variant',
    );
  });

  it('selects price from the highest ranked list', () => {
    const rank = new Map([
      ['primary', 0],
      ['secondary', 1],
    ]);

    expect(
      pickEffectivePrice(
        [
          { priceListId: 'secondary', amountCents: 150 },
          { priceListId: 'primary', amountCents: 120 },
        ],
        rank,
      ),
    ).toEqual({ priceListId: 'primary', amountCents: 120 });
  });

  it('rejects inverted validity ranges', () => {
    expect(() =>
      validateDateRange(
        new Date('2026-01-02T00:00:00.000Z'),
        new Date('2026-01-01T00:00:00.000Z'),
      ),
    ).toThrow(BadRequestException);
  });
});
