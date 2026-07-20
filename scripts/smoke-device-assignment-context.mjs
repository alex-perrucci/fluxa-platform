import crypto from 'node:crypto';

try {
  process.loadEnvFile('.env');
} catch {
  /* host environment may already be configured */
}

const baseUrl =
  process.env.DEVICE_CONTEXT_SMOKE_BASE_URL?.replace(/\/$/, '') ??
  'http://127.0.0.1:3000/api/v1';
const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error(
    'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required.',
  );
}

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
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

  return { response, payload };
}

async function request(path, options = {}) {
  const result = await call(path, options);

  if (!result.response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} failed with HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`,
    );
  }

  return result.payload;
}

async function expectError(path, expectedStatus, expectedCode, options = {}) {
  const result = await call(path, options);

  if (result.response.status !== expectedStatus) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} should return ${expectedStatus}, received ${result.response.status}: ${JSON.stringify(result.payload)}`,
    );
  }

  if (result.payload?.code !== expectedCode) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} should return code ${expectedCode}, received ${JSON.stringify(result.payload)}`,
    );
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const installationId = `device-context-${suffix}`;
const devicePayload = {
  installationId,
  name: 'Fluxa Device Context Smoke',
  platform: 'WINDOWS',
  model: 'Smoke',
  appVersion: '0.8.0',
};

const initialLogin = await request('/auth/login', {
  method: 'POST',
  body: { email, password, device: devicePayload },
});
let accessToken = initialLogin.tokens.accessToken;
let refreshToken = initialLogin.tokens.refreshToken;

await expectError('/devices/me/assignment', 403, 'TENANT_CONTEXT_REQUIRED', {
  token: accessToken,
});

const firstOrganization = await request('/organizations', {
  method: 'POST',
  token: accessToken,
  body: {
    name: `Fluxa Device Context ${suffix}`,
    slug: `fluxa-device-context-${suffix}`.toLowerCase(),
  },
});
const firstOrganizationId = firstOrganization.organization.id;

const firstSwitch = await request('/auth/switch-organization', {
  method: 'POST',
  token: accessToken,
  body: { organizationId: firstOrganizationId, refreshToken },
});
accessToken = firstSwitch.tokens.accessToken;
refreshToken = firstSwitch.tokens.refreshToken;

const currentDevice = await request('/devices/me', { token: accessToken });
let context = await request('/devices/me/assignment', { token: accessToken });
assertEqual(
  context.operationalStatus,
  'LOCATION_REQUIRED',
  'New tenant assignment status',
);
assertEqual(
  context.assignment.organizationId,
  firstOrganizationId,
  'Assignment tenant',
);
assertEqual(context.assignment.locationId, null, 'Initial locationId');

const merchant = await request('/merchants', {
  method: 'POST',
  token: accessToken,
  body: {
    legalName: `Fluxa Device Context ${suffix} S.r.l.`,
    tradeName: 'Fluxa Device Context',
    vatNumber: `${Date.now().toString().slice(-11).padStart(11, '0')}`,
    countryCode: 'IT',
  },
});
const location = await request('/locations', {
  method: 'POST',
  token: accessToken,
  body: {
    merchantId: merchant.id,
    code: `CTX${Date.now().toString().slice(-6)}`,
    name: 'Device Context Smoke',
    addressLine1: 'Via Test 8',
    postalCode: '43121',
    city: 'Parma',
    province: 'PR',
    countryCode: 'IT',
    timezone: 'Europe/Rome',
  },
});

await request(`/devices/${currentDevice.id}/assignment`, {
  method: 'PUT',
  token: accessToken,
  body: { locationId: location.id },
});
context = await request('/devices/me/assignment', { token: accessToken });
assertEqual(context.operationalStatus, 'READY', 'Assigned location status');
assertEqual(context.location.id, location.id, 'Assigned location');

await request(`/locations/${location.id}`, {
  method: 'PATCH',
  token: accessToken,
  body: { status: 'INACTIVE' },
});
context = await request('/devices/me/assignment', { token: accessToken });
assertEqual(
  context.operationalStatus,
  'LOCATION_INACTIVE',
  'Inactive location status',
);

await request(`/locations/${location.id}`, {
  method: 'PATCH',
  token: accessToken,
  body: { status: 'ACTIVE' },
});

const secondOrganization = await request('/organizations', {
  method: 'POST',
  token: accessToken,
  body: {
    name: `Fluxa Device Context Second ${suffix}`,
    slug: `fluxa-device-context-second-${suffix}`.toLowerCase(),
  },
});
const secondOrganizationId = secondOrganization.organization.id;
const secondSwitch = await request('/auth/switch-organization', {
  method: 'POST',
  token: accessToken,
  body: { organizationId: secondOrganizationId, refreshToken },
});
accessToken = secondSwitch.tokens.accessToken;
refreshToken = secondSwitch.tokens.refreshToken;

context = await request('/devices/me/assignment', { token: accessToken });
assertEqual(
  context.assignment.organizationId,
  secondOrganizationId,
  'Switched assignment tenant',
);
assertEqual(
  context.operationalStatus,
  'LOCATION_REQUIRED',
  'Switched tenant location status',
);

const switchedBack = await request('/auth/switch-organization', {
  method: 'POST',
  token: accessToken,
  body: { organizationId: firstOrganizationId, refreshToken },
});
accessToken = switchedBack.tokens.accessToken;

context = await request('/devices/me/assignment', { token: accessToken });
assertEqual(context.operationalStatus, 'READY', 'Restored tenant context');
assertEqual(
  context.assignment.organizationId,
  firstOrganizationId,
  'Restored assignment tenant',
);

await request(`/devices/${currentDevice.id}/assignment`, {
  method: 'DELETE',
  token: accessToken,
});
await expectError('/devices/me/assignment', 401, 'SESSION_NOT_ACTIVE', {
  token: accessToken,
});

console.log(
  JSON.stringify({
    ok: true,
    endpoint: '/api/v1/devices/me/assignment',
    organizationId: firstOrganizationId,
    locationId: location.id,
    deviceId: currentDevice.id,
  }),
);
