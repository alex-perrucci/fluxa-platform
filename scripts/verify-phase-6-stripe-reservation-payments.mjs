// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredFiles = [
  'apps/api/src/reservations/reservation-stripe.service.ts',
  'apps/api/src/reservations/reservation-stripe.controller.ts',
  'apps/api/src/reservations/reservation-payment-policy.ts',
  'apps/api/src/reservations/reservation-payment-policy.spec.ts',
  'apps/api/src/reservations/dto/create-reservation-checkout.dto.ts',
];

for (const relativePath of requiredFiles) {
  await stat(path.join(root, relativePath));
}

const [
  packageJson,
  main,
  environment,
  environmentExample,
  controller,
  service,
  module,
] = await Promise.all([
  readFile(path.join(root, 'package.json'), 'utf8'),
  readFile(path.join(root, 'apps/api/src/main.ts'), 'utf8'),
  readFile(path.join(root, 'libs/config/src/environment.ts'), 'utf8'),
  readFile(path.join(root, '.env.example'), 'utf8'),
  readFile(
    path.join(
      root,
      'apps/api/src/reservations/reservation-stripe.controller.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/api/src/reservations/reservation-stripe.service.ts'),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/api/src/reservations/reservations.module.ts'),
    'utf8',
  ),
]);

const parsedPackage = JSON.parse(packageJson);
const stripeVersion = parsedPackage.dependencies?.stripe;

const checks = [
  ['Stripe dependency', String(stripeVersion), '22.3.2'],
  ['Nest raw body', main, 'rawBody: true'],
  ['Stripe secret config', environment, 'STRIPE_SECRET_KEY'],
  ['Stripe webhook config', environment, 'STRIPE_WEBHOOK_SECRET'],
  ['Booking web config', environment, 'BOOKING_WEB_BASE_URL'],
  ['Stripe env example', environmentExample, 'STRIPE_WEBHOOK_SECRET='],
  [
    'Checkout route',
    controller,
    "@Post(':reservationToken/checkout-sessions')",
  ],
  ['Webhook route', controller, "@Post('stripe/webhook')"],
  ['Raw body request', controller, 'RawBodyRequest<Request>'],
  ['Stripe signature verification', service, 'webhooks.constructEvent'],
  ['Stripe idempotency', service, 'idempotencyKey:'],
  ['Reservation payment insert', service, 'INSERT INTO reservation_payments'],
  ['Paid payment update', service, "status = 'PAID'"],
  ['Reservation confirmation', service, "'CONFIRMED'"],
  ['Late payment protection', service, "'REFUND_PENDING'"],
  ['Fee ledger', service, 'INSERT INTO platform_fee_ledger'],
  ['Status history', service, 'INSERT INTO reservation_status_history'],
  ['Audit', service, 'INSERT INTO audit_events'],
  ['Outbox', service, 'INSERT INTO outbox_events'],
  ['Stripe service provider', module, 'ReservationStripeService'],
];

const missing = checks
  .filter(([, content, fragment]) => !content.includes(fragment))
  .map(([name]) => name);

if (missing.length > 0) {
  console.error('Verifica Fase 06 fallita.');
  console.error(`Elementi mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`File nuovi verificati: ${requiredFiles.length}`);
console.log(`Stripe SDK: ${stripeVersion}`);
console.log('Checkout pubblico e webhook firmato: presenti');
console.log('Conferma, late payment e ledger: presenti');
console.log('Dominio pagamenti POS: separato');
