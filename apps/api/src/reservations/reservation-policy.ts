// PHASE_4_RESERVATION_ENGINE
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export interface PublicBookableEvent {
  id: string;
  status: string;
  bookingOpensAt: Date;
  bookingClosesAt: Date;
  startsAt: Date;
  bookingAmountCents: number;
  capacity: number;
  currency: string;
}

export interface PublicBookingRules {
  minPartySize: number;
  maxPartySize: number;
  holdMinutes: number;
}

export function hashPublicToken(token: string): string {
  return createHash('sha256').update(token.trim().toLowerCase()).digest('hex');
}

export function buildReservationHoldRequestHash(input: {
  eventId: string;
  partySize: number;
  publicTokenHash: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        eventId: input.eventId,
        partySize: input.partySize,
        publicTokenHash: input.publicTokenHash,
      }),
    )
    .digest('hex');
}

export function calculatePlatformFee(
  amountCents: number,
  basisPoints: number,
): {
  platformFeeCents: number;
  merchantGrossCents: number;
} {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new BadRequestException({
      code: 'RESERVATION_AMOUNT_INVALID',
      message: 'L’importo della prenotazione non è valido.',
    });
  }

  if (
    !Number.isInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10_000
  ) {
    throw new BadRequestException({
      code: 'PLATFORM_FEE_INVALID',
      message: 'La commissione Fluxa non è valida.',
    });
  }

  const platformFeeCents = Math.floor(
    (amountCents * basisPoints + 5_000) / 10_000,
  );

  return {
    platformFeeCents,
    merchantGrossCents: amountCents - platformFeeCents,
  };
}

export function assertEventAcceptsHolds(
  event: PublicBookableEvent | null,
  now = new Date(),
): asserts event is PublicBookableEvent {
  if (!event) {
    throw new NotFoundException({
      code: 'PUBLIC_EVENT_NOT_FOUND',
      message: 'Evento pubblico non trovato.',
    });
  }

  if (event.status !== 'PUBLISHED') {
    throw new ConflictException({
      code: 'EVENT_NOT_BOOKABLE',
      message: 'L’evento non accetta nuove prenotazioni.',
    });
  }

  if (now.getTime() < event.bookingOpensAt.getTime()) {
    throw new ConflictException({
      code: 'EVENT_BOOKING_NOT_OPEN',
      message: 'Le prenotazioni per questo evento non sono ancora aperte.',
    });
  }

  if (now.getTime() >= event.bookingClosesAt.getTime()) {
    throw new ConflictException({
      code: 'EVENT_BOOKING_CLOSED',
      message: 'Le prenotazioni per questo evento sono chiuse.',
    });
  }

  if (now.getTime() >= event.startsAt.getTime()) {
    throw new ConflictException({
      code: 'EVENT_ALREADY_STARTED',
      message: 'L’evento è già iniziato.',
    });
  }
}

export function assertPartySizeAllowed(
  partySize: number,
  rules: PublicBookingRules | null,
): asserts rules is PublicBookingRules {
  if (!rules) {
    throw new ConflictException({
      code: 'EVENT_BOOKING_RULES_MISSING',
      message: 'Le regole di prenotazione non sono configurate.',
    });
  }

  if (
    !Number.isInteger(partySize) ||
    partySize < rules.minPartySize ||
    partySize > rules.maxPartySize
  ) {
    throw new BadRequestException({
      code: 'PARTY_SIZE_NOT_ALLOWED',
      message: `I coperti devono essere compresi tra ${rules.minPartySize} e ${rules.maxPartySize}.`,
    });
  }
}

export function remainingEventCapacity(
  eventCapacity: number,
  occupiedCapacity: number,
): number {
  return Math.max(0, eventCapacity - occupiedCapacity);
}

export function assertEventCapacityAvailable(
  eventCapacity: number,
  occupiedCapacity: number,
  requestedPartySize: number,
): void {
  if (
    remainingEventCapacity(eventCapacity, occupiedCapacity) < requestedPartySize
  ) {
    throw new ConflictException({
      code: 'EVENT_CAPACITY_EXHAUSTED',
      message: 'Non ci sono abbastanza posti disponibili per questo gruppo.',
    });
  }
}
