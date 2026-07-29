import { randomUUID } from 'node:crypto';
import process from 'node:process';

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
};

const apiInput =
  valueAfter('--api-base-url') ||
  valueAfter('--base-url') ||
  process.env.FLUXA_API_BASE_URL ||
  '';
const webInput =
  valueAfter('--web-base-url') || process.env.FLUXA_WEB_BASE_URL || '';
const allowHttp = process.argv.includes('--allow-http');

if (!apiInput) {
  console.error('Provide --api-base-url or FLUXA_API_BASE_URL.');
  process.exit(1);
}

function normalizeBase(input) {
  return input.replace(/\/+$/, '');
}

function assertProductionUrl(name, input) {
  const parsed = new URL(input);

  if (!allowHttp && parsed.protocol !== 'https:') {
    throw new Error(`${name} requires HTTPS.`);
  }
}

const apiBase = normalizeBase(apiInput);
const webBase = webInput ? normalizeBase(webInput) : '';

assertProductionUrl('API smoke test', apiBase);

if (webBase) {
  assertProductionUrl('Web smoke test', webBase);
}

async function request(
  url,
  { method = 'GET', headers = {}, body, expectJson = true } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      redirect: 'follow',
    });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `${method} ${url}: HTTP ${response.status}: ${text.slice(0, 240)}`,
      );
    }

    if (!expectJson) {
      return text;
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${method} ${url}: expected JSON response.`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function checkApi(pathname) {
  const value = await request(`${apiBase}${pathname}`);
  console.log(`${pathname}: OK`);
  return value;
}

async function checkWeb(pathname) {
  await request(`${webBase}${pathname}`, {
    expectJson: false,
    headers: { Accept: 'text/html' },
  });
  console.log(`web ${pathname}: OK`);
}

const live = await checkApi('/health/live');

if (live?.status !== 'ok' || !live?.release?.sha || !live?.release?.version) {
  throw new Error('Health live response is missing release metadata.');
}

const ready = await checkApi('/health/ready');

if (
  ready?.status !== 'ok' ||
  ready?.checks?.database !== 'up' ||
  ready?.checks?.redis !== 'up'
) {
  throw new Error('Health ready response is not fully healthy.');
}

await checkApi('/public/events?page=1&pageSize=1');

if (webBase) {
  await checkWeb('/');
  await checkWeb('/events');
  await checkWeb('/health');
}

const smokeEmail = process.env.FLUXA_SMOKE_EMAIL?.trim() ?? '';
const smokePassword = process.env.FLUXA_SMOKE_PASSWORD ?? '';

if (smokeEmail || smokePassword) {
  if (!smokeEmail || !smokePassword) {
    throw new Error(
      'FLUXA_SMOKE_EMAIL and FLUXA_SMOKE_PASSWORD must be provided together.',
    );
  }

  const loginBody = {
    email: smokeEmail,
    password: smokePassword,
    device: {
      installationId: `production-smoke-${randomUUID()}`,
      name: 'Fluxa production smoke',
      platform: 'OTHER',
      model: 'GitHub or operator smoke',
      appVersion: live.release.version,
    },
  };

  const organizationId = process.env.FLUXA_SMOKE_ORGANIZATION_ID?.trim() ?? '';

  if (organizationId) {
    loginBody.organizationId = organizationId;
  }

  const login = await request(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'content-type': 'application/json',
    },
    body: loginBody,
  });
  const accessToken = login?.tokens?.accessToken;

  if (!accessToken) {
    throw new Error('Authenticated smoke login returned no access token.');
  }

  await request(`${apiBase}/auth/me`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  await request(`${apiBase}/auth/logout`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  console.log('authenticated session: OK');
}

console.log('Fluxa production smoke test passed.');
