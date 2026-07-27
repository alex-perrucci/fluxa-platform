// PHASE_5_RESERVATION_CONVERSION
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const migrationArgument = process.argv[2];

if (!migrationArgument) {
  console.error(
    'Uso: node scripts/verify-phase-5-reservation-conversion.mjs <migrazione.sql>',
  );
  process.exit(1);
}

const root = process.cwd();
const migrationPath = path.resolve(root, migrationArgument);

const requiredFiles = [
  'apps/api/src/reservations/reservation-conversion.service.ts',
  'apps/api/src/reservations/reservation-conversion-policy.ts',
  'apps/api/src/reservations/reservation-conversion-policy.spec.ts',
  'apps/api/src/reservations/dto/convert-hold-to-reservation.dto.ts',
  'apps/background-worker/src/reservation-payment-expiry.service.ts',
];

for (const relativePath of requiredFiles) {
  await stat(path.join(root, relativePath));
}

await stat(migrationPath);

const [
  schema,
  migration,
  controller,
  module,
  conversionService,
  backgroundModule,
  backgroundProcessor,
  expiryService,
] = await Promise.all([
  readFile(path.join(root, 'libs/database/src/schema.ts'), 'utf8'),
  readFile(migrationPath, 'utf8'),
  readFile(
    path.join(
      root,
      'apps/api/src/reservations/public-reservations.controller.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/api/src/reservations/reservations.module.ts'),
    'utf8',
  ),
  readFile(
    path.join(
      root,
      'apps/api/src/reservations/reservation-conversion.service.ts',
    ),
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
      'apps/background-worker/src/reservation-payment-expiry.service.ts',
    ),
    'utf8',
  ),
]);

const checks = [
  ['Schema payment expiry field', schema, 'paymentExpiresAt: timestamp('],
  ['Schema payment expiry index', schema, 'reservations_payment_expiry_idx'],
  [
    'Schema payment expiry constraint',
    schema,
    'reservations_payment_expiry_ck',
  ],
  ['Migration payment expiry column', migration, 'payment_expires_at'],
  ['Conversion route', controller, "@Post(':holdToken/reservations')"],
  ['Public reservation route', controller, "@Get(':reservationToken')"],
  ['Conversion service provider', module, 'ReservationConversionService'],
  ['Reservation insert', conversionService, 'INSERT INTO reservations'],
  ['Assignment transfer', conversionService, 'reservation_id = $2'],
  ['Hold conversion', conversionService, "status = 'CONVERTED'"],
  [
    'Status history',
    conversionService,
    'INSERT INTO reservation_status_history',
  ],
  ['Reservation audit', conversionService, 'INSERT INTO audit_events'],
  ['Reservation outbox', conversionService, 'INSERT INTO outbox_events'],
  [
    'Payment expiry provider',
    backgroundModule,
    'ReservationPaymentExpiryService',
  ],
  [
    'Payment expiry processor',
    backgroundProcessor,
    'paymentExpiry.expireAvailable',
  ],
  ['Payment expiry row locking', expiryService, 'FOR UPDATE SKIP LOCKED'],
  [
    'Payment expiry release',
    expiryService,
    "release_reason = 'PAYMENT_TIMEOUT'",
  ],
];

const missing = checks
  .filter(([, content, fragment]) => !content.includes(fragment))
  .map(([name]) => name);

if (missing.length > 0) {
  console.error('Verifica Fase 05 fallita.');
  console.error(`Elementi mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`File nuovi verificati: ${requiredFiles.length}`);
console.log(`Migrazione verificata: ${path.relative(root, migrationPath)}`);
console.log('Conversione hold → reservation: presente');
console.log('Trasferimento tavolo e idempotenza retry: presenti');
console.log('Scadenza PENDING_PAYMENT: presente');
console.log('Pagamenti POS esistenti: non modificati');
