import crypto from 'node:crypto';

try {
  process.loadEnvFile('.env');
} catch {
  // Environment variables may already be provided by the host.
}

const baseUrl =
  process.env.BLOCK05_SMOKE_BASE_URL?.replace(/\/$/, '') ??
  'http://127.0.0.1:3499/api/v1';
const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error(
    'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required.',
  );
}

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

  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

async function expectStatus(path, status, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

  if (response.status !== status) {
    const body = await response.text();
    throw new Error(
      `GET ${path} should return HTTP ${status}, received ${response.status}: ${body}`,
    );
  }
}

const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const uuid = () => crypto.randomUUID();
const login = await request('/auth/login', {
  method: 'POST',
  body: {
    email,
    password,
    device: {
      installationId: `block05-smoke-${suffix}`,
      name: 'Fluxa Block 05 Smoke',
      platform: 'WINDOWS',
      model: 'PowerShell',
      appVersion: '0.5.0',
    },
  },
});

let accessToken = login.tokens.accessToken;
let refreshToken = login.tokens.refreshToken;

const organization = await request('/organizations', {
  method: 'POST',
  token: accessToken,
  body: {
    name: `Fluxa Payments Smoke ${suffix}`,
    slug: `fluxa-payments-${suffix}`.toLowerCase(),
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
    legalName: `Fluxa Payments ${suffix} S.r.l.`,
    tradeName: 'Fluxa Payments Smoke',
    vatNumber: `IT${Date.now().toString().slice(-11).padStart(11, '0')}`,
    countryCode: 'IT',
  },
});
const location = await request('/locations', {
  method: 'POST',
  token: accessToken,
  body: {
    merchantId: merchant.id,
    code: `PAY${Date.now().toString().slice(-6)}`,
    name: 'Payments Smoke Location',
    addressLine1: 'Via Test 5',
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
  body: { code: 'BEVANDE', name: 'Bevande', sortOrder: 10 },
});
const product = await request('/products', {
  method: 'POST',
  token: accessToken,
  body: {
    categoryId: category.id,
    vatRateId: vat.id,
    code: 'CAFFE',
    sku: `CAFFE-${suffix}`,
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
  body: { productId: product.id, amountCents: 120 },
});

async function createPayableOrder() {
  let order = await request('/orders', {
    method: 'POST',
    token: accessToken,
    body: {
      clientOrderId: uuid(),
      locationId: location.id,
      serviceMode: 'COUNTER',
      customerNote: null,
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
      quantityAmount: 1,
    },
  });

  if (order.totalCents !== 120) {
    throw new Error(`Expected order total 120, received ${order.totalCents}.`);
  }

  return order;
}

const order = await createPayableOrder();
const checkout = await request('/checkouts', {
  method: 'POST',
  token: accessToken,
  body: {
    clientCheckoutId: uuid(),
    orderId: order.id,
    expectedOrderVersion: order.version,
  },
});

if (checkout.status !== 'OPEN' || checkout.remainingCents !== 120) {
  throw new Error('Checkout opening did not snapshot the order total.');
}

const cardBody = {
  clientPaymentId: uuid(),
  method: 'CARD',
  provider: 'MANUAL_TERMINAL',
  amountCents: 70,
};
const cardCreated = await request(`/checkouts/${checkout.id}/payments`, {
  method: 'POST',
  token: accessToken,
  body: cardBody,
});
const cardRetried = await request(`/checkouts/${checkout.id}/payments`, {
  method: 'POST',
  token: accessToken,
  body: cardBody,
});

if (
  cardCreated.payment.id !== cardRetried.payment.id ||
  cardCreated.payment.status !== 'PENDING'
) {
  throw new Error('Payment creation idempotency failed.');
}

const captureBody = {
  mutationId: uuid(),
  providerReference: `terminal-${suffix}`,
  providerEventId: `terminal-event-${suffix}`,
};
const cardCaptured = await request(
  `/payments/${cardCreated.payment.id}/capture`,
  {
    method: 'POST',
    token: accessToken,
    body: captureBody,
  },
);
const captureRetried = await request(
  `/payments/${cardCreated.payment.id}/capture`,
  {
    method: 'POST',
    token: accessToken,
    body: captureBody,
  },
);

if (
  cardCaptured.payment.status !== 'CAPTURED' ||
  captureRetried.payment.status !== 'CAPTURED' ||
  cardCaptured.checkout.paidCents !== 70 ||
  cardCaptured.checkout.remainingCents !== 50
) {
  throw new Error('Card capture or capture idempotency failed.');
}

const cash = await request(`/checkouts/${checkout.id}/payments`, {
  method: 'POST',
  token: accessToken,
  body: {
    clientPaymentId: uuid(),
    method: 'CASH',
    provider: 'CASH',
    amountCents: 50,
    tenderedCents: 100,
  },
});

if (
  cash.payment.status !== 'CAPTURED' ||
  cash.payment.changeCents !== 50 ||
  cash.checkout.status !== 'COMPLETED' ||
  cash.checkout.paidCents !== 120 ||
  cash.checkout.remainingCents !== 0 ||
  cash.checkout.changeCents !== 50
) {
  throw new Error('Mixed payment completion or cash change failed.');
}

const paidOrder = await request(`/orders/${order.id}`, { token: accessToken });
if (paidOrder.status !== 'PAID') {
  throw new Error(`Expected order PAID, received ${paidOrder.status}.`);
}

const cancellableOrder = await createPayableOrder();
const cancellableCheckout = await request('/checkouts', {
  method: 'POST',
  token: accessToken,
  body: {
    clientCheckoutId: uuid(),
    orderId: cancellableOrder.id,
    expectedOrderVersion: cancellableOrder.version,
  },
});
const pending = await request(`/checkouts/${cancellableCheckout.id}/payments`, {
  method: 'POST',
  token: accessToken,
  body: {
    clientPaymentId: uuid(),
    method: 'CARD',
    provider: 'EXTERNAL_TERMINAL',
    amountCents: 120,
  },
});
const cancelledCheckout = await request(
  `/checkouts/${cancellableCheckout.id}/cancel`,
  {
    method: 'POST',
    token: accessToken,
    body: { mutationId: uuid(), reason: 'Smoke checkout cancellation' },
  },
);
const cancelledPayment = cancelledCheckout.payments.find(
  (item) => item.id === pending.payment.id,
);
const reopenedOrder = await request(`/orders/${cancellableOrder.id}`, {
  token: accessToken,
});

if (
  cancelledCheckout.status !== 'CANCELLED' ||
  cancelledPayment?.status !== 'CANCELLED' ||
  reopenedOrder.status !== 'OPEN'
) {
  throw new Error('Checkout cancellation did not restore the order.');
}

const secondOrganization = await request('/organizations', {
  method: 'POST',
  token: accessToken,
  body: {
    name: `Fluxa Payments Isolation ${suffix}`,
    slug: `fluxa-payments-isolation-${suffix}`.toLowerCase(),
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
await expectStatus(
  `/checkouts/${checkout.id}`,
  404,
  switchedSecond.tokens.accessToken,
);

console.log(
  JSON.stringify({
    status: 'ok',
    organizationId,
    locationId: location.id,
    orderId: order.id,
    checkoutId: checkout.id,
    cardPaymentId: cardCreated.payment.id,
    cashPaymentId: cash.payment.id,
    mixedTender: true,
    cashChangeCents: 50,
    checkoutCancellation: true,
    crossTenantIsolation: true,
  }),
);
