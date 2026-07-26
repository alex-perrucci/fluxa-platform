// PHASE_4_RESERVATION_ENGINE
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredFiles = [
  'apps/api/src/reservations/reservations.module.ts',
  'apps/api/src/reservations/public-reservations.controller.ts',
  'apps/api/src/reservations/reservation-engine.service.ts',
  'apps/api/src/reservations/reservation-policy.ts',
  'apps/api/src/reservations/reservation-policy.spec.ts',
  'apps/api/src/reservations/dto/availability-query.dto.ts',
  'apps/api/src/reservations/dto/create-reservation-hold.dto.ts',
  'apps/background-worker/src/reservation-hold-expiry.service.ts',
  'apps/background-worker/src/reservation-hold-scheduler.service.ts',
];

for (const relativePath of requiredFiles) {
  await stat(path.join(root, relativePath));
}

const [
  appModule,
  controller,
  engine,
  backgroundModule,
  backgroundProcessor,
  scheduler,
  queueConstants,
] = await Promise.all([
  readFile(path.join(root, 'apps/api/src/app.module.ts'), 'utf8'),
  readFile(
    path.join(
      root,
      'apps/api/src/reservations/public-reservations.controller.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/api/src/reservations/reservation-engine.service.ts'),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/background-worker/src/background-worker.module.ts'),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/background-worker/src/background.processor.ts'),
    'utf8',
  ),
  readFile(
    path.join(
      root,
      'apps/background-worker/src/reservation-hold-scheduler.service.ts',
    ),
    'utf8',
  ),
  readFile(path.join(root, 'libs/queue/src/queue.constants.ts'), 'utf8'),
]);

const requiredFragments = [
  ['ReservationsModule import', appModule, 'import { ReservationsModule }'],
  ['ReservationsModule registration', appModule, 'ReservationsModule,'],
  ['Public decorator', controller, '@Public()'],
  ['Availability route', controller, "@Get(':slug/availability')"],
  ['Hold route', controller, "@Post(':slug/holds')"],
  ['Hold status route', controller, "@Get(':holdToken')"],
  ['Hold cancellation route', controller, "@Delete(':holdToken')"],
  ['Advisory lock', engine, 'pg_advisory_xact_lock'],
  ['Smallest table ordering', engine, 'capacity_snapshot ASC'],
  ['Row skipping', engine, 'SKIP LOCKED'],
  ['Request idempotency', engine, 'idempotency_key'],
  ['Token hashing', engine, 'hashPublicToken'],
  ['Capacity enforcement', engine, 'assertEventCapacityAvailable'],
  ['Assignment unique key', engine, 'active_event_table_key'],
  ['Audit insert', engine, 'INSERT INTO audit_events'],
  ['Outbox insert', engine, 'INSERT INTO outbox_events'],
  [
    'Expiry service registration',
    backgroundModule,
    'ReservationHoldExpiryService',
  ],
  [
    'Expiry scheduler registration',
    backgroundModule,
    'ReservationHoldSchedulerService',
  ],
  ['Expiry processor dispatch', backgroundProcessor, 'expireAvailable'],
  ['Scheduler API', scheduler, 'upsertJobScheduler'],
  ['Expiry job constant', queueConstants, 'RESERVATION_HOLD_EXPIRY_JOB'],
];

const missing = requiredFragments
  .filter(([, content, fragment]) => !content.includes(fragment))
  .map(([name]) => name);

if (missing.length > 0) {
  console.error('Verifica Fase 04 fallita.');
  console.error(`Elementi mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`File verificati: ${requiredFiles.length}`);
console.log('Disponibilità e hold pubblici: presenti');
console.log('Lock evento, SKIP LOCKED e idempotenza: presenti');
console.log('Scadenza automatica BullMQ: presente');
console.log('Audit e outbox transazionali: presenti');
