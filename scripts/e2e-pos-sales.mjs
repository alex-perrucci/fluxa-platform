import { randomUUID } from 'node:crypto';
import process from 'node:process';

const apiBase = (
  process.env.FLUXA_API_BASE_URL || 'http://127.0.0.1:3000/api/v1'
).replace(/\/+$/, '');
const apiUrl = new URL(apiBase);
const allowRemote = process.argv.includes('--allow-remote');

if (
  !allowRemote &&
  !new Set(['127.0.0.1', 'localhost', '::1']).has(apiUrl.hostname)
) {
  throw new Error(
    'POS sales E2E creates data and refuses a remote API. Use --allow-remote only on an isolated environment.',
  );
}

const adminEmail = process.env.FLUXA_E2E_ADMIN_EMAIL?.trim() ?? '';
const adminPassword = process.env.FLUXA_E2E_ADMIN_PASSWORD ?? '';
if (!adminEmail || !adminPassword) {
  throw new Error(
    'FLUXA_E2E_ADMIN_EMAIL and FLUXA_E2E_ADMIN_PASSWORD are required.',
  );
}

async function rawRequest(pathname, { method = 'GET', token, body } = {}) {
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
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { response, payload };
}

async function request(pathname, options = {}) {
  const result = await rawRequest(pathname, options);
  if (!result.response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${pathname} failed with HTTP ${result.response.status}: ${String(
        typeof result.payload === 'string'
          ? result.payload
          : JSON.stringify(result.payload),
      ).slice(0, 1000)}`,
    );
  }
  return result.payload;
}

async function expectFailure(pathname, expectedStatus, options = {}) {
  const result = await rawRequest(pathname, options);
  if (result.response.status !== expectedStatus) {
    throw new Error(
      `${options.method ?? 'GET'} ${pathname} should return HTTP ${expectedStatus}, received ${result.response.status}: ${JSON.stringify(result.payload)}`,
    );
  }
  return result.payload;
}

async function concurrentSame(count, operation, identity) {
  const results = await Promise.all(
    Array.from({ length: count }, () => operation()),
  );
  const ids = results.map(identity);
  if (!ids[0] || ids.some((id) => id !== ids[0])) {
    throw new Error(`Concurrent idempotency failed: ${JSON.stringify(ids)}`);
  }
  return results[0];
}

async function poll(pathname, token, terminalStatuses, attempts = 60) {
  let value = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    value = await request(pathname, { token });
    if (terminalStatuses.includes(value?.status)) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Polling ${pathname} did not reach ${terminalStatuses.join(', ')}: ${JSON.stringify(value)}`,
  );
}

async function login(email, password, organizationId) {
  return request('/auth/login', {
    method: 'POST',
    body: {
      email,
      password,
      ...(organizationId ? { organizationId } : {}),
      device: {
        installationId: `pos-sales-e2e-${randomUUID()}`,
        name: 'Fluxa POS sales E2E',
        platform: 'OTHER',
        model: 'GitHub Actions',
        appVersion: '0.8.0',
      },
    },
  });
}

const suffix = `${Date.now().toString(36)}${randomUUID()
  .replaceAll('-', '')
  .slice(0, 8)}`.toLowerCase();
const ownerEmail = `pos-sales+${suffix}@example.com`;
const ownerPassword = `Fluxa_POS_${suffix}_Pwd!`;
const uuid = () => randomUUID();

console.log('1/11 platform administrator login and tenant onboarding');
const adminLogin = await login(adminEmail, adminPassword);
const adminToken = adminLogin?.tokens?.accessToken;
if (!adminToken || !adminLogin?.user?.platformAdmin) {
  throw new Error('Platform administrator login did not return admin access.');
}

const onboarding = await request('/platform/onboarding', {
  method: 'POST',
  token: adminToken,
  body: {
    organizationName: `Fluxa POS Sales ${suffix}`,
    organizationSlug: `fluxa-pos-sales-${suffix}`.slice(0, 78),
    ownerEmail,
    ownerDisplayName: 'Fluxa POS Sales Owner',
    ownerTemporaryPassword: ownerPassword,
    legalName: `Fluxa POS Sales ${suffix} Srl`,
    tradeName: `Fluxa POS Sales ${suffix}`,
    vatNumber: `PS${suffix}`.replace(/[^a-z0-9]/gi, '').slice(0, 20),
    countryCode: 'IT',
    locationCode: 'MAIN',
    locationName: 'POS Sales E2E',
    addressLine1: 'Via Test 8',
    postalCode: '43121',
    city: 'Parma',
    province: 'PR',
    timezone: 'Europe/Rome',
    areaCode: 'SALA',
    areaName: 'Sala E2E',
    tables: [{ code: 'T1', name: 'Tavolo E2E', capacity: 4 }],
  },
});
const organizationId = onboarding?.organization?.id;
const locationId = onboarding?.location?.id;
if (!organizationId || !locationId) {
  throw new Error('Onboarding response is incomplete.');
}

const ownerLogin = await login(ownerEmail, ownerPassword, organizationId);
const token = ownerLogin?.tokens?.accessToken;
if (!token || ownerLogin?.organization?.role !== 'OWNER') {
  throw new Error('Owner login did not select the new organization.');
}

console.log('2/11 catalog, kitchen and fiscal configuration');
const vat = await request('/vat-rates', {
  method: 'POST',
  token,
  body: {
    code: `IVA10-${suffix}`.slice(0, 40).toUpperCase(),
    name: 'IVA 10%',
    rateBasisPoints: 1000,
    isDefault: true,
  },
});
const category = await request('/categories', {
  method: 'POST',
  token,
  body: {
    code: `FOOD-${suffix}`.slice(0, 40).toUpperCase(),
    name: 'Cucina E2E',
    sortOrder: 10,
  },
});
const product = await request('/products', {
  method: 'POST',
  token,
  body: {
    categoryId: category.id,
    vatRateId: vat.id,
    code: `PANINO-${suffix}`.slice(0, 50).toUpperCase(),
    sku: `PANINO-${suffix}`.slice(0, 80).toUpperCase(),
    name: 'Panino POS E2E',
    unit: 'EACH',
    quantityScale: 0,
  },
});
await request(`/products/${product.id}/locations/${locationId}`, {
  method: 'PUT',
  token,
  body: { enabled: true, sortOrder: 10 },
});
const priceList = await request('/price-lists', {
  method: 'POST',
  token,
  body: {
    code: `DEFAULT-${suffix}`.slice(0, 40).toUpperCase(),
    name: 'Listino POS E2E',
    currency: 'EUR',
    priority: 100,
  },
});
await request(`/price-lists/${priceList.id}/locations`, {
  method: 'PUT',
  token,
  body: { locationId, priority: 100, active: true },
});
await request(`/price-lists/${priceList.id}/prices`, {
  method: 'PUT',
  token,
  body: { productId: product.id, amountCents: 1250 },
});
const station = await request('/kitchen-stations', {
  method: 'POST',
  token,
  body: {
    locationId,
    code: `HOT-${suffix}`.slice(0, 40).toUpperCase(),
    name: 'Cucina calda E2E',
    sortOrder: 10,
  },
});
await request(`/kitchen-stations/${station.id}/categories/${category.id}`, {
  method: 'PUT',
  token,
});
await request(
  `/platform/organizations/${organizationId}/locations/${locationId}/fiscal-profile`,
  {
    method: 'PUT',
    token: adminToken,
    body: {
      provider: 'MOCK',
      environment: 'SANDBOX',
      fiscalId: '12345678901',
      enabled: true,
      autoIssueOnPaid: false,
      displayName: 'Fluxa POS E2E Fiscal',
    },
  },
);

console.log('3/11 effective catalog');
const catalog = await request(
  `/catalog?locationId=${encodeURIComponent(locationId)}`,
  { token },
);
const catalogProduct = catalog.categories
  .flatMap((item) => item.products)
  .find((item) => item.id === product.id);
if (catalogProduct?.price?.amountCents !== 1250) {
  throw new Error('Effective catalog did not resolve the configured product.');
}

console.log('4/11 concurrent idempotent order opening');
const clientOrderId = uuid();
let order = await concurrentSame(
  4,
  () =>
    request('/orders', {
      method: 'POST',
      token,
      body: {
        clientOrderId,
        locationId,
        serviceMode: 'COUNTER',
        customerNote: 'POS sales E2E',
      },
    }),
  (value) => value?.id,
);

console.log('5/11 concurrent idempotent line addition');
const addBody = {
  mutationId: uuid(),
  clientItemId: uuid(),
  expectedVersion: order.version,
  productId: product.id,
  quantityAmount: 2,
  note: 'E2E concorrente',
};
order = await concurrentSame(
  4,
  () =>
    request(`/orders/${order.id}/items`, {
      method: 'POST',
      token,
      body: addBody,
    }),
  (value) => value?.items?.[0]?.id,
);
if (order.items.length !== 1 || order.totalCents !== 2500) {
  throw new Error('Concurrent line addition produced duplicate rows or totals.');
}

console.log('6/11 concurrent kitchen dispatch');
const clientBatchId = uuid();
const kitchenBatch = await concurrentSame(
  4,
  () =>
    request(`/orders/${order.id}/kitchen-tickets`, {
      method: 'POST',
      token,
      body: { clientBatchId },
    }),
  (value) => value?.id,
);
if (kitchenBatch.tickets?.length !== 1) {
  throw new Error('Kitchen dispatch did not create exactly one ticket.');
}

console.log('7/11 concurrent checkout and payment');
const clientCheckoutId = uuid();
const checkout = await concurrentSame(
  4,
  () =>
    request('/checkouts', {
      method: 'POST',
      token,
      body: {
        clientCheckoutId,
        orderId: order.id,
        expectedOrderVersion: order.version,
      },
    }),
  (value) => value?.id,
);
const clientPaymentId = uuid();
const paymentResponse = await concurrentSame(
  4,
  () =>
    request(`/checkouts/${checkout.id}/payments`, {
      method: 'POST',
      token,
      body: {
        clientPaymentId,
        method: 'CARD',
        provider: 'MANUAL_TERMINAL',
        amountCents: order.totalCents,
      },
    }),
  (value) => value?.payment?.id,
);
const paymentId = paymentResponse.payment.id;
const captureBody = {
  mutationId: uuid(),
  providerReference: `terminal-${suffix}`,
  providerEventId: `terminal-event-${suffix}`,
};
const captured = await concurrentSame(
  4,
  () =>
    request(`/payments/${paymentId}/capture`, {
      method: 'POST',
      token,
      body: captureBody,
    }),
  (value) => value?.payment?.id,
);
if (
  captured.payment.status !== 'CAPTURED' ||
  captured.checkout.status !== 'COMPLETED'
) {
  throw new Error('Payment did not complete the checkout.');
}

console.log('8/11 paid order closure and immutability');
const paidOrder = await request(`/orders/${order.id}`, { token });
if (paidOrder.status !== 'PAID') {
  throw new Error(`Expected PAID order, received ${paidOrder.status}.`);
}
const immutable = await expectFailure(`/orders/${order.id}/items`, 409, {
  method: 'POST',
  token,
  body: {
    mutationId: uuid(),
    clientItemId: uuid(),
    expectedVersion: paidOrder.version,
    productId: product.id,
    quantityAmount: 1,
  },
});
if (immutable?.code !== 'ORDER_NOT_MUTABLE') {
  throw new Error('Paid order remained mutable.');
}

console.log('9/11 concurrent fiscal job and worker execution');
const fiscalRequest = { clientRequestId: uuid() };
let fiscalDocument = await concurrentSame(
  4,
  () =>
    request(`/orders/${order.id}/fiscalize`, {
      method: 'POST',
      token,
      body: fiscalRequest,
    }),
  (value) => value?.id,
);
fiscalDocument = await poll(
  `/fiscal-documents/${fiscalDocument.id}`,
  token,
  ['ISSUED', 'REJECTED'],
);
if (
  fiscalDocument.status !== 'ISSUED' ||
  !fiscalDocument.externalId ||
  !fiscalDocument.documentNumber
) {
  throw new Error(
    `Fiscal worker did not issue the document: ${JSON.stringify(fiscalDocument)}`,
  );
}

console.log('10/11 concurrent idempotent refund');
const refundBody = {
  clientRefundId: uuid(),
  amountCents: paidOrder.totalCents,
  reason: 'POS sales E2E refund',
  providerReference: `refund-${suffix}`,
  providerEventId: `refund-event-${suffix}`,
};
const refundResponse = await concurrentSame(
  4,
  () =>
    request(`/payments/${paymentId}/refunds`, {
      method: 'POST',
      token,
      body: refundBody,
    }),
  (value) => value?.refund?.id,
);
if (
  refundResponse.refund.status !== 'SUCCEEDED' ||
  refundResponse.quote.refundableCents !== 0
) {
  throw new Error('Refund did not complete or was duplicated.');
}
const refunds = await request(`/payments/${paymentId}/refunds`, { token });
if (refunds.length !== 1 || refunds[0].id !== refundResponse.refund.id) {
  throw new Error('Concurrent refund created more than one persisted refund.');
}

console.log('11/11 final assertions');
const finalPayment = await request(`/payments/${paymentId}`, { token });
if (finalPayment.status !== 'REFUNDED') {
  throw new Error(`Expected REFUNDED payment, received ${finalPayment.status}.`);
}

console.log(
  JSON.stringify(
    {
      status: 'passed',
      organizationId,
      locationId,
      productId: product.id,
      orderId: order.id,
      kitchenBatchId: kitchenBatch.id,
      kitchenTicketId: kitchenBatch.tickets[0].id,
      checkoutId: checkout.id,
      paymentId,
      fiscalDocumentId: fiscalDocument.id,
      refundId: refundResponse.refund.id,
      concurrentAttempts: 4,
      idempotency: true,
      postgres: 'real',
      redis: 'real',
    },
    null,
    2,
  ),
);