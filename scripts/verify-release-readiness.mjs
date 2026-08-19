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
  'Dockerfile.ade-fiscal-worker',
  'Dockerfile.web',
  'SECURITY.md',
  'docs/architecture/system-overview.md',
  'docs/operations/deployment-runbook.md',
  'docs/operations/backup-restore.md',
  'docs/operations/release-checklist.md',
  'docs/operations/observability.md',
  'docs/operations/ade-web-dry-run.md',
  'scripts/e2e-release-candidate.mjs',
  'scripts/verify-migrations.mjs',
  'scripts/backup-postgres.mjs',
  'scripts/verify-postgres-backup.mjs',
  'scripts/verify-vps-deployment.mjs',
  'deploy/vps/compose.production.yml',
  'deploy/vps/Caddyfile',
  'scripts/vps/install.sh',
  'scripts/vps/update.sh',
  'scripts/vps/rollback.sh',
  'scripts/vps/doctor.sh',
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
  readme.includes('scripts/vps/install.sh'),
  'README does not document one-command VPS installation.',
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
  'verify:vps',
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
assert.equal(
  rootPackage.dependencies?.playwright,
  '1.62.0',
  'ADE worker Playwright dependency must stay pinned to 1.62.0.',
);

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
  'INFRASTRUCTURE_TRUST_MODE',
  'BOOKING_WEB_BASE_URL',
  'STRIPE_ENABLED',
  'ACUBE_ENABLED',
]) {
  assert.ok(
    productionEnvironment.includes(`${name}=`),
    `Production example is missing ${name}.`,
  );
}

const adeDockerfile = fs.readFileSync(
  path.join(root, 'Dockerfile.ade-fiscal-worker'),
  'utf8',
);
for (const marker of [
  'mcr.microsoft.com/playwright:v1.62.0-noble',
  'npm run build:ade-fiscal-worker',
  'npm ci --omit=dev',
  'USER pwuser',
]) {
  assert.ok(
    adeDockerfile.includes(marker),
    `Dockerfile.ade-fiscal-worker marker missing: ${marker}`,
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
