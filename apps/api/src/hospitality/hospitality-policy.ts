import { ConflictException } from '@nestjs/common';

export type TableSessionState = 'OPEN' | 'CLOSED' | 'CANCELLED';
export type KitchenTicketState =
  'QUEUED' | 'IN_PROGRESS' | 'READY' | 'SERVED' | 'CANCELLED';

export interface KitchenDispatchRoutingCandidate {
  stationId: string | null;
  stationName: string | null;
}

const TABLE_TRANSITIONS: Record<
  TableSessionState,
  readonly TableSessionState[]
> = {
  OPEN: ['CLOSED', 'CANCELLED'],
  CLOSED: [],
  CANCELLED: [],
};

const KITCHEN_TRANSITIONS: Record<
  KitchenTicketState,
  readonly KitchenTicketState[]
> = {
  QUEUED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['READY'],
  READY: ['SERVED'],
  SERVED: [],
  CANCELLED: [],
};

export function assertTableSessionTransition(
  current: TableSessionState,
  next: TableSessionState,
): void {
  if (!TABLE_TRANSITIONS[current].includes(next)) {
    throw new ConflictException({
      code: 'INVALID_TABLE_SESSION_TRANSITION',
      message: `Transizione tavolo non valida: ${current} -> ${next}.`,
    });
  }
}

export function assertKitchenTicketTransition(
  current: KitchenTicketState,
  next: KitchenTicketState,
): void {
  if (!KITCHEN_TRANSITIONS[current].includes(next)) {
    throw new ConflictException({
      code: 'INVALID_KITCHEN_TICKET_TRANSITION',
      message: `Transizione comanda non valida: ${current} -> ${next}.`,
    });
  }
}

export function remainingKitchenQuantity(
  current: number,
  sent: number,
): number {
  if (
    !Number.isInteger(current) ||
    !Number.isInteger(sent) ||
    current < 0 ||
    sent < 0
  ) {
    throw new Error('Kitchen quantities must be non-negative integers.');
  }
  return Math.max(0, current - sent);
}

export function partitionKitchenDispatchItems<
  T extends KitchenDispatchRoutingCandidate,
>(items: readonly T[]): { dispatchable: T[]; unavailable: T[] } {
  const dispatchable: T[] = [];
  const unavailable: T[] = [];

  for (const item of items) {
    if (item.stationId === null) {
      continue;
    }
    if (item.stationName === null) {
      unavailable.push(item);
      continue;
    }
    dispatchable.push(item);
  }

  return { dispatchable, unavailable };
}

export function buildActiveTableKey(
  organizationId: string,
  tableId: string,
): string {
  return `${organizationId}:${tableId}`;
}

export function formatKitchenTicketNumber(
  businessDate: string,
  sequence: number,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error('Invalid business date.');
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999999) {
    throw new Error('Invalid kitchen ticket sequence.');
  }
  return `KIT-${businessDate.replaceAll('-', '')}-${sequence.toString().padStart(4, '0')}`;
}
