import crypto from 'node:crypto';

try {
  process.loadEnvFile('.env');
} catch {
  // Environment variables may already be provided by the host.
}

const baseUrl =
  process.env.BLOCK04_SMOKE_BASE_URL?.replace(/\/$/, '') ??
  'http://127.0.0.1:3399/api/v1';
const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error(
    'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required.',
  );
}

async function rawRequest(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.token
        ? { authorization: `Bearer ${options.token}` }
        : {}),
      ...options.headers,
    },
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
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

  return { response, payload };
}

async function request(path, options = {}) {
  const result = await rawRequest(path, options);

  if (!result.response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed with HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`,
    );
  }

  return result.payload;
}

async function expectFailure(path, expectedStatus, options = {}) {
  const result = await rawRequest(path, options);

  if (result.response.status !== expectedStatus) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} should return HTTP ${expectedStatus}, received ${result.response.status}: ${JSON.stringify(result.payload)}`,
    );
  }

  return result.payload;
}

const id = () => crypto.randomUUID();
const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

const login = await request('/auth/login', {
  method: 'POST',
  body: {
    email,
    password,
    device: {
      installationId: `block04-smoke-${suffix}`,
      name: 'Fluxa Block 04 Smoke',
      platform: 'WINDOWS',
      model: 'PowerShell',
      appVersion: '0.4.0',
    },
  },
});

let accessToken = login.tokens.accessToken;
let refreshToken = login.tokens.refreshToken;

const createdOrganization = await request('/organizations', {
  method: 'POST',
  token: accessToken,
  body: {
    name: `Fluxa Orders Smoke ${suffix}`,
    slug: `fluxa-orders-${suffix}`.toLowerCase(),
  },
});
const organizationId = createdOrganization.organization.id;

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
    legalName: `Fluxa Orders ${suffix} S.r.l.`,
    tradeName: 'Fluxa Orders',
    vatNumber: `IT${Date.now().toString().slice(-11).padStart(11, '0')}`,
    countryCode: 'IT',
  },
});

const location = await request('/locations', {
  method: 'POST',
  token: accessToken,
  body: {
    merchantId: merchant.id,
    code: `ORD${Date.now().toString().slice(-6)}`,
    name: 'Orders Smoke Location',
    addressLine1: 'Via Test 4',
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
    code: `IVA10-${suffix}`.slice(0, 40).toUpperCase(),
    name: 'IVA 10%',
    rateBasisPoints: 1000,
    isDefault: true,
  },
});

const category = await request('/categories', {
  method: 'POST',
  token: accessToken,
  body: {
    code: `BEV-${suffix}`.slice(0, 40).toUpperCase(),
    name: 'Bevande',
    sortOrder: 10,
  },
});

const product = await request('/products', {
  method: 'POST',
  token: accessToken,
  body: {
    categoryId: category.id,
    vatRateId: vat.id,
    code: `CAFFE-${suffix}`.slice(0, 50).toUpperCase(),
    sku: `CAFFE-${suffix}`.slice(0, 80).toUpperCase(),
    name: 'Caffè espresso',
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
    code: `DEFAULT-${suffix}`.slice(0, 40).toUpperCase(),
    name: 'Listino principale',
    currency: 'EUR',
    priority: 100,
  },
});

await request(`/price-lists/${priceList.id}/locations`, {
  method: 'PUT',
  token: accessToken,
  body: {
    locationId: location.id,
    priority: 100,
    active: true,
  },
});

await request(`/price-lists/${priceList.id}/prices`, {
  method: 'PUT',
  token: accessToken,
  body: {
    productId: product.id,
    amountCents: 120,
  },
});

const clientOrderId = id();
const order = await request('/orders', {
  method: 'POST',
  token: accessToken,
  body: {
    clientOrderId,
    locationId: location.id,
    serviceMode: 'COUNTER',
    customerNote: 'Smoke order',
  },
});

const duplicateOrder = await request('/orders', {
  method: 'POST',
  token: accessToken,
  body: {
    clientOrderId,
    locationId: location.id,
    serviceMode: 'COUNTER',
    customerNote: 'Smoke order',
  },
});

if (order.id !== duplicateOrder.id || order.version !== 1) {
  throw new Error('Order creation idempotency failed.');
}

const addMutationId = id();
const clientItemId = id();
const afterAdd = await request(`/orders/${order.id}/items`, {
  method: 'POST',
  token: accessToken,
  body: {
    mutationId: addMutationId,
    clientItemId,
    expectedVersion: 1,
    productId: product.id,
    quantityAmount: 2,
    note: 'Ben caldo',
  },
});

if (
  afterAdd.version !== 2 ||
  afterAdd.items.length !== 1 ||
  afterAdd.subtotalCents !== 240 ||
  afterAdd.totalCents !== 240
) {
  throw new Error('Adding an order item produced incorrect totals.');
}

const duplicateAdd = await request(`/orders/${order.id}/items`, {
  method: 'POST',
  token: accessToken,
  body: {
    mutationId: addMutationId,
    clientItemId,
    expectedVersion: 1,
    productId: product.id,
    quantityAmount: 2,
    note: 'Ben caldo',
  },
});

if (duplicateAdd.version !== 2 || duplicateAdd.items.length !== 1) {
  throw new Error('Item mutation idempotency failed.');
}

const reusedMutation = await expectFailure(`/orders/${order.id}/items`, 409, {
  method: 'POST',
  token: accessToken,
  body: {
    mutationId: addMutationId,
    clientItemId,
    expectedVersion: 1,
    productId: product.id,
    quantityAmount: 3,
    note: 'Differente',
  },
});

if (reusedMutation?.code !== 'IDEMPOTENCY_KEY_REUSED') {
  throw new Error('Mutation reuse was not detected correctly.');
}

const itemId = afterAdd.items[0].id;
const updateMutationId = id();
const afterUpdate = await request(`/orders/${order.id}/items/${itemId}`, {
  method: 'PATCH',
  token: accessToken,
  body: {
    mutationId: updateMutationId,
    expectedVersion: 2,
    quantityAmount: 3,
  },
});

if (
  afterUpdate.version !== 3 ||
  afterUpdate.subtotalCents !== 360 ||
  afterUpdate.items[0].quantityAmount !== 3
) {
  throw new Error('Order item update failed.');
}

const duplicateUpdate = await request(
  `/orders/${order.id}/items/${itemId}`,
  {
    method: 'PATCH',
    token: accessToken,
    body: {
      mutationId: updateMutationId,
      expectedVersion: 2,
      quantityAmount: 3,
    },
  },
);

if (duplicateUpdate.version !== 3) {
  throw new Error('Update mutation idempotency failed.');
}

const adjustmentMutationId = id();
const adjustmentId = id();
const afterDiscount = await request(`/orders/${order.id}/adjustments`, {
  method: 'POST',
  token: accessToken,
  body: {
    mutationId: adjustmentMutationId,
    clientAdjustmentId: adjustmentId,
    expectedVersion: 3,
    type: 'PERCENTAGE',
    value: 1000,
    reason: 'Sconto smoke 10%',
  },
});

if (
  afterDiscount.version !== 4 ||
  afterDiscount.discountCents !== 36 ||
  afterDiscount.totalCents !== 324 ||
  afterDiscount.netTotalCents + afterDiscount.taxTotalCents !== 324
) {
  throw new Error('Discount or VAT reconciliation failed.');
}

const conflict = await expectFailure(
  `/orders/${order.id}/items/${itemId}`,
  409,
  {
    method: 'PATCH',
    token: accessToken,
    body: {
      mutationId: id(),
      expectedVersion: 3,
      quantityAmount: 4,
    },
  },
);

if (conflict?.code !== 'ORDER_VERSION_CONFLICT') {
  throw new Error('Optimistic concurrency conflict was not detected.');
}

const held = await request(`/orders/${order.id}/hold`, {
  method: 'POST',
  token: accessToken,
  body: { mutationId: id(), expectedVersion: 4 },
});

if (held.status !== 'HELD' || held.version !== 5) {
  throw new Error('Hold transition failed.');
}

const resumed = await request(`/orders/${order.id}/resume`, {
  method: 'POST',
  token: accessToken,
  body: { mutationId: id(), expectedVersion: 5 },
});

if (resumed.status !== 'OPEN' || resumed.version !== 6) {
  throw new Error('Resume transition failed.');
}

const cancelled = await request(`/orders/${order.id}/cancel`, {
  method: 'POST',
  token: accessToken,
  body: {
    mutationId: id(),
    expectedVersion: 6,
    reason: 'Annullamento smoke test',
  },
});

if (cancelled.status !== 'CANCELLED' || cancelled.version !== 7) {
  throw new Error('Cancel transition failed.');
}

const immutable = await expectFailure(`/orders/${order.id}/items`, 409, {
  method: 'POST',
  token: accessToken,
  body: {
    mutationId: id(),
    clientItemId: id(),
    expectedVersion: 7,
    productId: product.id,
    quantityAmount: 1,
  },
});

if (immutable?.code !== 'ORDER_NOT_MUTABLE') {
  throw new Error('Cancelled order remained mutable.');
}

const list = await request(
  `/orders?locationId=${encodeURIComponent(location.id)}&page=1&pageSize=10`,
  { token: accessToken },
);

if (!list.items.some((item) => item.id === order.id)) {
  throw new Error('Order list does not contain the created order.');
}

const secondOrganization = await request('/organizations', {
  method: 'POST',
  token: accessToken,
  body: {
    name: `Fluxa Orders Isolation ${suffix}`,
    slug: `fluxa-orders-isolation-${suffix}`.toLowerCase(),
  },
});

const switchedSecond = await request('/auth/switch-organization', {
  method: 'POST',
  token: accessToken,
  body: {
    organizationId: secondOrganization.organization.id,
    refreshToken,
  },
});

const crossTenant = await expectFailure(`/orders/${order.id}`, 404, {
  token: switchedSecond.tokens.accessToken,
});

if (crossTenant?.code !== 'ORDER_NOT_FOUND') {
  throw new Error('Cross-tenant order access was not hidden as 404.');
}

console.log(
  JSON.stringify({
    status: 'ok',
    organizationId,
    locationId: location.id,
    orderId: order.id,
    orderNumber: order.number,
    finalVersion: cancelled.version,
    finalTotalCents: cancelled.totalCents,
    idempotency: true,
    optimisticConcurrency: true,
    crossTenantIsolation: true,
  }),
);