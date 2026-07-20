import { BadRequestException, ConflictException } from '@nestjs/common';
import type {
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from '@fluxa/database';

export interface PaymentBalanceInput {
  status: PaymentStatus;
  amountCents: number;
  changeCents: number;
}

export interface CheckoutBalance {
  orderTotalCents: number;
  capturedCents: number;
  pendingCents: number;
  remainingCents: number;
  availableCents: number;
  changeCents: number;
  completed: boolean;
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}

export function summarizeCheckout(
  orderTotalCents: number,
  payments: PaymentBalanceInput[],
): CheckoutBalance {
  assertNonNegativeSafeInteger(orderTotalCents, 'orderTotalCents');

  let capturedCents = 0;
  let pendingCents = 0;
  let changeCents = 0;

  for (const payment of payments) {
    assertNonNegativeSafeInteger(payment.amountCents, 'payment.amountCents');
    assertNonNegativeSafeInteger(payment.changeCents, 'payment.changeCents');

    if (payment.status === 'CAPTURED') {
      capturedCents += payment.amountCents;
      changeCents += payment.changeCents;
    } else if (payment.status === 'PENDING') {
      pendingCents += payment.amountCents;
    }
  }

  if (!Number.isSafeInteger(capturedCents + pendingCents + changeCents)) {
    throw new RangeError('Payment totals exceed the safe integer range.');
  }

  if (capturedCents > orderTotalCents) {
    throw new RangeError('Captured payments exceed the order total.');
  }

  if (capturedCents + pendingCents > orderTotalCents) {
    throw new RangeError(
      'Captured and pending payments exceed the order total.',
    );
  }

  return {
    orderTotalCents,
    capturedCents,
    pendingCents,
    remainingCents: orderTotalCents - capturedCents,
    availableCents: orderTotalCents - capturedCents - pendingCents,
    changeCents,
    completed: capturedCents === orderTotalCents,
  };
}

export function assertPaymentAmount(
  amountCents: number,
  availableCents: number,
): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new BadRequestException({
      code: 'INVALID_PAYMENT_AMOUNT',
      message: 'L’importo del pagamento deve essere un intero positivo.',
    });
  }

  if (amountCents > availableCents) {
    throw new ConflictException({
      code: 'PAYMENT_AMOUNT_EXCEEDS_AVAILABLE',
      message: 'L’importo supera il residuo disponibile del checkout.',
      availableCents,
    });
  }
}

export function calculateCashChange(
  amountCents: number,
  tenderedCents: number | null | undefined,
): number {
  if (
    tenderedCents === undefined ||
    tenderedCents === null ||
    !Number.isSafeInteger(tenderedCents)
  ) {
    throw new BadRequestException({
      code: 'CASH_TENDERED_REQUIRED',
      message:
        'Per un pagamento in contanti è obbligatorio l’importo ricevuto.',
    });
  }

  if (tenderedCents < amountCents) {
    throw new BadRequestException({
      code: 'CASH_TENDERED_INSUFFICIENT',
      message: 'L’importo ricevuto è inferiore all’importo da incassare.',
    });
  }

  return tenderedCents - amountCents;
}

export function validateMethodProvider(
  method: PaymentMethod,
  provider: PaymentProvider,
  tenderedCents?: number,
): void {
  if (method === 'CASH') {
    if (provider !== 'CASH') {
      throw new BadRequestException({
        code: 'INVALID_CASH_PROVIDER',
        message: 'I contanti devono usare il provider CASH.',
      });
    }

    if (tenderedCents === undefined) {
      throw new BadRequestException({
        code: 'CASH_TENDERED_REQUIRED',
        message: 'Per i contanti è obbligatorio l’importo ricevuto.',
      });
    }

    return;
  }

  if (provider === 'CASH') {
    throw new BadRequestException({
      code: 'INVALID_NON_CASH_PROVIDER',
      message:
        'I pagamenti non in contanti non possono usare il provider CASH.',
    });
  }

  if (tenderedCents !== undefined) {
    throw new BadRequestException({
      code: 'TENDERED_NOT_ALLOWED',
      message: 'L’importo ricevuto è ammesso soltanto per i contanti.',
    });
  }
}
