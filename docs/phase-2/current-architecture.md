# Fluxa Phase 2 — Architettura corrente

Documento generato da scripts/phase-2/00-audit.ps1.

## Contesto Git

- Branch analizzato: main
- Working tree: Contiene 2 modifica/e locale/i
- File versionati rilevati: 451

## Toolchain

- git version 2.49.0.windows.1
- Node: v24.14.0
- npm: 11.9.0
- Package manager: npm con package-lock.json
- Versione applicazione backend: 0.8.0

## Applicazioni

- apps/api
- apps/background-worker
- apps/fiscal-worker
- apps/pos

apps/web presente: False

## Progetti NestJS

- api: apps/api/src
- fiscal-worker: apps/fiscal-worker/src
- background-worker: apps/background-worker/src

Il backend è già una monorepo NestJS con API, fiscal worker e background worker.

## Moduli API rilevati

- auth
- catalog
- devices
- fiscal
- health
- hospitality
- locations
- merchants
- orders
- organizations
- payments
- printing

## Database

- ORM/schema: Drizzle ORM
- Schema autorevole: libs/database/src/schema.ts
- Directory migrazioni: drizzle/
- File di migrazione/metadati rilevati: 19
- PostgreSQL: previsto dal progetto

## Redis e code

- BullMQ configurato: True
- Coda fiscale rilevata: True
- Coda background rilevata: True

## Domini rilevati nello schema

- Authentication: True
- Organizations: True
- Memberships: True
- Merchants: True
- Locations: True
- DiningAreas: True
- DiningTables: True
- TableSessions: True
- Orders: True
- Payments: True
- Printing: True
- Fiscal: True
- Audit: True
- Outbox: True

## Sicurezza applicativa

- Guard JWT globale rilevata: True
- Guard tenant globale rilevata: True
- Guard ruoli globale rilevata: True
- Rate limiting rilevato: True

## Docker locale

- docker-compose.yml presente: True
- PostgreSQL e Redis devono restare infrastrutture condivise per POS e web.

## Script npm rilevati

- build: nest build --all
- build:api: nest build api
- build:background-worker: nest build background-worker
- build:fiscal-worker: nest build fiscal-worker
- db:generate: drizzle-kit generate
- db:migrate: drizzle-kit migrate
- db:seed: ts-node -r tsconfig-paths/register scripts/seed-block-02.ts
- db:seed:catalog: ts-node -r tsconfig-paths/register scripts/seed-block-03.ts
- db:studio: drizzle-kit studio
- format: prettier --write "apps/**/*.ts" "libs/**/*.ts" "scripts/**/*.ts" "*.ts"
- infra:down: docker compose down
- infra:reset: docker compose down -v --remove-orphans
- infra:up: docker compose up -d postgres redis
- lint: eslint "{apps,libs,scripts}/**/*.ts" --max-warnings=0
- security:secrets: node scripts/check-secrets.mjs
- smoke:catalog: node scripts/smoke-block-03.mjs
- smoke:device-context: node scripts/smoke-device-assignment-context.mjs
- smoke:fiscal: node scripts/smoke-block-08.mjs
- smoke:hospitality: node scripts/smoke-block-06.mjs
- smoke:orders: node scripts/smoke-block-04.mjs
- smoke:payments: node scripts/smoke-block-05.mjs
- smoke:printing: node scripts/smoke-block-07.mjs
- smoke:production: node scripts/smoke-production.mjs
- start:dev: concurrently -k -n API,FISCAL,BACKGROUND -c blue,magenta,green "npm:start:dev:api" "npm:start:dev:fiscal" "npm:start:dev:background"
- start:dev:api: nest start api --watch
- start:dev:background: nest start background-worker --watch
- start:dev:fiscal: nest start fiscal-worker --watch
- start:prod:api: node dist/apps/api/main.js
- start:prod:background: node dist/apps/background-worker/main.js
- start:prod:fiscal: node dist/apps/fiscal-worker/main.js
- start:render: concurrently -k -n API,FISCAL,BACKGROUND -c blue,magenta,green "npm:start:prod:api" "npm:start:prod:fiscal" "npm:start:prod:background"
- test: jest --runInBand
- test:catalog: jest apps/api/src/catalog --runInBand
- test:cov: jest --coverage
- test:device-context: jest apps/api/src/devices --runInBand
- test:fiscal: jest apps/api/src/fiscal --runInBand
- test:hospitality: jest apps/api/src/hospitality --runInBand
- test:identity: jest apps/api/src/auth libs/config/src/environment.spec.ts --runInBand
- test:orders: jest apps/api/src/orders --runInBand
- test:payments: jest apps/api/src/payments --runInBand
- test:printing: jest apps/api/src/printing --runInBand
- test:watch: jest --watch
- verify: npm run lint && npm test && npm run build
- verify:ci: npm run security:secrets && npm run lint && npm test && npm run build
- verify:production: node scripts/verify-production-config.mjs

## Conclusione

La Fase 2 deve estendere il backend corrente e non creare un secondo backend o un secondo database.
