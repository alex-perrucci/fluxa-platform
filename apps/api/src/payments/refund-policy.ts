import { BadRequestException, ConflictException } from '@nestjs/common';

export interface RefundablePaymentInput {
  status: string;
  amountCents: number;
  refundedCents: number;
  pendingRefundCents: number;
  method: string;
}

export interface RefundQuote {
  capturedCents: number;
  refundedCents: number;
  pendingRefundCents: number;
  refundableCents: number;
  fullyRefunded: boolean;
}

export function calculateRefundQuote(
  payment: RefundablePaymentInput,
): RefundQuote {
  for (const [label, value] of Object.entries({
    amountCents: payment.amountCents,
    refundedCents: payment.refundedCents,
    pendingRefundCents: payment.pendingRefundCents,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${label} must be a non-negative safe integer.`);
    }
  }

  if (!['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status)) {
    throw new ConflictException({
      code: 'PAYMENT_NOT_REFUNDABLE',
      message: 'È rimborsabile soltanto un pagamento acquisito.',
      status: payment.status,
    });
  }

  if (!['CASH', 'CARD'].includes(payment.method)) {
    throw new ConflictException({
      code: 'PAYMENT_METHOD_NOT_REFUNDABLE',
      message: 'Sono supportati soltanto rimborsi contanti e carta.',
      method: payment.method,
    });
  }

  const committed = payment.refundedCents + payment.pendingRefundCents;
  if (committed > payment.amountCents) {
    throw new RangeError('Refund totals exceed the captured payment amount.');
  }

  const refundableCents = payment.amountCents - committed;
  return {
    capturedCents: payment.amountCents,
    refundedCents: payment.refundedCents,
    pendingRefundCents: payment.pendingRefundCents,
    refundableCents,
    fullyRefunded: refundableCents === 0 && payment.pendingRefundCents === 0,
  };
}

export function assertRefundAmount(
  amountCents: number,
  refundableCents: number,
): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new BadRequestException({
      code: 'INVALID_REFUND_AMOUNT',
      message: 'L’importo del rimborso deve essere un intero positivo.',
    });
  }

  if (amountCents > refundableCents) {
    throw new ConflictException({
      code: 'REFUND_AMOUNT_EXCEEDS_AVAILABLE',
      message: 'L’importo supera la quota ancora rimborsabile.',
      refundableCents,
    });
  }
}
