# Production deployment runbook

## 1. Pre-deploy gate

Run against the exact commit to deploy:

```powershell
npm ci
npm --prefix apps/web ci
npm run verify:release
npm run verify:production -- --env .env.production
```

Create and verify a database backup before applying migrations:

```powershell
npm run backup:postgres -- --label pre-deploy
npm run backup:verify -- --file <BACKUP_FILE>
```

## 2. Build immutable images

Backend and workers:

```powershell
docker build -t fluxa-backend:<GIT_SHA> .
```

Web:

```powershell
docker build `
  -f Dockerfile.web `
  --build-arg FLUXA_API_BASE_URL=https://api.example.com/api/v1 `
  -t fluxa-web:<GIT_SHA> .
```

Use the same backend image with:

- `FLUXA_APP=api`
- `FLUXA_APP=background-worker`
- `FLUXA_APP=fiscal-worker`

## 3. Migration policy

Apply migrations once, before shifting traffic to the new API:

```powershell
npm run db:migrate
```

Rules:

- prefer additive and backward-compatible migrations;
- deploy schema expansion before code that requires it;
- do not edit a migration already applied to an environment;
- destructive changes require a backup and a reviewed data migration;
- Drizzle rollback is not automatic: roll back application images and
  forward-fix the database unless an explicit reviewed rollback SQL exists.

## 4. Deployment order

1. PostgreSQL and Redis connectivity.
2. Database backup.
3. Migration job.
4. API.
5. Background worker.
6. Fiscal worker.
7. Web.
8. Stripe webhook endpoint.
9. A-Cube provider connectivity.
10. Production smoke.

## 5. Post-deploy smoke

```powershell
npm run smoke:production -- `
  --api-base-url https://api.example.com/api/v1 `
  --web-base-url https://app.example.com
```

For the optional authenticated smoke, set a dedicated low-privilege account:

```powershell
$env:FLUXA_SMOKE_EMAIL = "<SMOKE_ACCOUNT>"
$env:FLUXA_SMOKE_PASSWORD = "<SECRET>"
$env:FLUXA_SMOKE_ORGANIZATION_ID = "<OPTIONAL_ORGANIZATION_ID>"
```

## 6. Rollback

Application rollback:

1. stop traffic to the failing release;
2. redeploy the previous immutable image tags;
3. verify `/health/live` and `/health/ready`;
4. run the production smoke;
5. preserve logs and provider event IDs.

Database rollback:

- never restore over the live database without an approved incident plan;
- prefer a forward fix;
- for catastrophic corruption, restore into a separate database first,
  validate it, then execute the cutover plan.
