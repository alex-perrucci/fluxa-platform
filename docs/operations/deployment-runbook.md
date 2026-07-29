# Production deployment runbook

Fluxa supports two production paths:

1. one-command deployment on a dedicated Ubuntu or Debian VPS;
2. manual deployment using managed PostgreSQL, Redis and container services.

## One-command VPS deployment

Prerequisites:

- a clean VPS;
- root access;
- a DNS record for the web domain;
- a separate DNS record for the API domain;
- ports 80 and 443 reachable from the internet.

Run:

```bash
curl -fsSL \
  https://raw.githubusercontent.com/alex-perrucci/fluxa-platform/main/scripts/vps/install.sh \
  -o /tmp/fluxa-install.sh && \
sudo bash /tmp/fluxa-install.sh
```

The installer clones the repository into `/opt/fluxa`, installs Docker, writes
`deploy/vps/.env`, configures UFW, builds the images, migrates the database,
creates the first platform administrator, starts the complete stack, installs
the daily backup timer and executes `doctor.sh`.

The resulting services are:

```text
Caddy
├── web domain → Next.js
└── API domain → NestJS API

private Docker network
├── PostgreSQL
├── Redis
├── API
├── background worker
├── optional fiscal worker
└── web
```

PostgreSQL and Redis have no host-published ports.

### Update

```bash
sudo bash /opt/fluxa/scripts/vps/update.sh main
```

The update creates a backup, records the previous commit, builds immutable
images, applies forward migrations, starts the target release and runs
diagnostics.

### Application rollback

```bash
sudo bash /opt/fluxa/scripts/vps/rollback.sh
```

Rollback restores the previous application commit and images. It deliberately
does not reverse database migrations. Migrations must remain backward
compatible or be forward-fixed.

### Diagnostics and backup

```bash
sudo bash /opt/fluxa/scripts/vps/doctor.sh
sudo bash /opt/fluxa/scripts/vps/backup.sh
systemctl status fluxa-backup.timer
```

## Manual/managed deployment

Run against the exact commit:

```powershell
npm ci
npm --prefix apps/web ci
npm run verify:release
npm run verify:production -- --env .env.production
```

Create and verify a database backup:

```powershell
npm run backup:postgres -- --label pre-deploy
npm run backup:verify -- --file <BACKUP_FILE>
```

Build immutable images:

```powershell
docker build -t fluxa-backend:<GIT_SHA> .

docker build `
  -f Dockerfile.web `
  --build-arg FLUXA_API_BASE_URL=https://api.example.com/api/v1 `
  -t fluxa-web:<GIT_SHA> .
```

Use the backend image with:

- `FLUXA_APP=api`
- `FLUXA_APP=background-worker`
- `FLUXA_APP=fiscal-worker`

## Migration policy

Apply migrations once before shifting traffic:

```powershell
npm run db:migrate
```

Rules:

- prefer additive and backward-compatible migrations;
- deploy schema expansion before code that requires it;
- never edit a migration already applied to an environment;
- destructive changes require a backup and reviewed data migration;
- prefer application rollback plus database forward-fix.

## Post-deploy smoke

```powershell
npm run smoke:production -- `
  --api-base-url https://api.example.com/api/v1 `
  --web-base-url https://app.example.com
```
