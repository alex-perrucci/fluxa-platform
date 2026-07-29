# Fluxa Platform

[![Fluxa CI](https://github.com/alex-perrucci/fluxa-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/alex-perrucci/fluxa-platform/actions/workflows/ci.yml)

Fluxa is a multi-tenant platform for hospitality operations: POS workflows,
tables and kitchen routing, event publishing, online reservations, deposits,
check-in and fiscal-document orchestration.

> **Release status:** release candidate for controlled pilots and private beta.
> A production go-live still requires valid infrastructure, provider
> credentials, monitoring, verified backups and completion of
> `docs/operations/release-checklist.md`.

## Product flows

### Merchant operations

```text
Platform onboarding
→ merchant control center
→ event creation and publishing
→ reservation board
→ check-in
→ table session
→ POS order and payment
→ reservation completion
```

### Customer booking

```text
Public event catalog
→ availability
→ atomic table hold
→ customer details
→ free confirmation or Stripe Checkout
→ booking summary
```

### Fiscal processing

```text
Closed order
→ immutable fiscal snapshot
→ durable BullMQ job
→ A-Cube adapter
→ provider result and audit trail
```

## Architecture

```text
Next.js web ───────┐
Flutter POS ───────┼── NestJS API ── PostgreSQL
                   │        │
                   │        ├── Redis / BullMQ
                   │        ├── background-worker
                   │        └── fiscal-worker ── A-Cube
Public booking ────┘
                             └── Stripe
```

| Component                | Purpose                                                             |
| ------------------------ | ------------------------------------------------------------------- |
| `apps/api`               | REST API, authentication, tenant isolation and domain services      |
| `apps/web`               | public booking, merchant control center and platform administration |
| `apps/pos`               | Flutter POS client                                                  |
| `apps/background-worker` | asynchronous non-fiscal jobs                                        |
| `apps/fiscal-worker`     | fiscal-document processing                                          |
| `libs/database`          | Drizzle schema and PostgreSQL access                                |
| `libs/queue`             | BullMQ infrastructure                                               |

## Local development

Requirements:

- Node.js 22–24 and npm 10+
- Docker
- Flutter SDK only for the POS client

```powershell
Copy-Item .env.example .env
Copy-Item apps\web\.env.example apps\web\.env.local

npm run infra:up
npm run db:migrate
npm run db:seed
npm run start:dev
```

Start the web application in another terminal:

```powershell
npm --prefix apps/web run dev
```

## Verification

```powershell
npm run verify:release
npm run e2e:release
```

The release E2E creates isolated test data and refuses a remote API unless
`--allow-remote` is supplied explicitly.

## One-command VPS installation

Supported target: a clean Ubuntu or Debian VPS with two DNS records already
pointing to it.

After Phase 12 is merged into `main`, run:

```bash
curl -fsSL \
  https://raw.githubusercontent.com/alex-perrucci/fluxa-platform/main/scripts/vps/install.sh \
  -o /tmp/fluxa-install.sh && \
sudo bash /tmp/fluxa-install.sh
```

The installer asks for:

- web and API domains;
- certificate-notification email;
- initial platform-admin email;
- optional Stripe live credentials;
- optional A-Cube production token.

It then installs Docker, configures UFW, generates application secrets, builds
immutable images, starts PostgreSQL, Redis, API, workers, Next.js and Caddy,
applies migrations, creates the platform administrator, enables HTTPS, installs
the backup timer and runs production diagnostics.

Operational commands:

```bash
sudo bash /opt/fluxa/scripts/vps/doctor.sh
sudo bash /opt/fluxa/scripts/vps/backup.sh
sudo bash /opt/fluxa/scripts/vps/update.sh main
sudo bash /opt/fluxa/scripts/vps/rollback.sh
```

PostgreSQL and Redis are not published on the VPS network interface. Their
non-TLS connections are accepted only in the explicitly validated private
Docker network deployment mode.

## Manual production deployment

Production examples:

- managed infrastructure: `.env.production.example`;
- one-command VPS: `deploy/vps/.env.example`;
- web: `apps/web/.env.production.example`;
- API and workers image: `Dockerfile`;
- web image: `Dockerfile.web`.

Before deployment:

```powershell
npm run verify:production -- --env .env.production
npm run verify:release
```

After deployment:

```powershell
npm run smoke:production -- `
  --api-base-url https://api.example.com/api/v1 `
  --web-base-url https://app.example.com
```

Operational documentation:

- `docs/operations/deployment-runbook.md`
- `docs/operations/release-checklist.md`
- `docs/operations/backup-restore.md`
- `docs/operations/observability.md`

## Security

Secrets must never be committed. Production secrets belong in the host secret
store or the generated `deploy/vps/.env`, which is ignored and created with
mode `0600`.

Report vulnerabilities privately as described in `SECURITY.md`.

## License

The repository is currently marked `UNLICENSED`. No permission to copy,
redistribute or commercially reuse the source is granted by default.
