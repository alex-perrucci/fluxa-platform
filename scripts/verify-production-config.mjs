import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const required = [
  'DATABASE_URL',
  'DATABASE_SSL',
  'REDIS_PASSWORD',
  'CORS_ORIGINS',
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

export function validateProduction(values, posApiUrl = '') {
  const problems = [];
  for (const name of required) {
    if (!values[name]) problems.push(`${name} is required`);
  }
  if (values.NODE_ENV !== 'production')
    problems.push('NODE_ENV must be production');
  if (values.DATABASE_SSL !== 'true')
    problems.push('DATABASE_SSL must be true');
  if (values.SWAGGER_ENABLED !== 'false')
    problems.push('SWAGGER_ENABLED must be false');

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

  try {
    const database = new URL(values.DATABASE_URL ?? '');
    if (localHost.test(database.hostname))
      problems.push('DATABASE_URL must not use localhost');
  } catch {
    problems.push('DATABASE_URL is not a valid URL');
  }
  for (const origin of (values.CORS_ORIGINS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)) {
    try {
      const url = new URL(origin);
      if (url.protocol !== 'https:' || localHost.test(url.hostname)) {
        problems.push(`CORS origin must be non-local HTTPS: ${origin}`);
      }
    } catch {
      problems.push(`Invalid CORS origin: ${origin}`);
    }
  }

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
    const raw = values[name];
    if (!raw) continue;
    try {
      if (new URL(raw).protocol !== 'https:')
        problems.push(`${name} must use HTTPS`);
    } catch {
      problems.push(`${name} is not a valid URL`);
    }
  }
  if (posApiUrl) {
    try {
      const url = new URL(posApiUrl);
      if (url.protocol !== 'https:' || localHost.test(url.hostname)) {
        problems.push('POS API URL must be a non-local HTTPS URL');
      }
    } catch {
      problems.push('POS API URL is not valid');
    }
  }
  return problems;
}

function selfTest() {
  const valid = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@postgres:5432/fluxa',
    DATABASE_SSL: 'true',
    REDIS_PASSWORD: 'r'.repeat(32),
    CORS_ORIGINS: 'https://pos.example.com',
    SWAGGER_ENABLED: 'false',
    ACCESS_TOKEN_SECRET: 'a'.repeat(64),
    REFRESH_TOKEN_SECRET: 'b'.repeat(64),
    SESSION_IP_HASH_SECRET: 'c'.repeat(64),
    ACUBE_BEARER_TOKEN: 'd'.repeat(64),
    ACUBE_API_BASE_URL: 'https://api.acubeapi.com',
  };
  assert.deepEqual(
    validateProduction(valid, 'https://api.example.com/api/v1'),
    [],
  );
  assert.ok(
    validateProduction({ ...valid, DATABASE_SSL: 'false' }).some((p) =>
      p.includes('DATABASE_SSL'),
    ),
  );
  assert.ok(
    validateProduction({ ...valid, CORS_ORIGINS: 'http://localhost:3000' })
      .length > 0,
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
        problems.map((p) => `- ${p}`).join('\n'),
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Production configuration passed (${path.basename(envPath)}). No secret values were printed.`,
    );
  }
}
