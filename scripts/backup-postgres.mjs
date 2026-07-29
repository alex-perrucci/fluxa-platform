import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
};

const databaseUrl = process.env.DATABASE_URL ?? '';

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const parsed = new URL(databaseUrl);

if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
  throw new Error('DATABASE_URL must be PostgreSQL.');
}

const outputDirectory = path.resolve(
  valueAfter('--output-dir') ||
    process.env.FLUXA_BACKUP_DIRECTORY ||
    'release-artifacts/backups',
);
const label = (
  valueAfter('--label') ||
  process.env.RELEASE_SHA ||
  'manual'
).replace(/[^a-z0-9_.-]/gi, '_');
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d{3}Z$/, 'Z');
const baseName = `fluxa-${timestamp}-${label}`;
const dumpPath = path.join(outputDirectory, `${baseName}.dump`);
const manifestPath = path.join(outputDirectory, `${baseName}.manifest.json`);

fs.mkdirSync(outputDirectory, { recursive: true });

const pgEnvironment = {
  ...process.env,
  PGHOST: parsed.hostname,
  PGPORT: parsed.port || '5432',
  PGUSER: decodeURIComponent(parsed.username),
  PGPASSWORD: decodeURIComponent(parsed.password),
  PGDATABASE: parsed.pathname.replace(/^\//, ''),
  PGSSLMODE: process.env.DATABASE_SSL === 'true' ? 'require' : 'disable',
};

const pgDump = process.env.PG_DUMP_BIN || 'pg_dump';
const result = spawnSync(
  pgDump,
  ['--format=custom', '--no-owner', '--no-privileges', '--file', dumpPath],
  {
    env: pgEnvironment,
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  throw new Error(`pg_dump failed with exit code ${result.status}.`);
}

const dump = fs.readFileSync(dumpPath);
const manifest = {
  format: 'postgresql-custom',
  createdAt: new Date().toISOString(),
  database: {
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    name: parsed.pathname.replace(/^\//, ''),
  },
  releaseSha: process.env.RELEASE_SHA || null,
  releaseVersion: process.env.RELEASE_VERSION || null,
  dumpFile: path.basename(dumpPath),
  sizeBytes: dump.length,
  sha256: createHash('sha256').update(dump).digest('hex'),
};

fs.writeFileSync(
  manifestPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(`Backup created: ${dumpPath}`);
console.log(`Manifest created: ${manifestPath}`);
