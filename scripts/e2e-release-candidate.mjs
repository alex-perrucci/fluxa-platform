import { randomUUID } from 'node:crypto';
import process from 'node:process';

const baseInput =
  process.env.FLUXA_API_BASE_URL || 'http://127.0.0.1:3000/api/v1';
const apiBase = baseInput.replace(/\/+$/, '');
const apiUrl = new URL(apiBase);
const allowRemote = process.argv.includes('--allow-remote');
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);

if (!allowRemote && !localHosts.has(apiUrl.hostname)) {
  throw new Error(
    'Release E2E creates data and refuses a remote API. Use --allow-remote only on an isolated test environment.',
  );
}

const adminEmail = process.env.FLUXA_E2E_ADMIN_EMAIL?.trim() ?? '';
const adminPassword = process.env.FLUXA_E2E_ADMIN_PASSWORD ?? '';

if (!adminEmail || !adminPassword) {
  throw new Error(
    'FLUXA_E2E_ADMIN_EMAIL and FLUXA_E2E_ADMIN_PASSWORD are required.',
  );
}

async function request(pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(
      `${method} ${pathname} failed with HTTP ${response.status}: ${String(
        typeof payload === 'string' ? payload : JSON.stringify(payload),
      ).slice(0, 500)}`,
    );
  }

  return payload;
}

async function login(email, password, organizationId) {
  return request('/auth/login', {
    method: 'POST',
    body: {
      email,
      password,
      ...(organizationId ? { organizationId } : {}),
      device: {
        installationId: `release-e2e-${randomUUID()}`,
        name: 'Fluxa release E2E',
        platform: 'OTHER',
        model: 'Automated API test',
        appVersion: '0.8.0',
      },
    },
  });
}

const suffix = `${Date.now().toString(36)}${randomUUID()
  .replaceAll('-', '')
  .slice(0, 8)}`.toLowerCase();
const ownerEmail = `fluxa-e2e+${suffix}@example.com`;
const ownerPassword = `Fluxa_E2E_${suffix}_Pwd!`;
const slug = `fluxa-e2e-${suffix}`.slice(0, 78);

console.log('1/10 platform administrator login');
const adminLogin = await login(adminEmail, adminPassword);
const adminToken = adminLogin?.tokens?.accessToken;

if (!adminToken || !adminLogin?.user?.platformAdmin) {
  throw new Error('Platform administrator login did not return admin access.');
}

console.log('2/10 atomic organization onboarding');
const onboarding = await request('/platform/onboarding', {
  method: 'POST',
  token: adminToken,
  body: {
    organizationName: `Fluxa E2E ${suffix}`,
    organizationSlug: `fluxa-e2e-${suffix}`.slice(0, 78),
    ownerEmail,
    ownerDisplayName: 'Fluxa E2E Owner',
    ownerTemporaryPassword: ownerPassword,
    legalName: `Fluxa E2E ${suffix} Srl`,
    tradeName: `Fluxa E2E ${suffix}`,
    vatNumber: `RC${suffix}`.replace(/[^a-z0-9]/gi, '').slice(0, 20),
    countryCode: 'IT',
    locationCode: 'MAIN',
    locationName: 'Fluxa E2E Location',
    addressLine1: 'Via Test 11',
    postalCode: '43100',
    city: 'Parma',
    province: 'PR',
    timezone: 'Europe/Rome',
    areaCode: 'SALA',
    areaName: 'Sala E2E',
    tables: [
      { code: 'T1', name: 'Tavolo E2E 1', capacity: 2 },
      { code: 'T2', name: 'Tavolo E2E 2', capacity: 4 },
    ],
  },
});

const organizationId = onboarding?.organization?.id;
const locationId = onboarding?.location?.id;
const tableIds = onboarding?.tables?.map((table) => table.id) ?? [];

if (!organizationId || !locationId || tableIds.length !== 2) {
  throw new Error('Onboarding response is incomplete.');
}

console.log('3/10 owner login');
const ownerLogin = await login(ownerEmail, ownerPassword, organizationId);
const ownerToken = ownerLogin?.tokens?.accessToken;

if (!ownerToken || ownerLogin?.organization?.role !== 'OWNER') {
  throw new Error('Owner login did not select the new organization.');
}

const now = Date.now();
const startsAt = new Date(now + 24 * 60 * 60 * 1000);
const endsAt = new Date(now + 28 * 60 * 60 * 1000);
const bookingOpensAt = new Date(now - 60 * 1000);
const bookingClosesAt = new Date(now + 23 * 60 * 60 * 1000);

console.log('4/10 event creation and publishing');
const event = await request('/events', {
  method: 'POST',
  token: ownerToken,
  body: {
    locationId,
    title: `Fluxa release E2E ${suffix}`,
    slug,
    description:
      'Automated release-candidate event used to validate the complete booking and hospitality lifecycle.',
    timezone: 'Europe/Rome',
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    bookingOpensAt: bookingOpensAt.toISOString(),
    bookingClosesAt: bookingClosesAt.toISOString(),
    bookingAmountCents: 0,
    currency: 'EUR',
    capacity: 6,
    cancellationPolicy: 'Automated test event.',
    bookingRules: {
      minPartySize: 1,
      maxPartySize: 4,
      holdMinutes: 5,
      bookingCutoffMinutes: 0,
      cancellationCutoffMinutes: 0,
      autoAssignSmallestTable: true,
      allowManualAssignment: true,
      requirePhone: false,
    },
    tableIds,
  },
});

if (!event?.id || event?.status !== 'DRAFT') {
  throw new Error('Event creation did not return a DRAFT event.');
}

const published = await request(`/events/${event.id}/publish`, {
  method: 'POST',
  token: ownerToken,
});

if (published?.status !== 'PUBLISHED') {
  throw new Error('Event publishing failed.');
}

console.log('5/10 public discovery and availability');
const publicEvent = await request(`/public/events/${slug}`);
const availability = await request(
  `/public/events/${slug}/availability?partySize=2`,
);

if (publicEvent?.slug !== slug || availability?.available !== true) {
  throw new Error('Public event or availability is not ready for booking.');
}

console.log('6/10 atomic hold and free reservation');
const holdToken = randomUUID();
const hold = await request(`/public/events/${slug}/holds`, {
  method: 'POST',
  body: {
    partySize: 2,
    holdToken,
    idempotencyKey: `release-hold-${suffix}`,
  },
});

if (hold?.status !== 'ACTIVE') {
  throw new Error('Reservation hold is not ACTIVE.');
}

const reservationToken = randomUUID();
const reservation = await request(
  `/public/reservation-holds/${holdToken}/reservations`,
  {
    method: 'POST',
    body: {
      reservationToken,
      customerName: 'Fluxa Release Guest',
      customerEmail: `guest+${suffix}@example.com`,
      customerPhone: '+39 333 1234567',
      customerNote: 'Automated release-candidate booking.',
    },
  },
);

if (!reservation?.id || reservation?.status !== 'CONFIRMED') {
  throw new Error('Free reservation was not confirmed.');
}

console.log('7/10 check-in and table-session creation');
const detail = await request(`/control-center/reservations/${reservation.id}`, {
  token: ownerToken,
});
const checkedIn = await request(
  `/control-center/reservations/${reservation.id}/actions/check-in`,
  {
    method: 'POST',
    token: ownerToken,
    body: {
      mutationId: randomUUID(),
      expectedVersion: detail.version,
    },
  },
);

if (
  checkedIn?.status !== 'CHECKED_IN' ||
  checkedIn?.tableSessionStatus !== 'OPEN' ||
  !checkedIn?.tableSessionId
) {
  throw new Error('Check-in did not open a POS table session.');
}

console.log('8/10 seating');
const seated = await request(
  `/control-center/reservations/${reservation.id}/actions/seat`,
  {
    method: 'POST',
    token: ownerToken,
    body: {
      mutationId: randomUUID(),
      expectedVersion: checkedIn.version,
    },
  },
);

if (seated?.status !== 'SEATED') {
  throw new Error('Reservation did not transition to SEATED.');
}

console.log('9/10 POS session close');
const closedSession = await request(
  `/table-sessions/${seated.tableSessionId}/close`,
  {
    method: 'POST',
    token: ownerToken,
    body: {
      mutationId: randomUUID(),
      expectedVersion: seated.tableSessionVersion,
      reason: 'Fluxa release E2E completed',
    },
  },
);

if (closedSession?.status !== 'CLOSED') {
  throw new Error('POS table session did not close.');
}

console.log('10/10 reservation completion');
const completed = await request(
  `/control-center/reservations/${reservation.id}/actions/complete`,
  {
    method: 'POST',
    token: ownerToken,
    body: {
      mutationId: randomUUID(),
      expectedVersion: seated.version,
    },
  },
);

if (
  completed?.status !== 'COMPLETED' ||
  completed?.tableSessionStatus !== 'CLOSED'
) {
  throw new Error('Reservation lifecycle did not complete.');
}

console.log(
  JSON.stringify(
    {
      status: 'passed',
      organizationId,
      locationId,
      eventId: event.id,
      eventSlug: slug,
      reservationId: reservation.id,
      confirmationCode: reservation.confirmationCode,
      tableSessionId: completed.tableSessionId,
    },
    null,
    2,
  ),
);
