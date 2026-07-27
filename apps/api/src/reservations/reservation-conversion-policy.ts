// PHASE_5_RESERVATION_CONVERSION
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';

export interface NormalizedReservationCustomer {
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
}

export interface ReservationRetrySnapshot {
  publicTokenHash: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerNote: string | null;
}

export function normalizeReservationCustomer(input: {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerNote?: string;
  requirePhone: boolean;
}): NormalizedReservationCustomer {
  const customer: NormalizedReservationCustomer = {
    name: input.customerName.trim().replace(/\s+/g, ' '),
    email: input.customerEmail.trim().toLowerCase(),
    phone: input.customerPhone?.trim().replace(/\s+/g, ' ') || null,
    note: input.customerNote?.trim() || null,
  };

  if (customer.name.length < 2) {
    throw new BadRequestException({
      code: 'RESERVATION_CUSTOMER_NAME_INVALID',
      message: 'Il nome del cliente non è valido.',
    });
  }

  if (input.requirePhone && !customer.phone) {
    throw new BadRequestException({
      code: 'RESERVATION_CUSTOMER_PHONE_REQUIRED',
      message: 'Il numero di telefono è obbligatorio per questo evento.',
    });
  }

  return customer;
}

export function buildReservationConfirmationCode(): string {
  return `FX-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
}

export function initialReservationState(
  amountCents: number,
  holdExpiresAt: Date,
  now = new Date(),
): {
  status: 'PENDING_PAYMENT' | 'CONFIRMED';
  paymentExpiresAt: Date | null;
  confirmedAt: Date | null;
} {
  if (amountCents === 0) {
    return {
      status: 'CONFIRMED',
      paymentExpiresAt: null,
      confirmedAt: now,
    };
  }

  if (holdExpiresAt.getTime() <= now.getTime()) {
    throw new ConflictException({
      code: 'RESERVATION_HOLD_EXPIRED',
      message: 'L’hold è scaduto. Crea un nuovo tentativo di prenotazione.',
    });
  }

  return {
    status: 'PENDING_PAYMENT',
    paymentExpiresAt: holdExpiresAt,
    confirmedAt: null,
  };
}

export function assertHoldConvertible(input: {
  status: string;
  expiresAt: Date;
  now?: Date;
}): void {
  const now = input.now ?? new Date();

  if (input.status === 'CONVERTED') {
    return;
  }

  if (input.status === 'EXPIRED') {
    throw new ConflictException({
      code: 'RESERVATION_HOLD_EXPIRED',
      message: 'L’hold è scaduto. Crea un nuovo tentativo di prenotazione.',
    });
  }

  if (input.status === 'CANCELLED') {
    throw new ConflictException({
      code: 'RESERVATION_HOLD_CANCELLED',
      message: 'L’hold è stato annullato.',
    });
  }

  if (input.status !== 'ACTIVE') {
    throw new ConflictException({
      code: 'RESERVATION_HOLD_NOT_CONVERTIBLE',
      message: 'L’hold non può essere convertito.',
    });
  }

  if (input.expiresAt.getTime() <= now.getTime()) {
    throw new ConflictException({
      code: 'RESERVATION_HOLD_EXPIRED',
      message: 'L’hold è scaduto. Crea un nuovo tentativo di prenotazione.',
    });
  }
}

export function assertReservationRetryMatches(
  existing: ReservationRetrySnapshot,
  input: {
    publicTokenHash: string;
    customer: NormalizedReservationCustomer;
  },
): void {
  const matches =
    existing.publicTokenHash === input.publicTokenHash &&
    existing.customerName === input.customer.name &&
    existing.customerEmail === input.customer.email &&
    existing.customerPhone === input.customer.phone &&
    existing.customerNote === input.customer.note;

  if (!matches) {
    throw new ConflictException({
      code: 'RESERVATION_CONVERSION_RETRY_MISMATCH',
      message:
        'L’hold è già stato convertito con dati differenti dalla richiesta corrente.',
    });
  }
}
