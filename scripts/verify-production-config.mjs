import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const required = [
  'NODE_ENV',
  'RELEASE_SHA',
  'RELEASE_VERSION',
  'INFRASTRUCTURE_TRUST_MODE',
  'DATABASE_URL',
  'DATABASE_SSL',
  'REDIS_HOST',
  'REDIS_PASSWORD',
  'REDIS_TLS',
  'CORS_ORIGINS',
  'BOOKING_WEB_BASE_URL',
  'STRIPE_ENABLED',
  'ACUBE_ENABLED',
  'OPENAPI_ENABLED',
  'ACCESS_TOKEN_SECRET',
  'REFRESH_TOKEN_SECRET',
  'SESSION_IP_HASH_SECRET',
];

const placeholder = /change[_-]?me|replace|example|generate|<|>/i;
const localHost = /^(localhost|127\.0\.0\.1|::1)$/i;

export function parseEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function requireHttpsUrl(problems, name, raw) {
  try {
    const url = new URL(raw ?? '');
    if (url.protocol !== 'https:' || localHost.test(url.hostname)) {
      problems.push(`${name} must be a non-local HTTPS URL`);
    }
  } catch {
    problems.push(`${name} is not a valid URL`);
  }
}

export function validateProduction(values, posApiUrl = '') {
  const problems = [];
  for (const name of required) {
    if (!values[name]) problems.push(`${name} is required`);
  }

  if (values.NODE_ENV !== 'production')
    problems.push('NODE_ENV must be production');
  if (values.SWAGGER_ENABLED !== 'false')
    problems.push('SWAGGER_ENABLED must be false');
  if (!/^[a-f0-9]{7,64}$/i.test(values.RELEASE_SHA ?? '')) {
    problems.push('RELEASE_SHA must be a Git commit SHA');
  }
  if (
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(values.RELEASE_VERSION ?? '')
  ) {
    problems.push('RELEASE_VERSION must be a semantic version');
  }

  for (const name of [
    'REDIS_PASSWORD',
    'ACCESS_TOKEN_SECRET',
    'REFRESH_TOKEN_SECRET',
    'SESSION_IP_HASH_SECRET',
  ]) {
    const value = values[name] ?? '';
    const minimum = name === 'REDIS_PASSWORD' ? 16 : 48;
    if (value.length < minimum || placeholder.test(value)) {
      problems.push(
        `${name} must be a non-placeholder secret of at least ${minimum} characters`,
      );
    }
  }

  const secrets = [
    'ACCESS_TOKEN_SECRET',
    'REFRESH_TOKEN_SECRET',
    'SESSION_IP_HASH_SECRET',
  ].map((name) => values[name]);
  if (secrets.every(Boolean) && new Set(secrets).size !== secrets.length) {
    problems.push('JWT and session secrets must all be different');
  }

  let databaseHostname = '';
  try {
    const database = new URL(values.DATABASE_URL ?? '');
    databaseHostname = database.hostname;
    if (localHost.test(databaseHostname))
      problems.push('DATABASE_URL must not use localhost');
  } catch {
    problems.push('DATABASE_URL is not a valid URL');
  }

  if (values.INFRASTRUCTURE_TRUST_MODE === 'managed-tls') {
    if (values.DATABASE_SSL !== 'true')
      problems.push('DATABASE_SSL must be true with managed-tls');
    if (values.REDIS_TLS !== 'true')
      problems.push('REDIS_TLS must be true with managed-tls');
  } else if (values.INFRASTRUCTURE_TRUST_MODE === 'private-docker-network') {
    if (databaseHostname !== 'postgres') {
      problems.push(
        'DATABASE_URL must target postgres in private-docker-network mode',
      );
    }
    if (values.REDIS_HOST !== 'redis') {
      problems.push(
        'REDIS_HOST must target redis in private-docker-network mode',
      );
    }
    if (values.DATABASE_SSL !== 'false') {
      problems.push(
        'DATABASE_SSL must be false in private-docker-network mode',
      );
    }
    if (values.REDIS_TLS !== 'false') {
      problems.push('REDIS_TLS must be false in private-docker-network mode');
    }
  } else {
    problems.push(
      'INFRASTRUCTURE_TRUST_MODE must be managed-tls or private-docker-network',
    );
  }

  for (const origin of (values.CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)) {
    requireHttpsUrl(problems, 'CORS origin', origin);
  }
  requireHttpsUrl(
    problems,
    'BOOKING_WEB_BASE_URL',
    values.BOOKING_WEB_BASE_URL,
  );

  if (values.STRIPE_ENABLED === 'true') {
    if (!(values.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_')) {
      problems.push('STRIPE_SECRET_KEY must start with sk_live_');
    }
    if (!(values.STRIPE_WEBHOOK_SECRET ?? '').startsWith('whsec_')) {
      problems.push('STRIPE_WEBHOOK_SECRET must start with whsec_');
    }
  } else if (values.STRIPE_ENABLED !== 'false') {
    problems.push('STRIPE_ENABLED must be true or false');
  }

  if (values.ACUBE_ENABLED === 'true') {
    const bearer = values.ACUBE_BEARER_TOKEN ?? '';
    const email = values.ACUBE_EMAIL ?? '';
    const password = values.ACUBE_PASSWORD ?? '';
    if (
      (!bearer || placeholder.test(bearer)) &&
      (!email || !password || placeholder.test(email + password))
    ) {
      problems.push(
        'Configure ACUBE_BEARER_TOKEN or ACUBE_EMAIL plus ACUBE_PASSWORD',
      );
    }
    for (const name of ['ACUBE_API_BASE_URL', 'ACUBE_AUTH_BASE_URL']) {
      requireHttpsUrl(problems, name, values[name]);
    }
  } else if (values.ACUBE_ENABLED !== 'false') {
    problems.push('ACUBE_ENABLED must be true or false');
  }

  const sandboxBearer = values.OPENAPI_SANDBOX_BEARER_TOKEN ?? '';
  if (
    sandboxBearer &&
    (sandboxBearer.length < 16 || placeholder.test(sandboxBearer))
  ) {
    problems.push(
      'OPENAPI_SANDBOX_BEARER_TOKEN must be a non-placeholder sandbox token of at least 16 characters when configured',
    );
  }

  if (values.OPENAPI_ENABLED === 'true') {
    const bearer = values.OPENAPI_BEARER_TOKEN ?? '';
    if (bearer.length < 16 || placeholder.test(bearer)) {
      problems.push(
        'OPENAPI_BEARER_TOKEN must be a non-placeholder production token of at least 16 characters',
      );
    }
    if (sandboxBearer && bearer && sandboxBearer === bearer) {
      problems.push(
        'OPENAPI_SANDBOX_BEARER_TOKEN must be different from OPENAPI_BEARER_TOKEN',
      );
    }
    if (values.OPENAPI_API_BASE_URL) {
      requireHttpsUrl(
        problems,
        'OPENAPI_API_BASE_URL',
        values.OPENAPI_API_BASE_URL,
      );
    }
  } else if (values.OPENAPI_ENABLED !== 'false') {
    problems.push('OPENAPI_ENABLED must be true or false');
  }

  if (posApiUrl) requireHttpsUrl(problems, 'POS API URL', posApiUrl);
  return problems;
}

function selfTest() {
  const managed = {
    NODE_ENV: 'production',
    RELEASE_SHA: 'a'.repeat(40),
    RELEASE_VERSION: '0.8.0',
    INFRASTRUCTURE_TRUST_MODE: 'managed-tls',
    DATABASE_URL: 'postgresql://u:p@database.example.com:5432/fluxa',
    DATABASE_SSL: 'true',
    REDIS_HOST: 'cache.example.com',
    REDIS_PASSWORD: 'r'.repeat(32),
    REDIS_TLS: 'true',
    CORS_ORIGINS: 'https://app.example.com',
    BOOKING_WEB_BASE_URL: 'https://app.example.com',
    STRIPE_ENABLED: 'true',
    STRIPE_SECRET_KEY: `sk_live_${'s'.repeat(32)}`,
    STRIPE_WEBHOOK_SECRET: `whsec_${'w'.repeat(32)}`,
    ACUBE_ENABLED: 'true',
    ACUBE_BEARER_TOKEN: 'd'.repeat(64),
    ACUBE_API_BASE_URL: 'https://api.acubeapi.com',
    ACUBE_AUTH_BASE_URL: 'https://common.api.acubeapi.com',
    OPENAPI_ENABLED: 'true',
    OPENAPI_BEARER_TOKEN: 'o'.repeat(64),
    OPENAPI_SANDBOX_BEARER_TOKEN: 'x'.repeat(64),
    OPENAPI_API_BASE_URL: '',
    SWAGGER_ENABLED: 'false',
    ACCESS_TOKEN_SECRET: 'a'.repeat(64),
    REFRESH_TOKEN_SECRET: 'b'.repeat(64),
    SESSION_IP_HASH_SECRET: 'c'.repeat(64),
  };
  assert.deepEqual(
    validateProduction(managed, 'https://api.example.com/api/v1'),
    [],
  );

  const privateDocker = {
    ...managed,
    INFRASTRUCTURE_TRUST_MODE: 'private-docker-network',
    DATABASE_URL: 'postgresql://u:p@postgres:5432/fluxa',
    DATABASE_SSL: 'false',
    REDIS_HOST: 'redis',
    REDIS_TLS: 'false',
    STRIPE_ENABLED: 'false',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    ACUBE_ENABLED: 'false',
    ACUBE_BEARER_TOKEN: '',
    ACUBE_API_BASE_URL: '',
    ACUBE_AUTH_BASE_URL: '',
    OPENAPI_ENABLED: 'false',
    OPENAPI_BEARER_TOKEN: '',
    OPENAPI_SANDBOX_BEARER_TOKEN: '',
    OPENAPI_API_BASE_URL: '',
  };
  assert.deepEqual(validateProduction(privateDocker), []);
  assert.ok(
    validateProduction({ ...managed, DATABASE_SSL: 'false' }).some((problem) =>
      problem.includes('DATABASE_SSL'),
    ),
  );
  assert.ok(
    validateProduction({
      ...privateDocker,
      DATABASE_URL: 'postgresql://u:p@external.example.com:5432/fluxa',
    }).some((problem) => problem.includes('DATABASE_URL')),
  );
  assert.ok(
    validateProduction({
      ...managed,
      STRIPE_SECRET_KEY: 'sk_test_not_allowed',
    }).some((problem) => problem.includes('STRIPE_SECRET_KEY')),
  );
  assert.ok(
    validateProduction({
      ...managed,
      OPENAPI_BEARER_TOKEN: '<OPENAPI_PRODUCTION_TOKEN>',
    }).some((problem) => problem.includes('OPENAPI_BEARER_TOKEN')),
  );
  assert.ok(
    validateProduction({
      ...managed,
      OPENAPI_SANDBOX_BEARER_TOKEN: managed.OPENAPI_BEARER_TOKEN,
    }).some((problem) => problem.includes('must be different')),
  );
  console.log('Production configuration verifier self-test passed.');
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const envIndex = process.argv.indexOf('--env');
  const apiIndex = process.argv.indexOf('--pos-api');
  const envPath = path.resolve(
    envIndex >= 0 ? process.argv[envIndex + 1] : '.env.production',
  );
  const posApiUrl = apiIndex >= 0 ? process.argv[apiIndex + 1] : '';
  if (!fs.existsSync(envPath)) {
    console.error(`Production environment file not found: ${envPath}`);
    process.exit(1);
  }
  const values = parseEnv(fs.readFileSync(envPath, 'utf8'));
  const problems = validateProduction(values, posApiUrl);
  if (problems.length > 0) {
    console.error(
      'Production configuration is not safe:\n' +
        problems.map((problem) => `- ${problem}`).join('\n'),
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Production configuration passed (${path.basename(envPath)}). No secret values were printed.`,
    );
  }
}
