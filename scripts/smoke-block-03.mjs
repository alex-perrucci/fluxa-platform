import crypto from 'node:crypto';

try {
  process.loadEnvFile('.env');
} catch {
  // Environment variables may already be provided by the host.
}

const baseUrl =
  process.env.BLOCK03_SMOKE_BASE_URL?.replace(/\/$/, '') ??
  'http://127.0.0.1:3299/api/v1';
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

  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const login = await request('/auth/login', {
  method: 'POST',
  body: {
    email,
    password,
    device: {
      installationId: `block03-smoke-${suffix}`,
      name: 'Fluxa Block 03 Smoke',
      platform: 'WINDOWS',
      model: 'PowerShell',
      appVersion: '0.3.0',
    },
  },
});

let accessToken = login.tokens.accessToken;
let refreshToken = login.tokens.refreshToken;

const createdOrganization = await request('/organizations', {
  method: 'POST',
  token: accessToken,
  body: {
    name: `Fluxa Catalog Smoke ${suffix}`,
    slug: `fluxa-catalog-${suffix}`.toLowerCase(),
  },
});

const organizationId = createdOrganization.organization.id;
const switched = await request('/auth/switch-organization', {
  method: 'POST',
  token: accessToken,
  body: {
    organizationId,
    refreshToken,
  },
});

accessToken = switched.tokens.accessToken;
refreshToken = switched.tokens.refreshToken;

const merchant = await request('/merchants', {
  method: 'POST',
  token: accessToken,
  body: {
    legalName: `Fluxa Smoke ${suffix} S.r.l.`,
    tradeName: 'Fluxa Smoke',
    vatNumber: `IT${Date.now().toString().slice(-11).padStart(11, '0')}`,
    countryCode: 'IT',
  },
});

const location = await request('/locations', {
  method: 'POST',
  token: accessToken,
  body: {
    merchantId: merchant.id,
    code: `SMK${Date.now().toString().slice(-6)}`,
    name: 'Smoke Location',
    addressLine1: 'Via Test 1',
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
  body: {
    code: 'BEVANDE',
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
    code: 'CAFFE',
    sku: `CAFFE-${suffix}`,
    name: 'Caffè espresso',
    unit: 'EACH',
    quantityScale: 0,
  },
});

const variant = await request(`/products/${product.id}/variants`, {
  method: 'POST',
  token: accessToken,
  body: {
    code: 'DOPPIO',
    sku: `CAFFE-DOPPIO-${suffix}`,
    name: 'Doppio',
    sortOrder: 10,
  },
});

await request(`/products/${product.id}/locations/${location.id}`, {
  method: 'PUT',
  token: accessToken,
  body: {
    enabled: true,
    sortOrder: 10,
  },
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

await request(`/price-lists/${priceList.id}/prices`, {
  method: 'PUT',
  token: accessToken,
  body: {
    productId: product.id,
    variantId: variant.id,
    amountCents: 220,
  },
});

const catalog = await request(
  `/catalog?locationId=${encodeURIComponent(location.id)}`,
  {
    token: accessToken,
  },
);

const catalogProduct = catalog.categories
  .flatMap((item) => item.products)
  .find((item) => item.id === product.id);

if (!catalogProduct) {
  throw new Error('Smoke product not present in effective catalog.');
}

if (catalogProduct.price?.amountCents !== 120) {
  throw new Error('Base price resolution failed.');
}

const catalogVariant = catalogProduct.variants.find(
  (item) => item.id === variant.id,
);

if (catalogVariant?.price?.amountCents !== 220) {
  throw new Error('Variant price resolution failed.');
}

const secondOrganization = await request('/organizations', {
  method: 'POST',
  token: accessToken,
  body: {
    name: `Fluxa Catalog Isolation ${suffix}`,
    slug: `fluxa-catalog-isolation-${suffix}`.toLowerCase(),
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

const crossTenantResponse = await fetch(
  `${baseUrl}/products/${product.id}`,
  {
    headers: {
      authorization: `Bearer ${switchedSecond.tokens.accessToken}`,
    },
  },
);

if (crossTenantResponse.status !== 404) {
  throw new Error(
    `Cross-tenant product access should return 404, received ${crossTenantResponse.status}.`,
  );
}

console.log(
  JSON.stringify({
    status: 'ok',
    organizationId,
    locationId: location.id,
    productId: product.id,
    variantId: variant.id,
    priceListId: priceList.id,
    crossTenantIsolation: true,
  }),
);