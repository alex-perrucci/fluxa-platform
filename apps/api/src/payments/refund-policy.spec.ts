import { ConflictException } from '@nestjs/common';
import { assertRefundAmount, calculateRefundQuote } from './refund-policy';

describe('refund policy', () => {
  it('calculates the remaining refundable quota after successful refunds', () => {
    expect(
      calculateRefundQuote({
        status: 'PARTIALLY_REFUNDED',
        amountCents: 10_000,
        refundedCents: 3_000,
        pendingRefundCents: 0,
        method: 'CARD',
      }),
    ).toEqual({
      capturedCents: 10_000,
      refundedCents: 3_000,
      pendingRefundCents: 0,
      refundableCents: 7_000,
      fullyRefunded: false,
    });
  });

  it('reserves pending refund amounts against concurrent requests', () => {
    const quote = calculateRefundQuote({
      status: 'CAPTURED',
      amountCents: 10_000,
      refundedCents: 0,
      pendingRefundCents: 6_000,
      method: 'CARD',
    });

    expect(quote.refundableCents).toBe(4_000);
    expect(() => assertRefundAmount(5_000, quote.refundableCents)).toThrow(
      ConflictException,
    );
  });

  it('marks a payment as fully refunded only after pending work is resolved', () => {
    expect(
      calculateRefundQuote({
        status: 'REFUNDED',
        amountCents: 10_000,
        refundedCents: 10_000,
        pendingRefundCents: 0,
        method: 'CASH',
      }).fullyRefunded,
    ).toBe(true);
  });

  it('rejects unsupported payment states and methods', () => {
    expect(() =>
      calculateRefundQuote({
        status: 'PENDING',
        amountCents: 10_000,
        refundedCents: 0,
        pendingRefundCents: 0,
        method: 'CARD',
      }),
    ).toThrow(ConflictException);

    expect(() =>
      calculateRefundQuote({
        status: 'CAPTURED',
        amountCents: 10_000,
        refundedCents: 0,
        pendingRefundCents: 0,
        method: 'OTHER',
      }),
    ).toThrow(ConflictException);
  });
});
