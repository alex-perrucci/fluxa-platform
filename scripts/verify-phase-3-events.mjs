// PHASE_3_EVENTS_MODULE
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredFiles = [
  'apps/api/src/events/events.module.ts',
  'apps/api/src/events/events.controller.ts',
  'apps/api/src/events/events.service.ts',
  'apps/api/src/events/events-access.service.ts',
  'apps/api/src/events/event-policy.ts',
  'apps/api/src/events/event-policy.spec.ts',
  'apps/api/src/events/dto/create-event.dto.ts',
  'apps/api/src/events/dto/update-event.dto.ts',
  'apps/api/src/events/dto/event-booking-rules.dto.ts',
  'apps/api/src/events/dto/event-list-query.dto.ts',
  'apps/api/src/events/dto/replace-event-tables.dto.ts',
  'apps/api/src/events/dto/cancel-event.dto.ts',
];

for (const relativePath of requiredFiles) {
  await stat(path.join(root, relativePath));
}

const [appModule, controller, service, schema] = await Promise.all([
  readFile(path.join(root, 'apps/api/src/app.module.ts'), 'utf8'),
  readFile(path.join(root, 'apps/api/src/events/events.controller.ts'), 'utf8'),
  readFile(path.join(root, 'apps/api/src/events/events.service.ts'), 'utf8'),
  readFile(path.join(root, 'libs/database/src/schema.ts'), 'utf8'),
]);

const requiredAppModuleFragments = [
  "import { EventsModule } from './events/events.module';",
  'EventsModule,',
];

const requiredRoutes = [
  "@Controller('events')",
  "@Post(':eventId/publish')",
  "@Post(':eventId/cancel')",
  "@Put(':eventId/tables')",
  "@Put(':eventId/booking-rules')",
  "@Delete(':eventId')",
];

const requiredTopics = [
  'events.event.created',
  'events.event.updated',
  'events.event.tables_replaced',
  'events.event.booking_rules_updated',
  'events.event.published',
  'events.event.cancelled',
  'events.event.archived',
];

const missing = [
  ...requiredAppModuleFragments.filter((value) => !appModule.includes(value)),
  ...requiredRoutes.filter((value) => !controller.includes(value)),
  ...requiredTopics.filter((value) => !service.includes(value)),
];

const schemaMarkers = [
  'PHASE_2_EVENTS_RESERVATIONS_ENUMS_START',
  'PHASE_2_EVENTS_RESERVATIONS_TABLES_START',
  'PHASE_2_EVENTS_RESERVATIONS_TYPES_START',
];

missing.push(...schemaMarkers.filter((value) => !schema.includes(value)));

if (!service.includes('INSERT INTO audit_events')) {
  missing.push('audit_events insert');
}

if (!service.includes('INSERT INTO outbox_events')) {
  missing.push('outbox_events insert');
}

if (!service.includes('FOR UPDATE')) {
  missing.push('event row locking');
}

if (missing.length > 0) {
  console.error('Verifica Fase 03 fallita.');
  console.error(`Elementi mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`File verificati: ${requiredFiles.length}`);
console.log(`Route di gestione verificate: ${requiredRoutes.length}`);
console.log(`Topic outbox verificati: ${requiredTopics.length}`);
console.log('Audit e locking transazionale: presenti');
