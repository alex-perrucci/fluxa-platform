import crypto from 'node:crypto';

try {
  process.loadEnvFile('.env');
} catch {
  /* host environment may already be configured */
}

const baseUrl =
  process.env.BLOCK08_SMOKE_BASE_URL?.replace(/\/$/, '') ??
  'http://127.0.0.1:3699/api/v1';
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

async function expectHttp(path, status, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status !== status) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} should return ${status}, received ${response.status}: ${await response.text()}`,
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
      installationId: `block07-${suffix}`,
      name: 'Fluxa Block 07 Print Agent',
      platform: 'WINDOWS',
      model: 'PowerShell',
      appVersion: '0.7.0',
    },
  },
});
let accessToken = login.tokens.accessToken;
let refreshToken = login.tokens.refreshToken;
const device = await request('/devices/me', { token: accessToken });

const organization = await request('/organizations', {
  method: 'POST',
  token: accessToken,
  body: {
    name: `Fluxa Printing ${suffix}`,
    slug: `fluxa-printing-${suffix}`.toLowerCase(),
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
    legalName: `Fluxa Printing ${suffix} S.r.l.`,
    tradeName: 'Fluxa Printing',
    vatNumber: `IT${Date.now().toString().slice(-11).padStart(11, '0')}`,
    countryCode: 'IT',
  },
});
const location = await request('/locations', {
  method: 'POST',
  token: accessToken,
  body: {
    merchantId: merchant.id,
    code: `PRN${Date.now().toString().slice(-6)}`,
    name: 'Printing Smoke',
    addressLine1: 'Via Test 7',
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
    name: 'Panino stampa',
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

const kitchenPrinter = await request('/printers', {
  method: 'POST',
  token: accessToken,
  body: {
    locationId: location.id,
    code: 'KITCHEN',
    name: 'Stampante cucina',
    purpose: 'KITCHEN',
    agentDeviceId: device.id,
    paperWidthMm: 80,
    charactersPerLine: 48,
  },
});
const receiptPrinter = await request('/printers', {
  method: 'POST',
  token: accessToken,
  body: {
    locationId: location.id,
    code: 'RECEIPT',
    name: 'Stampante ricevute',
    purpose: 'RECEIPT',
    agentDeviceId: device.id,
    paperWidthMm: 80,
    charactersPerLine: 48,
  },
});

await request('/print-routes', {
  method: 'PUT',
  token: accessToken,
  body: {
    locationId: location.id,
    documentType: 'KITCHEN_TICKET',
    kitchenStationId: station.id,
    printerId: kitchenPrinter.id,
    copies: 1,
    active: true,
  },
});
for (const documentType of ['ORDER_RECEIPT', 'PAYMENT_RECEIPT']) {
  await request('/print-routes', {
    method: 'PUT',
    token: accessToken,
    body: {
      locationId: location.id,
      documentType,
      printerId: receiptPrinter.id,
      copies: 1,
      active: true,
    },
  });
}

await request(`/printers/${kitchenPrinter.id}/heartbeat`, {
  method: 'POST',
  token: accessToken,
  body: { agentVersion: 'smoke-0.7.0', statusMessage: 'online' },
});

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
    quantityAmount: 2,
    note: 'Ben cotto',
  },
});
const batch = await request(`/orders/${order.id}/kitchen-tickets`, {
  method: 'POST',
  token: accessToken,
  body: { clientBatchId: uuid() },
});
const kitchenTicket = batch.tickets[0];

const queued = await request(
  `/print-jobs?locationId=${location.id}&status=QUEUED`,
  { token: accessToken },
);
const automaticKitchenJob = queued.items.find(
  (item) =>
    item.documentType === 'KITCHEN_TICKET' &&
    item.sourceEntityId === kitchenTicket.id,
);
if (!automaticKitchenJob) {
  throw new Error('Automatic kitchen print job was not created.');
}

let claim = await request('/print-agent/jobs/claim', {
  method: 'POST',
  token: accessToken,
  body: { printerId: kitchenPrinter.id, leaseSeconds: 60 },
});
if (
  claim.job?.id !== automaticKitchenJob.id ||
  !claim.job.renderedText.includes('COMANDA CUCINA')
) {
  throw new Error('Kitchen print claim failed.');
}
let completed = await request(`/print-agent/jobs/${claim.job.id}/complete`, {
  method: 'POST',
  token: accessToken,
  body: { leaseToken: claim.job.leaseToken },
});
if (completed.status !== 'COMPLETED') {
  throw new Error('Kitchen print completion failed.');
}
completed = await request(`/print-agent/jobs/${claim.job.id}/complete`, {
  method: 'POST',
  token: accessToken,
  body: { leaseToken: claim.job.leaseToken },
});
if (completed.status !== 'COMPLETED') {
  throw new Error('Print completion is not idempotent.');
}

const receiptRequest = { clientRequestId: uuid(), copies: 1 };
const orderPrint = await request(`/orders/${order.id}/print-receipt`, {
  method: 'POST',
  token: accessToken,
  body: receiptRequest,
});
const orderPrintRetry = await request(`/orders/${order.id}/print-receipt`, {
  method: 'POST',
  token: accessToken,
  body: receiptRequest,
});
if (orderPrint.jobs[0]?.id !== orderPrintRetry.jobs[0]?.id) {
  throw new Error('Print request idempotency failed.');
}

claim = await request('/print-agent/jobs/claim', {
  method: 'POST',
  token: accessToken,
  body: { printerId: receiptPrinter.id, leaseSeconds: 60 },
});
let failed = await request(`/print-agent/jobs/${claim.job.id}/fail`, {
  method: 'POST',
  token: accessToken,
  body: {
    leaseToken: claim.job.leaseToken,
    error: 'Smoke paper out',
    retryable: false,
  },
});
if (failed.status !== 'FAILED') {
  throw new Error('Non-retryable print failure did not become FAILED.');
}
failed = await request(`/print-jobs/${failed.id}/retry`, {
  method: 'POST',
  token: accessToken,
  body: { mutationId: uuid(), expectedVersion: failed.version },
});
if (failed.status !== 'QUEUED') {
  throw new Error('Manual print retry failed.');
}
claim = await request('/print-agent/jobs/claim', {
  method: 'POST',
  token: accessToken,
  body: { printerId: receiptPrinter.id, leaseSeconds: 60 },
});
await request(`/print-agent/jobs/${claim.job.id}/complete`, {
  method: 'POST',
  token: accessToken,
  body: { leaseToken: claim.job.leaseToken },
});

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
if (paid.checkout.status !== 'COMPLETED') {
  throw new Error('Checkout did not complete.');
}
const paymentPrint = await request(`/checkouts/${checkout.id}/print-receipt`, {
  method: 'POST',
  token: accessToken,
  body: { clientRequestId: uuid() },
});
if (paymentPrint.jobs.length !== 1) {
  throw new Error('Payment receipt job was not created.');
}

const testPrint = await request(`/printers/${receiptPrinter.id}/test`, {
  method: 'POST',
  token: accessToken,
  body: { clientRequestId: uuid() },
});
if (testPrint.jobs.length !== 1) {
  throw new Error('Test print job was not created.');
}

const fiscalProfile = await request(`/fiscal-profiles/${location.id}`, {
  method: 'PUT',
  token: accessToken,
  body: {
    provider: 'MOCK',
    environment: 'SANDBOX',
    fiscalId: '12345678901',
    enabled: true,
    autoIssueOnPaid: false,
    displayName: 'Fluxa Smoke Fiscal',
  },
});
if (!fiscalProfile.enabled || fiscalProfile.provider !== 'MOCK') {
  throw new Error('Fiscal profile setup failed.');
}

const fiscalRequest = { clientRequestId: uuid() };
let fiscalDocument = await request(`/orders/${order.id}/fiscalize`, {
  method: 'POST',
  token: accessToken,
  body: fiscalRequest,
});
const fiscalDuplicate = await request(`/orders/${order.id}/fiscalize`, {
  method: 'POST',
  token: accessToken,
  body: fiscalRequest,
});
if (fiscalDocument.id !== fiscalDuplicate.id) {
  throw new Error('Fiscal issue idempotency failed.');
}
for (let attempt = 0; attempt < 30; attempt += 1) {
  fiscalDocument = await request(`/fiscal-documents/${fiscalDocument.id}`, {
    token: accessToken,
  });
  if (['ISSUED', 'REJECTED'].includes(fiscalDocument.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (
  fiscalDocument.status !== 'ISSUED' ||
  !fiscalDocument.externalId ||
  !fiscalDocument.documentNumber
) {
  throw new Error(
    `Fiscal document was not issued: ${JSON.stringify(fiscalDocument)}`,
  );
}

let voidDocument = await request(
  `/fiscal-documents/${fiscalDocument.id}/void`,
  {
    method: 'POST',
    token: accessToken,
    body: {
      mutationId: uuid(),
      expectedVersion: fiscalDocument.version,
      reason: 'Smoke annullamento',
    },
  },
);
for (let attempt = 0; attempt < 30; attempt += 1) {
  voidDocument = await request(`/fiscal-documents/${voidDocument.id}`, {
    token: accessToken,
  });
  if (['VOIDED', 'REJECTED'].includes(voidDocument.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (voidDocument.status !== 'VOIDED') {
  throw new Error(
    `Fiscal void was not completed: ${JSON.stringify(voidDocument)}`,
  );
}

const secondOrganization = await request('/organizations', {
  method: 'POST',
  token: accessToken,
  body: {
    name: `Fluxa Printing Isolation ${suffix}`,
    slug: `fluxa-printing-isolation-${suffix}`.toLowerCase(),
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
await expectHttp(`/print-jobs/${automaticKitchenJob.id}`, 404, {
  token: switchedSecond.tokens.accessToken,
});

console.log(
  JSON.stringify({
    status: 'ok',
    fiscalDocumentId: fiscalDocument.id,
    fiscalVoidDocumentId: voidDocument.id,
    organizationId,
    locationId: location.id,
    kitchenPrinterId: kitchenPrinter.id,
    receiptPrinterId: receiptPrinter.id,
    automaticKitchenJobId: automaticKitchenJob.id,
    orderReceiptJobId: orderPrint.jobs[0].id,
    paymentReceiptJobId: paymentPrint.jobs[0].id,
    testPrintJobId: testPrint.jobs[0].id,
    crossTenantIsolation: true,
  }),
);
