// PHASE_3_EVENTS_MODULE
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { EventStatus } from '@fluxa/database';

export interface EventScheduleInput {
  startsAt: Date;
  endsAt: Date;
  bookingOpensAt: Date;
  bookingClosesAt: Date;
  bookingAmountCents: number;
  capacity: number;
  timezone: string;
  currency: string;
}

export interface BookingRulesInput {
  minPartySize?: number;
  maxPartySize: number;
  holdMinutes?: number;
  bookingCutoffMinutes?: number;
  cancellationCutoffMinutes?: number;
  autoAssignSmallestTable?: boolean;
  allowManualAssignment?: boolean;
  requirePhone?: boolean;
}

export interface NormalizedBookingRules {
  minPartySize: number;
  maxPartySize: number;
  holdMinutes: number;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  autoAssignSmallestTable: boolean;
  allowManualAssignment: boolean;
  requirePhone: boolean;
}

export interface InventoryMetrics {
  tableCount: number;
  activeTableCount: number;
  inventoryCapacity: number;
  maxTableCapacity: number;
}

export interface PublishableEvent {
  status: EventStatus;
  startsAt: Date;
  bookingClosesAt: Date;
  capacity: number;
}

export function normalizeEventSlug(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);

  if (slug.length < 3) {
    throw new BadRequestException({
      code: 'EVENT_SLUG_INVALID',
      message: 'Lo slug dell’evento deve contenere almeno tre caratteri.',
    });
  }

  return slug;
}

export function validateEventSchedule(input: EventScheduleInput): void {
  assertValidDate(input.startsAt, 'startsAt');
  assertValidDate(input.endsAt, 'endsAt');
  assertValidDate(input.bookingOpensAt, 'bookingOpensAt');
  assertValidDate(input.bookingClosesAt, 'bookingClosesAt');

  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new BadRequestException({
      code: 'EVENT_END_BEFORE_START',
      message: 'La fine dell’evento deve essere successiva all’inizio.',
    });
  }

  if (input.bookingClosesAt.getTime() <= input.bookingOpensAt.getTime()) {
    throw new BadRequestException({
      code: 'EVENT_BOOKING_WINDOW_INVALID',
      message: 'La chiusura prenotazioni deve seguire l’apertura.',
    });
  }

  if (input.bookingClosesAt.getTime() > input.startsAt.getTime()) {
    throw new BadRequestException({
      code: 'EVENT_BOOKING_CLOSES_AFTER_START',
      message: 'Le prenotazioni devono chiudersi entro l’inizio dell’evento.',
    });
  }

  if (
    !Number.isInteger(input.bookingAmountCents) ||
    input.bookingAmountCents < 0
  ) {
    throw new BadRequestException({
      code: 'EVENT_BOOKING_AMOUNT_INVALID',
      message: 'L’importo di prenotazione non è valido.',
    });
  }

  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    throw new BadRequestException({
      code: 'EVENT_CAPACITY_INVALID',
      message: 'La capacità dell’evento deve essere positiva.',
    });
  }

  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new BadRequestException({
      code: 'EVENT_CURRENCY_INVALID',
      message: 'La valuta deve essere un codice ISO di tre lettere.',
    });
  }

  try {
    new Intl.DateTimeFormat('it-IT', {
      timeZone: input.timezone,
    }).format(input.startsAt);
  } catch {
    throw new BadRequestException({
      code: 'EVENT_TIMEZONE_INVALID',
      message: 'Il fuso orario dell’evento non è valido.',
    });
  }
}

export function normalizeBookingRules(
  input: BookingRulesInput,
): NormalizedBookingRules {
  const rules: NormalizedBookingRules = {
    minPartySize: input.minPartySize ?? 1,
    maxPartySize: input.maxPartySize,
    holdMinutes: input.holdMinutes ?? 15,
    bookingCutoffMinutes: input.bookingCutoffMinutes ?? 0,
    cancellationCutoffMinutes: input.cancellationCutoffMinutes ?? 0,
    autoAssignSmallestTable: input.autoAssignSmallestTable ?? true,
    allowManualAssignment: input.allowManualAssignment ?? true,
    requirePhone: input.requirePhone ?? true,
  };

  if (
    !Number.isInteger(rules.minPartySize) ||
    !Number.isInteger(rules.maxPartySize) ||
    rules.minPartySize < 1 ||
    rules.maxPartySize < rules.minPartySize
  ) {
    throw new BadRequestException({
      code: 'EVENT_PARTY_SIZE_RANGE_INVALID',
      message: 'L’intervallo dei coperti prenotabili non è valido.',
    });
  }

  if (
    !Number.isInteger(rules.holdMinutes) ||
    rules.holdMinutes < 1 ||
    rules.holdMinutes > 120
  ) {
    throw new BadRequestException({
      code: 'EVENT_HOLD_MINUTES_INVALID',
      message: 'La durata dell’hold deve essere compresa tra 1 e 120 minuti.',
    });
  }

  if (
    !Number.isInteger(rules.bookingCutoffMinutes) ||
    rules.bookingCutoffMinutes < 0 ||
    !Number.isInteger(rules.cancellationCutoffMinutes) ||
    rules.cancellationCutoffMinutes < 0
  ) {
    throw new BadRequestException({
      code: 'EVENT_CUTOFF_INVALID',
      message: 'I tempi limite non possono essere negativi.',
    });
  }

  return rules;
}

export function assertRulesFitCapacity(
  rules: NormalizedBookingRules,
  eventCapacity: number,
  maxTableCapacity?: number,
): void {
  if (rules.maxPartySize > eventCapacity) {
    throw new BadRequestException({
      code: 'EVENT_PARTY_SIZE_EXCEEDS_CAPACITY',
      message: 'Il numero massimo di coperti supera la capacità dell’evento.',
    });
  }

  if (
    maxTableCapacity !== undefined &&
    maxTableCapacity > 0 &&
    rules.maxPartySize > maxTableCapacity
  ) {
    throw new BadRequestException({
      code: 'EVENT_PARTY_SIZE_EXCEEDS_TABLE',
      message:
        'Il numero massimo di coperti supera la capacità del tavolo più grande.',
    });
  }
}

export function assertInventoryFitsEvent(
  eventCapacity: number,
  metrics: InventoryMetrics,
  allowEmpty: boolean,
): void {
  if (metrics.tableCount === 0) {
    if (allowEmpty) return;

    throw new ConflictException({
      code: 'EVENT_TABLE_INVENTORY_EMPTY',
      message: 'Seleziona almeno un tavolo prima di pubblicare l’evento.',
    });
  }

  if (metrics.activeTableCount !== metrics.tableCount) {
    throw new ConflictException({
      code: 'EVENT_TABLE_INVENTORY_INACTIVE',
      message: 'Uno o più tavoli selezionati non sono attivi.',
    });
  }

  if (metrics.inventoryCapacity < eventCapacity) {
    throw new ConflictException({
      code: 'EVENT_TABLE_CAPACITY_INSUFFICIENT',
      message: 'La capacità dei tavoli selezionati è insufficiente.',
    });
  }
}

export function assertEventEditable(status: EventStatus): void {
  if (status !== 'DRAFT') {
    throw new ConflictException({
      code: 'EVENT_NOT_EDITABLE',
      message: 'Solo un evento in bozza può essere modificato.',
    });
  }
}

export function assertEventPublishable(
  event: PublishableEvent,
  metrics: InventoryMetrics,
  rules: NormalizedBookingRules | null,
  now = new Date(),
): void {
  assertEventEditable(event.status);

  if (event.startsAt.getTime() <= now.getTime()) {
    throw new ConflictException({
      code: 'EVENT_START_NOT_IN_FUTURE',
      message: 'L’evento deve iniziare nel futuro.',
    });
  }

  if (event.bookingClosesAt.getTime() <= now.getTime()) {
    throw new ConflictException({
      code: 'EVENT_BOOKING_ALREADY_CLOSED',
      message: 'La chiusura prenotazioni deve essere nel futuro.',
    });
  }

  assertInventoryFitsEvent(event.capacity, metrics, false);

  if (!rules) {
    throw new ConflictException({
      code: 'EVENT_BOOKING_RULES_MISSING',
      message: 'Configura le regole di prenotazione prima della pubblicazione.',
    });
  }

  assertRulesFitCapacity(rules, event.capacity, metrics.maxTableCapacity);
}

export function assertEventCancellable(status: EventStatus): void {
  if (status !== 'PUBLISHED' && status !== 'SOLD_OUT') {
    throw new ConflictException({
      code: 'EVENT_NOT_CANCELLABLE',
      message: 'Solo un evento pubblicato può essere annullato.',
    });
  }
}

export function assertEventArchivable(status: EventStatus): void {
  if (!['DRAFT', 'CANCELLED', 'COMPLETED'].includes(status)) {
    throw new ConflictException({
      code: 'EVENT_NOT_ARCHIVABLE',
      message:
        'Un evento pubblicato o sold out deve essere annullato prima di archiviarlo.',
    });
  }
}

export function normalizeEventPagination(input: {
  page?: number;
  pageSize?: number;
}) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 25;

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function assertValidDate(value: Date, field: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new BadRequestException({
      code: 'EVENT_DATE_INVALID',
      message: `La data ${field} non è valida.`,
    });
  }
}
