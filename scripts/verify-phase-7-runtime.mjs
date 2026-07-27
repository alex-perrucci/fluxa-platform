// PHASE_7_RUNTIME_INTEGRATION
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredFiles = [
  'scripts/phase-2/runtime/phase-2-runtime-fixture.mjs',
  'scripts/phase-2/runtime/local-database-guard.mjs',
  'scripts/phase-2/runtime/seed-phase-2-runtime.mjs',
  'scripts/phase-2/runtime/smoke-phase-2-runtime.mjs',
  'docs/phase-2/runtime-integration.md',
];

for (const relativePath of requiredFiles) {
  await stat(path.join(root, relativePath));
}

const migrationNames = (await readdir(path.join(root, 'drizzle'))).filter(
  (name) => name.endsWith('.sql'),
);
const phaseTwoMigration = migrationNames.find((name) =>
  name.startsWith('0009_'),
);
const paymentExpiryMigration = migrationNames.find((name) =>
  name.startsWith('0010_'),
);

if (!phaseTwoMigration || !paymentExpiryMigration) {
  console.error('Migrazioni 0009 e 0010 non trovate.');
  process.exit(1);
}

const [
  phaseTwoSql,
  paymentExpirySql,
  conversionService,
  stripeService,
  guard,
  seed,
  smoke,
] = await Promise.all([
  readFile(path.join(root, 'drizzle', phaseTwoMigration), 'utf8'),
  readFile(path.join(root, 'drizzle', paymentExpiryMigration), 'utf8'),
  readFile(
    path.join(
      root,
      'apps/api/src/reservations/reservation-conversion.service.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/api/src/reservations/reservation-stripe.service.ts'),
    'utf8',
  ),
  readFile(
    path.join(root, 'scripts/phase-2/runtime/local-database-guard.mjs'),
    'utf8',
  ),
  readFile(
    path.join(root, 'scripts/phase-2/runtime/seed-phase-2-runtime.mjs'),
    'utf8',
  ),
  readFile(
    path.join(root, 'scripts/phase-2/runtime/smoke-phase-2-runtime.mjs'),
    'utf8',
  ),
]);

const checks = [
  ['Migration events', phaseTwoSql, 'CREATE TABLE "events"'],
  ['Migration reservations', phaseTwoSql, 'CREATE TABLE "reservations"'],
  ['Migration payment expiry', paymentExpirySql, 'payment_expires_at'],
  [
    'Phase 05 conversion marker',
    conversionService,
    'PHASE_5_RESERVATION_CONVERSION',
  ],
  [
    'Phase 06 Stripe marker',
    stripeService,
    'PHASE_6_STRIPE_RESERVATION_PAYMENTS',
  ],
  ['Localhost guard', guard, "new Set(['localhost', '127.0.0.1', '::1'])"],
  ['Production refusal', guard, "process.env.NODE_ENV === 'production'"],
  ['Idempotent fixture cleanup', seed, 'DELETE FROM reservation_payments'],
  ['Published event seed', seed, "'PUBLISHED'"],
  ['Concurrency smoke', smoke, 'Promise.all'],
  ['Signed webhook smoke', smoke, 'generateTestHeaderString'],
  ['Hold expiry smoke', smoke, 'verifyHoldExpiryWorker'],
  ['Payment expiry smoke', smoke, 'verifyPaymentExpiryWorker'],
  ['Late payment smoke', smoke, "'REFUND_PENDING'"],
];

const missing = checks
  .filter(([, content, fragment]) => !content.includes(fragment))
  .map(([name]) => name);

if (missing.length > 0) {
  console.error('Verifica Fase 07 fallita.');
  console.error(`Elementi mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`File runtime verificati: ${requiredFiles.length}`);
console.log(`Migrazione eventi: ${phaseTwoMigration}`);
console.log(`Migrazione payment expiry: ${paymentExpiryMigration}`);
console.log('Guard database locale: presente');
console.log('Seed, concorrenza, webhook e worker smoke: presenti');
console.log('Nessuna nuova migrazione richiesta');
