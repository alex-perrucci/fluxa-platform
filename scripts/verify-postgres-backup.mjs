import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
};

const fileInput = valueAfter('--file') || process.env.FLUXA_BACKUP_FILE || '';

if (!fileInput) {
  throw new Error('Provide --file or FLUXA_BACKUP_FILE.');
}

const dumpPath = path.resolve(fileInput);

if (!fs.existsSync(dumpPath)) {
  throw new Error(`Backup file not found: ${dumpPath}`);
}

const manifestPath =
  valueAfter('--manifest') || dumpPath.replace(/\.dump$/i, '.manifest.json');
const dump = fs.readFileSync(dumpPath);
const sha256 = createHash('sha256').update(dump).digest('hex');

if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (manifest.sha256 !== sha256) {
    throw new Error('Backup SHA-256 does not match the manifest.');
  }

  if (manifest.sizeBytes !== dump.length) {
    throw new Error('Backup size does not match the manifest.');
  }
}

const pgRestore = process.env.PG_RESTORE_BIN || 'pg_restore';
const result = spawnSync(pgRestore, ['--list', dumpPath], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  throw new Error(
    `pg_restore --list failed with exit code ${result.status}: ${result.stderr}`,
  );
}

if (!/TABLE|SCHEMA|DATABASE/i.test(result.stdout)) {
  throw new Error(
    'Backup archive does not contain recognizable PostgreSQL objects.',
  );
}

console.log(`Backup archive valid: ${dumpPath}`);
console.log(`SHA-256: ${sha256}`);
