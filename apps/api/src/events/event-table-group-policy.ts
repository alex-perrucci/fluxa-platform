import { ConflictException } from '@nestjs/common';
import type { EventStatus } from '@fluxa/database';

export function assertEventInventoryMutable(status: EventStatus): void {
  if (status === 'DRAFT' || status === 'PUBLISHED' || status === 'SOLD_OUT') {
    return;
  }

  throw new ConflictException({
    code: 'EVENT_INVENTORY_LOCKED',
    message:
      'L’inventario non può essere modificato per un evento concluso, annullato o archiviato.',
  });
}

export function assertTablesNotAssigned(activeAssignmentCount: number): void {
  if (activeAssignmentCount === 0) return;

  throw new ConflictException({
    code: 'EVENT_TABLES_ALREADY_ASSIGNED',
    message:
      'Uno o più tavoli sono già occupati da hold o prenotazioni attive e non possono essere combinati o separati.',
  });
}
