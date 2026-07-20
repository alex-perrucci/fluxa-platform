import crypto from 'node:crypto';

try {
  process.loadEnvFile('.env');
} catch {
  /* host environment may already be configured */
}

const baseUrl =
  process.env.BLOCK06_SMOKE_BASE_URL?.replace(/\/$/, '') ??
  'http://127.0.0.1:3599/api/v1';
const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!email || !password)
  throw new Error(
    'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required.',
  );

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok)
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`,
    );
  return payload;
}

async function expectHttp(path, status, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status !== status)
    throw new Error(
      `${options.method ?? 'GET'} ${path} should return ${status}, received ${response.status}: ${await response.text()}`,
    );
}

const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const uuid = () => crypto.randomUUID();
const login = await request('/auth/login', {
  method: 'POST',
  body: {
    email,
    password,
    device: {
      installationId: `block06-${suffix}`,
      name: 'Fluxa Block 06 Smoke',
      platform: 'WINDOWS',
      model: 'PowerShell',
      appVersion: '0.6.0',
    },
  },
});
let accessToken = login.tokens.accessToken;
let refreshToken = login.tokens.refreshToken;
const organization = await request('/organizations', {
  method: 'POST',
  token: accessToken,
  body: {
    name: `Fluxa Hospitality ${suffix}`,
    slug: `fluxa-hospitality-${suffix}`.toLowerCase(),
  },
});
const organizationId = organization.organization.id;
const switched = await request('/auth/switch-organization', {
  method: 'POST',
  token: accessToken,
  body: { organizationId, refreshToken },
});
accessToken = switched.tokens.accessToken;
refreshToken = switched.tokens.refreshToken;

const merchant = await request('/merchants', {
  method: 'POST',
  token: accessToken,
  body: {
    legalName: `Fluxa Hospitality ${suffix} S.r.l.`,
    tradeName: 'Fluxa Hospitality',
    vatNumber: `IT${Date.now().toString().slice(-11).padStart(11, '0')}`,
    countryCode: 'IT',
  },
});
const location = await request('/locations', {
  method: 'POST',
  token: accessToken,
  body: {
    merchantId: merchant.id,
    code: `HOS${Date.now().toString().slice(-6)}`,
    name: 'Hospitality Smoke',
    addressLine1: 'Via Test 6',
    postalCode: '43121',
    city: 'Parma',
    province: 'PR',
    countryCode: 'IT',
    timezone: 'Europe/Rome',
  },
});
const vat = await request('/vat-rates', {
  method: 'POST',
  token: accessToken,
  body: {
    code: 'IVA10',
    name: 'IVA 10%',
    rateBasisPoints: 1000,
    isDefault: true,
  },
});
const category = await request('/categories', {
  method: 'POST',
  token: accessToken,
  body: { code: 'CUCINA', name: 'Cucina', sortOrder: 10 },
});
const product = await request('/products', {
  method: 'POST',
  token: accessToken,
  body: {
    categoryId: category.id,
    vatRateId: vat.id,
    code: 'PANINO',
    sku: `PANINO-${suffix}`,
    name: 'Panino smoke',
    unit: 'EACH',
    quantityScale: 0,
  },
});
await request(`/products/${product.id}/locations/${location.id}`, {
  method: 'PUT',
  token: accessToken,
  body: { enabled: true, sortOrder: 10 },
});
const priceList = await request('/price-lists', {
  method: 'POST',
  token: accessToken,
  body: {
    code: 'DEFAULT',
    name: 'Listino principale',
    currency: 'EUR',
    priority: 100,
  },
});
await request(`/price-lists/${priceList.id}/locations`, {
  method: 'PUT',
  token: accessToken,
  body: { locationId: location.id, priority: 100, active: true },
});
await request(`/price-lists/${priceList.id}/prices`, {
  method: 'PUT',
  token: accessToken,
  body: { productId: product.id, amountCents: 900 },
});

const area = await request(`/dining-areas/${location.id}`, {
  method: 'POST',
  token: accessToken,
  body: { code: 'SALA', name: 'Sala principale', sortOrder: 10 },
});
const table1 = await request('/dining-tables', {
  method: 'POST',
  token: accessToken,
  body: {
    locationId: location.id,
    areaId: area.id,
    code: 'T01',
    name: 'Tavolo 1',
    capacity: 4,
    sortOrder: 10,
  },
});
const table2 = await request('/dining-tables', {
  method: 'POST',
  token: accessToken,
  body: {
    locationId: location.id,
    areaId: area.id,
    code: 'T02',
    name: 'Tavolo 2',
    capacity: 4,
    sortOrder: 20,
  },
});
const station = await request('/kitchen-stations', {
  method: 'POST',
  token: accessToken,
  body: {
    locationId: location.id,
    code: 'HOT',
    name: 'Cucina calda',
    sortOrder: 10,
  },
});
await request(`/kitchen-stations/${station.id}/categories/${category.id}`, {
  method: 'PUT',
  token: accessToken,
});

let session = await request('/table-sessions', {
  method: 'POST',
  token: accessToken,
  body: {
    clientSessionId: uuid(),
    tableId: table1.id,
    guestCount: 2,
    note: 'Smoke session',
  },
});
const duplicateFloor = await request(`/floor?locationId=${location.id}`, {
  token: accessToken,
});
if (
  !duplicateFloor.areas
    .flatMap((item) => item.tables)
    .find((item) => item.id === table1.id)?.occupied
)
  throw new Error('Opened table is not occupied on floor view.');
session = await request(`/table-sessions/${session.id}/move`, {
  method: 'POST',
  token: accessToken,
  body: {
    mutationId: uuid(),
    expectedVersion: session.version,
    tableId: table2.id,
  },
});
if (session.table.code !== 'T02') throw new Error('Table move failed.');

let order = await request('/orders', {
  method: 'POST',
  token: accessToken,
  body: {
    clientOrderId: uuid(),
    locationId: location.id,
    serviceMode: 'TABLE',
    customerNote: null,
  },
});
session = await request(`/table-sessions/${session.id}/orders`, {
  method: 'POST',
  token: accessToken,
  body: {
    mutationId: uuid(),
    expectedVersion: session.version,
    orderId: order.id,
  },
});
order = await request(`/orders/${order.id}/items`, {
  method: 'POST',
  token: accessToken,
  body: {
    mutationId: uuid(),
    expectedVersion: order.version,
    clientItemId: uuid(),
    productId: product.id,
    quantityAmount: 2,
    note: 'Ben cotto',
  },
});
const orderItem = order.items[0];

const batchBody = { clientBatchId: uuid() };
const batch = await request(`/orders/${order.id}/kitchen-tickets`, {
  method: 'POST',
  token: accessToken,
  body: batchBody,
});
const batchRetry = await request(`/orders/${order.id}/kitchen-tickets`, {
  method: 'POST',
  token: accessToken,
  body: batchBody,
});
if (batch.id !== batchRetry.id || batch.tickets.length !== 1)
  throw new Error('Kitchen dispatch idempotency failed.');
let ticket = batch.tickets[0];
const ticketDetails = await request(`/kitchen-tickets/${ticket.id}`, {
  token: accessToken,
});
if (
  ticketDetails.tableCodeSnapshot !== 'T02' ||
  ticketDetails.items[0]?.quantityAmount !== 2
)
  throw new Error('Kitchen ticket snapshot is incomplete.');

await expectHttp(`/orders/${order.id}/items/${orderItem.id}`, 409, {
  method: 'PATCH',
  token: accessToken,
  body: {
    mutationId: uuid(),
    expectedVersion: order.version,
    quantityAmount: 1,
  },
});
ticket = await request(`/kitchen-tickets/${ticket.id}/start`, {
  method: 'POST',
  token: accessToken,
  body: { mutationId: uuid(), expectedVersion: ticket.version },
});
ticket = await request(`/kitchen-tickets/${ticket.id}/ready`, {
  method: 'POST',
  token: accessToken,
  body: { mutationId: uuid(), expectedVersion: ticket.version },
});
ticket = await request(`/kitchen-tickets/${ticket.id}/serve`, {
  method: 'POST',
  token: accessToken,
  body: { mutationId: uuid(), expectedVersion: ticket.version },
});
if (ticket.status !== 'SERVED') throw new Error('Kitchen lifecycle failed.');

const checkout = await request('/checkouts', {
  method: 'POST',
  token: accessToken,
  body: {
    clientCheckoutId: uuid(),
    orderId: order.id,
    expectedOrderVersion: order.version,
  },
});
const paid = await request(`/checkouts/${checkout.id}/payments`, {
  method: 'POST',
  token: accessToken,
  body: {
    clientPaymentId: uuid(),
    method: 'CASH',
    provider: 'CASH',
    amountCents: order.totalCents,
    tenderedCents: order.totalCents,
  },
});
if (paid.checkout.status !== 'COMPLETED')
  throw new Error('Checkout did not complete.');
session = await request(`/table-sessions/${session.id}/close`, {
  method: 'POST',
  token: accessToken,
  body: {
    mutationId: uuid(),
    expectedVersion: session.version,
    reason: 'Smoke completed',
  },
});
if (session.status !== 'CLOSED')
  throw new Error('Table session did not close.');
const finalFloor = await request(`/floor?locationId=${location.id}`, {
  token: accessToken,
});
if (
  finalFloor.areas
    .flatMap((item) => item.tables)
    .find((item) => item.id === table2.id)?.occupied
)
  throw new Error('Closed table remains occupied.');

const secondOrganization = await request('/organizations', {
  method: 'POST',
  token: accessToken,
  body: {
    name: `Fluxa Hospitality Isolation ${suffix}`,
    slug: `fluxa-hospitality-isolation-${suffix}`.toLowerCase(),
  },
});
const switchedSecond = await request('/auth/switch-organization', {
  method: 'POST',
  token: accessToken,
  body: { organizationId: secondOrganization.organization.id, refreshToken },
});
await expectHttp(`/table-sessions/${session.id}`, 404, {
  token: switchedSecond.tokens.accessToken,
});

console.log(
  JSON.stringify({
    status: 'ok',
    organizationId,
    locationId: location.id,
    tableSessionId: session.id,
    orderId: order.id,
    kitchenTicketId: ticket.id,
    crossTenantIsolation: true,
  }),
);
