import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredFiles = [
  '.github/workflows/ci.yml',
  '.github/pull_request_template.md',
  '.env.production.example',
  'apps/web/.env.production.example',
  'Dockerfile',
  'Dockerfile.web',
  'SECURITY.md',
  'docs/architecture/system-overview.md',
  'docs/operations/deployment-runbook.md',
  'docs/operations/backup-restore.md',
  'docs/operations/release-checklist.md',
  'docs/operations/observability.md',
  'scripts/e2e-release-candidate.mjs',
  'scripts/verify-migrations.mjs',
  'scripts/backup-postgres.mjs',
  'scripts/verify-postgres-backup.mjs',
];

for (const relativePath of requiredFiles) {
  assert.ok(
    fs.existsSync(path.join(root, relativePath)),
    `Release file missing: ${relativePath}`,
  );
}

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

assert.ok(!readme.includes('\0'), 'README contains NUL bytes.');
assert.ok(!/[ÃÂ][ƒ¢€]/.test(readme), 'README appears to contain mojibake.');
assert.ok(
  readme.includes('release candidate for controlled pilots'),
  'README release status is missing.',
);
assert.ok(
  readme.includes('docs/operations/release-checklist.md'),
  'README does not link the release checklist.',
);

const rootPackage = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const webPackage = JSON.parse(
  fs.readFileSync(path.join(root, 'apps/web/package.json'), 'utf8'),
);

for (const script of [
  'verify:migrations',
  'verify:production:self-test',
  'verify:release:structure',
  'verify:ci',
  'verify:release',
  'e2e:release',
  'backup:postgres',
  'backup:verify',
]) {
  assert.ok(
    rootPackage.scripts?.[script],
    `Root package script missing: ${script}`,
  );
}

assert.ok(webPackage.scripts?.verify, 'Web verify script is missing.');

const workflow = fs.readFileSync(
  path.join(root, '.github/workflows/ci.yml'),
  'utf8',
);

for (const marker of [
  'Backend quality',
  'Web quality',
  'Release E2E',
  'npm run verify:ci',
  'npm run e2e:release',
]) {
  assert.ok(workflow.includes(marker), `CI workflow marker missing: ${marker}`);
}

const productionEnvironment = fs.readFileSync(
  path.join(root, '.env.production.example'),
  'utf8',
);

for (const name of [
  'RELEASE_SHA',
  'BOOKING_WEB_BASE_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'ACUBE_BEARER_TOKEN',
]) {
  assert.ok(
    productionEnvironment.includes(`${name}=`),
    `Production example is missing ${name}.`,
  );
}

const webDockerfile = fs.readFileSync(
  path.join(root, 'Dockerfile.web'),
  'utf8',
);

for (const marker of [
  'npm run build',
  '.next/standalone',
  'USER node',
  'server.js',
]) {
  assert.ok(
    webDockerfile.includes(marker),
    `Dockerfile.web marker missing: ${marker}`,
  );
}

console.log(
  `Release readiness structure passed: ${requiredFiles.length} files.`,
);
