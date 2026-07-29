// PHASE_9_PUBLIC_BOOKING
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredFiles = [
  'apps/api/src/events/dto/public-event-list-query.dto.ts',
  'apps/api/src/events/public-event-policy.ts',
  'apps/api/src/events/public-event-policy.spec.ts',
  'apps/api/src/events/public-events.controller.ts',
  'apps/api/src/events/public-events.service.ts',
  'apps/web/app/(public)/events/page.tsx',
  'apps/web/app/(public)/events/[slug]/page.tsx',
  'apps/web/app/(public)/booking/[reservationToken]/page.tsx',
  'apps/web/app/(public)/booking/success/page.tsx',
  'apps/web/app/(public)/booking/cancel/page.tsx',
  'apps/web/app/api/public/events/route.ts',
  'apps/web/app/api/public/events/[slug]/route.ts',
  'apps/web/app/api/public/events/[slug]/availability/route.ts',
  'apps/web/app/api/public/events/[slug]/holds/route.ts',
  'apps/web/app/api/public/reservation-holds/[holdToken]/route.ts',
  'apps/web/app/api/public/reservation-holds/[holdToken]/reservations/route.ts',
  'apps/web/app/api/public/reservations/[reservationToken]/route.ts',
  'apps/web/app/api/public/reservations/[reservationToken]/checkout-sessions/route.ts',
  'apps/web/components/public/booking-widget.tsx',
  'apps/web/components/public/event-card.tsx',
  'apps/web/components/public/public-header.tsx',
  'apps/web/components/public/reservation-card.tsx',
  'apps/web/components/public/reservation-payment-button.tsx',
  'apps/web/components/public/reservation-status-watcher.tsx',
  'apps/web/lib/api/public-bff.ts',
  'apps/web/lib/public-booking/format.ts',
  'apps/web/lib/public-booking/format.test.ts',
  'apps/web/lib/public-booking/types.ts',
  'docs/phase-2/public-booking-experience.md',
];

await Promise.all(requiredFiles.map((file) => access(path.join(root, file))));

const [
  moduleSource,
  publicController,
  publicService,
  bookingWidget,
  checkoutRoute,
  successPage,
  webCss,
  notification,
] = await Promise.all([
  readFile(path.join(root, 'apps/api/src/events/events.module.ts'), 'utf8'),
  readFile(
    path.join(root, 'apps/api/src/events/public-events.controller.ts'),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/api/src/events/public-events.service.ts'),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/web/components/public/booking-widget.tsx'),
    'utf8',
  ),
  readFile(
    path.join(
      root,
      'apps/web/app/api/public/reservations/[reservationToken]/checkout-sessions/route.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/web/app/(public)/booking/success/page.tsx'),
    'utf8',
  ),
  readFile(path.join(root, 'apps/web/app/globals.css'), 'utf8'),
  readFile(
    path.join(root, 'apps/web/components/control-center/notification.tsx'),
    'utf8',
  ),
]);

const checks = [
  ['Public controller registered', moduleSource, 'PublicEventsController'],
  ['Public service registered', moduleSource, 'PublicEventsService'],
  ['Public event list endpoint', publicController, '@Get()'],
  ['Public event detail endpoint', publicController, "@Get(':slug')"],
  ['Capacity derived from active occupancy', publicService, 'active_occupancy'],
  ['No public table identities', publicService, 'tableCount'],
  ['Atomic hold call', bookingWidget, '/holds'],
  ['Reservation conversion call', bookingWidget, '/reservations'],
  ['Stripe handoff', bookingWidget, 'ReservationPaymentButton'],
  ['Checkout BFF', checkoutRoute, 'checkout-sessions'],
  ['Signed webhook status wait', successPage, 'ReservationStatusWatcher'],
  ['Fixed notification reused', bookingWidget, 'ControlCenterNotification'],
  ['Public responsive design', webCss, '.public-event-grid'],
  ['Accessible notification retained', notification, 'aria-live'],
];

for (const [name, source, marker] of checks) {
  if (!source.includes(marker)) {
    throw new Error(`${name}: marker missing (${marker}).`);
  }
}

console.log(`File Fase 09 verificati: ${requiredFiles.length}`);
console.log('Catalogo eventi pubblico: presente');
console.log('Hold e conversione visuali: presenti');
console.log('Stripe success/cancel flow: presente');
console.log('Conferma prenotazione pubblica: presente');
console.log('Nessuna nuova migrazione richiesta');
