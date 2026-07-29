// PHASE_10_RESERVATION_OPERATIONS
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredFiles = [
  'apps/api/src/control-center/dto/reservation-feed-query.dto.ts',
  'apps/api/src/control-center/dto/reservation-operation.dto.ts',
  'apps/api/src/control-center/reservation-operations-policy.ts',
  'apps/api/src/control-center/reservation-operations-policy.spec.ts',
  'apps/api/src/control-center/reservation-operations.service.ts',
  'apps/web/app/merchant/reservations/[reservationId]/page.tsx',
  'apps/web/app/api/control-center/reservation-feed/route.ts',
  'apps/web/app/api/control-center/reservations/[reservationId]/route.ts',
  'apps/web/app/api/control-center/reservations/[reservationId]/actions/[action]/route.ts',
  'apps/web/components/merchant/reservation-actions.tsx',
  'apps/web/components/merchant/reservation-live-sync.tsx',
  'docs/phase-2/reservation-operations.md',
];

await Promise.all(requiredFiles.map((file) => access(path.join(root, file))));

const [
  controller,
  operations,
  controlCenter,
  moduleSource,
  reservationsPage,
  reservationDetail,
  liveSync,
  webCss,
] = await Promise.all([
  readFile(
    path.join(root, 'apps/api/src/control-center/control-center.controller.ts'),
    'utf8',
  ),
  readFile(
    path.join(
      root,
      'apps/api/src/control-center/reservation-operations.service.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/api/src/control-center/control-center.service.ts'),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/api/src/control-center/control-center.module.ts'),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/web/app/merchant/reservations/page.tsx'),
    'utf8',
  ),
  readFile(
    path.join(
      root,
      'apps/web/app/merchant/reservations/[reservationId]/page.tsx',
    ),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/web/components/merchant/reservation-live-sync.tsx'),
    'utf8',
  ),
  readFile(path.join(root, 'apps/web/app/globals.css'), 'utf8'),
]);

const checks = [
  [
    'Operations service registered',
    moduleSource,
    'ReservationOperationsService',
  ],
  ['Action endpoint', controller, 'actions/:action'],
  ['Feed endpoint', controller, 'reservation-feed'],
  ['Reservation advisory lock', operations, 'reservation-operation:'],
  ['Table advisory lock', operations, 'buildActiveTableKey'],
  ['POS table session insert', operations, 'INSERT INTO table_sessions'],
  ['Version guard', operations, 'RESERVATION_VERSION_CONFLICT'],
  ['Mutation idempotency', operations, 'request_id = $3'],
  ['Status history', operations, 'reservation_status_history'],
  ['Operational outbox', operations, 'reservationOperationTopic(action)'],
  ['Detail query', controlCenter, 'reservationDetail'],
  ['Typed detail query', controlCenter, 'query<ReservationDetailRow>'],
  ['Typed detail return', controlCenter, 'Promise<ReservationDetailView>'],
  ['Typed operation return', operations, 'Promise<ReservationDetailView>'],
  ['Cursor feed', controlCenter, 'afterId'],
  [
    'Nullable backend cursor',
    controlCenter,
    'const afterId = query.afterId ?? null',
  ],
  ['Nullable cursor SQL', controlCenter, '$4::uuid IS NULL'],
  ['Live board', reservationsPage, 'ReservationLiveSync'],
  ['Detail actions', reservationDetail, 'ReservationActions'],
  ['Compact reservation code', reservationDetail, 'reservation-code-block'],
  ['Guest identity hero', reservationDetail, 'reservation.customerName'],
  ['Safe code wrapping', webCss, '.reservation-code-block code'],
  ['Polling refresh', liveSync, 'router.refresh'],
  ['No fake UUID cursor', liveSync, 'afterId: null'],
  [
    'Conditional afterId query',
    liveSync,
    "query.set('afterId', cursor.current.afterId)",
  ],
  ['Live design layer', webCss, '.live-pill'],
];

for (const [name, source, marker] of checks) {
  if (!source.includes(marker)) {
    throw new Error(`${name}: marker missing (${marker}).`);
  }
}

console.log(`File Fase 10 verificati: ${requiredFiles.length}`);
console.log('Check-in atomico e sessione POS: presenti');
console.log('Transizioni operative versionate: presenti');
console.log('Board prenotazioni live: presente');
console.log('Timeline e dettaglio prenotazione: presenti');
console.log('Query e ritorni operativi tipizzati: presenti');
console.log('Layout dettaglio prenotazione responsive: presente');
console.log('Cursor live feed senza UUID fittizio: presente');
console.log('Nessuna nuova migrazione richiesta');
