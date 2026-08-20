import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const requiredFiles = [
  'deploy/vps/compose.production.yml',
  'deploy/vps/Caddyfile',
  'deploy/vps/.env.example',
  'Dockerfile.ade-fiscal-worker',
  'deploy/vps/systemd/fluxa-backup.service',
  'deploy/vps/systemd/fluxa-backup.timer',
  'scripts/vps/install.sh',
  'scripts/vps/provision.sh',
  'scripts/vps/lib.sh',
  'scripts/vps/update.sh',
  'scripts/vps/rollback.sh',
  'scripts/vps/doctor.sh',
  'scripts/vps/backup.sh',
];

for (const relativePath of requiredFiles) {
  assert.ok(
    fs.existsSync(path.join(root, relativePath)),
    `VPS deployment file missing: ${relativePath}`,
  );
}

const compose = fs.readFileSync(
  path.join(root, 'deploy/vps/compose.production.yml'),
  'utf8',
);

for (const service of [
  'postgres',
  'redis',
  'migrate',
  'bootstrap-admin',
  'api',
  'background-worker',
  'fiscal-worker',
  'ade-fiscal-worker',
  'web',
  'caddy',
]) {
  assert.ok(
    compose.includes(`  ${service}:`),
    `Compose service missing: ${service}`,
  );
}

function serviceBlock(name) {
  const pattern = new RegExp(
    `^  ${name}:\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:|^networks:|^volumes:)`,
    'm',
  );
  const match = compose.match(pattern);
  assert.ok(match, `Unable to isolate service: ${name}`);
  return match[0];
}

assert.ok(
  compose.includes('internal: true'),
  'Backend network must be internal.',
);
assert.ok(
  !serviceBlock('postgres').includes('\n    ports:'),
  'PostgreSQL must not publish a host port.',
);
assert.ok(
  !serviceBlock('redis').includes('\n    ports:'),
  'Redis must not publish a host port.',
);
assert.ok(
  serviceBlock('caddy').includes('80:80') &&
    serviceBlock('caddy').includes('443:443'),
  'Caddy must publish HTTP and HTTPS.',
);
assert.ok(
  compose.includes('condition: service_healthy'),
  'Compose health dependencies are missing.',
);

const adeWorker = serviceBlock('ade-fiscal-worker');
for (const marker of [
  'Dockerfile.ade-fiscal-worker',
  'ADE_DRY_RUN_ENABLED:',
  'ADE_WORKER_INTERNAL_TOKEN:',
  'ADE_AUTH_ENTRY_URL:',
  'ADE_STORAGE_STATE_PATH: /run/fluxa-ade-session/storage-state.json',
  'ADE_SELECTOR_PROFILE_PATH: /run/fluxa-ade/selectors.json',
  'ADE_AUTH_PROFILE_PATH: /run/fluxa-ade/auth-profile.json',
  'ADE_CIE_USERNAME_FILE: /run/fluxa-ade-secrets/cie-username',
  'ADE_CIE_PASSWORD_FILE: /run/fluxa-ade-secrets/cie-password',
  ':/run/fluxa-ade:ro',
  ':/run/fluxa-ade-session:rw',
  ':/run/fluxa-ade-secrets:ro',
  '- ade-fiscal',
]) {
  assert.ok(
    adeWorker.includes(marker),
    `ADE worker deployment marker missing: ${marker}`,
  );
}
assert.ok(
  !adeWorker.includes('\n    ports:'),
  'ADE worker must not publish a host port.',
);
assert.ok(
  !adeWorker.includes('\n      - data'),
  'ADE worker must not join the PostgreSQL/Redis data network.',
);
assert.ok(
  adeWorker.includes('\n      - app'),
  'ADE worker must only be reachable on the application network.',
);

const caddy = fs.readFileSync(path.join(root, 'deploy/vps/Caddyfile'), 'utf8');
for (const marker of [
  '{$WEB_DOMAIN}',
  '{$API_DOMAIN}',
  'reverse_proxy web:3000',
  'reverse_proxy api:3000',
  'Strict-Transport-Security',
]) {
  assert.ok(caddy.includes(marker), `Caddy marker missing: ${marker}`);
}
assert.ok(
  !caddy.includes('ade-fiscal-worker'),
  'ADE worker must not be exposed through Caddy.',
);

for (const script of [
  'install.sh',
  'provision.sh',
  'lib.sh',
  'update.sh',
  'rollback.sh',
  'doctor.sh',
  'backup.sh',
]) {
  const content = fs.readFileSync(
    path.join(root, 'scripts/vps', script),
    'utf8',
  );
  assert.ok(
    content.includes('set -Eeuo pipefail'),
    `${script} must use strict Bash mode.`,
  );
}

const lib = fs.readFileSync(path.join(root, 'scripts/vps/lib.sh'), 'utf8');
assert.ok(
  lib.includes('ADE_DRY_RUN_ENABLED') && lib.includes('--profile ade-fiscal'),
  'VPS helper must enable the ADE profile only from the explicit dry-run flag.',
);

const provision = fs.readFileSync(
  path.join(root, 'scripts/vps/provision.sh'),
  'utf8',
);
for (const marker of [
  'install_docker',
  'check_dns',
  'configure_firewall',
  'OPENAPI_ENABLED=false',
  'OPENAPI_SANDBOX_BEARER_TOKEN=',
  'fluxa_tools_compose run --rm migrate',
  'fluxa_tools_compose run --rm bootstrap-admin',
  'install_backup_timer',
  'doctor.sh',
]) {
  assert.ok(
    provision.includes(marker),
    `Provisioning marker missing: ${marker}`,
  );
}

const environment = fs.readFileSync(
  path.join(root, 'deploy/vps/.env.example'),
  'utf8',
);
for (const marker of [
  'INFRASTRUCTURE_TRUST_MODE=private-docker-network',
  'DATABASE_SSL=false',
  'REDIS_TLS=false',
  'TRUST_PROXY=true',
  'STRIPE_ENABLED=false',
  'ACUBE_ENABLED=false',
  'OPENAPI_ENABLED=false',
  'OPENAPI_BEARER_TOKEN=',
  'OPENAPI_SANDBOX_BEARER_TOKEN=',
  'ADE_DRY_RUN_ENABLED=false',
  'ADE_WORKER_INTERNAL_TOKEN=',
  'ADE_RUNTIME_DIR=/opt/fluxa/runtime/ade',
  'ADE_SESSION_DIR=/opt/fluxa/runtime/ade-session',
  'ADE_SECRET_DIR=/opt/fluxa/runtime/ade-secrets',
]) {
  assert.ok(
    environment.includes(marker),
    `VPS environment marker missing: ${marker}`,
  );
}

console.log(
  `VPS deployment structure passed: ${requiredFiles.length} required files.`,
);
