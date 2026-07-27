import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const migrationArgument = process.argv[2];

if (!migrationArgument) {
  console.error(
    'Uso: node scripts/verify-phase-2-schema.mjs <percorso-migrazione.sql>',
  );
  process.exit(1);
}

const migrationPath = path.resolve(process.cwd(), migrationArgument);
const schemaPath = path.resolve(process.cwd(), 'libs/database/src/schema.ts');

await stat(migrationPath);
await stat(schemaPath);

const [migration, schema] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(schemaPath, 'utf8'),
]);

const expectedTables = [
  'events',
  'event_media',
  'event_table_inventory',
  'event_booking_rules',
  'platform_fee_rules',
  'reservation_holds',
  'reservations',
  'reservation_table_assignments',
  'reservation_payments',
  'platform_fee_ledger',
  'reservation_status_history',
];

const expectedConstraints = [
  'events_time_window_ck',
  'events_booking_window_ck',
  'events_booking_before_start_ck',
  'platform_fee_rules_scope_ck',
  'reservation_holds_merchant_gross_ck',
  'reservations_merchant_net_ck',
  'reservation_table_assignments_owner_ck',
  'reservation_table_assignments_active_state_ck',
  'reservation_payments_merchant_net_ck',
  'platform_fee_ledger_balance_ck',
];

const expectedIndexes = [
  'events_slug_uq',
  'event_table_inventory_event_table_uq',
  'reservation_holds_event_idempotency_uq',
  'reservations_confirmation_code_uq',
  'reservation_table_assignments_active_table_uq',
  'reservation_payments_provider_event_uq',
  'platform_fee_ledger_source_key_uq',
];

const missingTables = expectedTables.filter(
  (name) => !migration.includes(`CREATE TABLE "${name}"`),
);
const missingConstraints = expectedConstraints.filter(
  (name) => !migration.includes(name),
);
const missingIndexes = expectedIndexes.filter(
  (name) => !migration.includes(name),
);

const schemaMarkers = [
  'PHASE_2_EVENTS_RESERVATIONS_ENUMS_START',
  'PHASE_2_EVENTS_RESERVATIONS_TABLES_START',
  'PHASE_2_EVENTS_RESERVATIONS_TYPES_START',
];

const missingMarkers = schemaMarkers.filter(
  (marker) => !schema.includes(marker),
);

if (
  missingTables.length > 0 ||
  missingConstraints.length > 0 ||
  missingIndexes.length > 0 ||
  missingMarkers.length > 0
) {
  console.error('Verifica schema Phase 2 fallita.');

  if (missingTables.length > 0) {
    console.error(`Tabelle mancanti: ${missingTables.join(', ')}`);
  }

  if (missingConstraints.length > 0) {
    console.error(`Constraint mancanti: ${missingConstraints.join(', ')}`);
  }

  if (missingIndexes.length > 0) {
    console.error(`Indici mancanti: ${missingIndexes.join(', ')}`);
  }

  if (missingMarkers.length > 0) {
    console.error(`Marker schema mancanti: ${missingMarkers.join(', ')}`);
  }

  process.exit(1);
}

console.log(
  `Migrazione verificata: ${path.relative(process.cwd(), migrationPath)}`,
);
console.log(`Tabelle Phase 2: ${expectedTables.length}`);
console.log(`Constraint verificate: ${expectedConstraints.length}`);
console.log(`Indici univoci/critici verificati: ${expectedIndexes.length}`);
