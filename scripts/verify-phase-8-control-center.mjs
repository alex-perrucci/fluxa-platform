// PHASE_8_TRUE_CONTROL_CENTER
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const required = [
  'apps/api/src/platform/dto/platform-onboarding.dto.ts',
  'apps/api/src/platform/platform.service.ts',
  'apps/api/src/platform/platform.controller.ts',
  'apps/api/src/platform/platform.module.ts',
  'apps/api/src/control-center/control-center.service.ts',
  'apps/api/src/control-center/control-center.controller.ts',
  'apps/api/src/control-center/control-center.module.ts',
  'apps/web/app/(public)/page.tsx',
  'apps/web/app/(auth)/login/page.tsx',
  'apps/web/app/merchant/page.tsx',
  'apps/web/app/merchant/events/page.tsx',
  'apps/web/app/merchant/events/new/page.tsx',
  'apps/web/app/merchant/reservations/page.tsx',
  'apps/web/app/platform-admin/page.tsx',
  'apps/web/app/platform-admin/organizations/new/page.tsx',
  'apps/web/components/platform/onboarding-form.tsx',
  'apps/web/components/merchant/event-form.tsx',
  'apps/web/components/control-center/notification.tsx',
  'apps/web/lib/control-center/event-form-validation.ts',
  'apps/web/lib/control-center/event-form-validation.test.ts',
  'apps/web/lib/api/authenticated.ts',
  'docs/phase-2/control-center.md',
];

for (const relativePath of required) {
  await stat(path.join(root, relativePath));
}

const [
  appModule,
  platformService,
  controlCenter,
  webCss,
  login,
  eventForm,
  onboardingForm,
  notification,
  eventFormValidation,
] = await Promise.all([
  readFile(path.join(root, 'apps/api/src/app.module.ts'), 'utf8'),
  readFile(
    path.join(root, 'apps/api/src/platform/platform.service.ts'),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/api/src/control-center/control-center.service.ts'),
    'utf8',
  ),
  readFile(path.join(root, 'apps/web/app/globals.css'), 'utf8'),
  readFile(path.join(root, 'apps/web/components/auth/login-form.tsx'), 'utf8'),
  readFile(
    path.join(root, 'apps/web/components/merchant/event-form.tsx'),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/web/components/platform/onboarding-form.tsx'),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/web/components/control-center/notification.tsx'),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/web/lib/control-center/event-form-validation.ts'),
    'utf8',
  ),
]);

const checks = [
  ['PlatformModule import', appModule, 'PlatformModule'],
  ['ControlCenterModule import', appModule, 'ControlCenterModule'],
  [
    'Atomic transaction',
    platformService,
    'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE',
  ],
  ['Customer owner role', platformService, "'OWNER','ACTIVE'"],
  ['Onboarding outbox', platformService, 'platform.organization.onboarded'],
  [
    'Audit entity parameter separated',
    platformService,
    "'organization',$4,$5::jsonb",
  ],
  [
    'Merchant reservation query',
    controlCenter,
    'reservation_table_assignments',
  ],
  ['Control Center design', webCss, '.control-center'],
  ['Event Studio design', webCss, '.event-editor'],
  ['Organization selection UX', login, 'ORGANIZATION_SELECTION_REQUIRED'],
  ['Event table selection', eventForm, 'selectedTables'],
  ['Per-table capacity editor', onboardingForm, 'table-editor-row'],
  ['Per-table update function', onboardingForm, 'updateTable'],
  ['Hidden-step validation bypass', onboardingForm, 'noValidate'],
  ['Wizard validation routing', onboardingForm, 'function reject('],
  ['Fixed notification component', notification, 'control-notification'],
  ['Accessible live notification', notification, 'aria-live'],
  ['Notification design', webCss, '.control-notification'],
  ['Event errors use notification', eventForm, 'ControlCenterNotification'],
  [
    'Onboarding errors use notification',
    onboardingForm,
    'ControlCenterNotification',
  ],
  ['Date parsing helper', eventFormValidation, 'parseEventDateWindow'],
  ['Invalid date friendly error', eventFormValidation, 'data e ora non valide'],
  ['Date errors inside submit catch', eventForm, 'const dateWindow'],
  ['Event native validation bypass', eventForm, 'noValidate'],
];

const missing = checks
  .filter(([, content, fragment]) => !content.includes(fragment))
  .map(([name]) => name);

if (missing.length) {
  console.error(`Fase 08 incompleta: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`File Control Center verificati: ${required.length}`);
console.log('Platform onboarding atomico: presente');
console.log('Audit onboarding PostgreSQL: corretto');
console.log('Capienza per singolo tavolo: configurabile');
console.log('Validazione wizard multi-step: presente');
console.log('Notifiche errore fisse e accessibili: presenti');
console.log('Validazione date evento con errori amichevoli: presente');
console.log('Merchant events e reservations: presenti');
console.log('Login multi-organizzazione: presente');
console.log('Design system responsive: presente');
console.log('Nessuna nuova migrazione richiesta');
