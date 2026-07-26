# Fluxa Phase 2 — Implementation Plan

## Delivery principles

- extend the existing monorepo;
- keep PostgreSQL as the source of truth;
- preserve existing identity, tenant, merchant, location, hospitality, order, payment, printing and fiscal domains;
- implement one auditable phase at a time;
- keep every phase script idempotent and PowerShell 7 compatible;
- never modify `.github/workflows` without explicit approval;
- avoid secrets, generated binaries and destructive Git commands.

## Phase order

### Phase 00 — Audit and planning

Files:

- `scripts/phase-2/Phase2.Common.ps1`;
- `scripts/phase-2/00-audit.ps1`;
- `docs/phase-2/current-architecture.md`;
- `docs/phase-2/domain-boundaries.md`;
- `docs/phase-2/implementation-plan.md`.

No application code, migrations or dependencies are changed.

### Phase 01 — Web scaffold

Add `apps/web` with Next.js App Router, strict TypeScript and Tailwind. Integrate it minimally with the root npm lifecycle without converting the repository to Nx, Turborepo or pnpm.

Planned areas:

- public pages;
- authentication pages;
- merchant dashboard;
- platform-admin dashboard.

The browser receives only the public Fluxa API base URL. Authentication remains owned by Fluxa API.

### Phase 02 — Events and reservation schema

Add new enums and tables through a new Drizzle migration. Existing migrations remain immutable.

Planned tables:

- `events`;
- `event_media`;
- `event_table_inventory`;
- `event_booking_rules`;
- `reservations`;
- `reservation_holds`;
- `reservation_table_assignments`;
- `reservation_payments`;
- `platform_fee_rules`;
- `platform_fee_ledger`;
- `reservation_status_history`.

All money is stored as integer cents. Fee percentages are stored as basis points.

### Phase 03 — Merchant event API

Add a dedicated NestJS events module and import it into `apps/api/src/app.module.ts`.

Planned endpoint groups:

- event CRUD and lifecycle;
- media metadata and signed uploads;
- event table inventory;
- booking rules.

The module reuses current auth and tenant guards and adds location-level authorization.

### Phase 04 — Public booking engine

Add public read endpoints and reservation-hold commands. The allocation transaction must use PostgreSQL locking and constraints to prevent concurrent double booking.

BullMQ is used for hold expiration, while database timestamps remain authoritative.

### Phase 05 — Booking payments and platform fee

Add a booking-specific payment provider interface and a mock provider. Keep this domain separate from existing POS payment transactions.

The webhook is authenticated, idempotent, replay-safe and transactional. Only a verified webhook confirms a reservation.

### Phase 06 — Public web

Implement event discovery, event detail, availability, guest details, hold, payment and confirmation UI. Private reservation pages use high-entropy tokens and `noindex`.

### Phase 07 — Merchant dashboard

Implement event editing, inventory, reservation management, check-in, no-show, cancellation, refund requests, CSV export and financial summaries.

Initial access is limited to `OWNER`, `ADMIN` and `MANAGER`. CASHIER and WAITER permissions require an explicit product decision.

### Phase 08 — Platform admin

Add platform-admin-only onboarding and tenant operations. The onboarding endpoint executes one database transaction for organization, owner or invitation, membership, merchant, location and fee rule.

### Phase 09 — Realtime

Prefer Server-Sent Events for server-to-client updates unless implementation evidence shows bidirectional WebSocket communication is required.

Committed outbox events are published through Redis to tenant- and location-scoped streams. Clients retain fallback polling.

### Phase 10 — Flutter POS integration

Add today's reservations, arrival workflow, check-in, table assignment and conversion to an existing table session. The backend remains authoritative and check-in is idempotent.

### Phase 11 — Production hardening

Add public rate limits, abuse protection, retention, anonymization, operational metrics, dead-letter handling, deploy documentation and end-to-end validation.

## Existing files and modules to reuse

- `libs/database/src/schema.ts` and `drizzle/`;
- `libs/queue` for Redis and BullMQ;
- `apps/api/src/auth` and global guards;
- `apps/api/src/organizations`;
- `apps/api/src/merchants`;
- `apps/api/src/locations`;
- `apps/api/src/hospitality`;
- `apps/api/src/orders`;
- `apps/api/src/payments`;
- `apps/api/src/fiscal`;
- `apps/api/src/printing`;
- audit and outbox tables;
- `apps/background-worker` for non-fiscal asynchronous jobs;
- `apps/pos` for operational reservation views.

## Planned new backend modules

Names are provisional until Phase 03 confirms repository conventions:

- `apps/api/src/events`;
- `apps/api/src/reservations`;
- `apps/api/src/booking-payments`;
- `apps/api/src/platform-admin`;
- `apps/api/src/realtime`;
- background-worker processors for hold expiration and outbox publication.

## Planned public endpoints

- `GET /api/v1/public/events`;
- `GET /api/v1/public/events/:slug`;
- `GET /api/v1/public/events/:slug/availability`;
- `POST /api/v1/public/events/:slug/reservation-holds`;
- `POST /api/v1/public/reservations`;
- `GET /api/v1/public/reservations/:publicToken`;
- `POST /api/v1/public/reservations/:id/payment-session`;
- `POST /api/v1/webhooks/booking-payments`.

## Planned authenticated endpoints

- merchant event lifecycle endpoints;
- event media and inventory endpoints;
- reservation list, assignment, cancellation, no-show and check-in endpoints;
- platform onboarding and tenant-administration endpoints;
- authenticated realtime stream endpoints.

## Principal risks

### Overbooking

Mitigation: database constraints, row locking, deterministic table selection, transaction-scoped allocation and concurrent tests.

### Payment inconsistency

Mitigation: immutable amount snapshots, idempotency keys, unique provider webhook IDs and webhook-driven confirmation.

### Cross-tenant access

Mitigation: derive tenant from session, validate location membership, add tenant isolation tests and scope realtime channels.

### Hold expiration races

Mitigation: database expiry timestamps remain authoritative; the worker accelerates cleanup but is not the sole correctness mechanism.

### Table-session confusion

Mitigation: reservation and table-session state machines remain separate; conversion occurs only at check-in.

### Platform fee accounting

Mitigation: rule precedence and fee snapshots are persisted. Legal payout and fiscal treatment must be confirmed before a production payment provider is enabled.

### Object storage abuse

Mitigation: signed upload URLs, MIME and size validation, tenant-scoped object keys and no unsanitized SVG.

### Operational coupling

Mitigation: preserve one API and one database, reuse outbox and queues, and avoid a second backend inside Next.js.

## Decisions still required

Before the relevant phases, confirm:

1. whether the reservation price is a deposit, admission fee or table-booking fee;
2. cancellation and refund rules;
3. whether one booking may combine multiple tables after the MVP;
4. event capacity semantics when tables and standing places coexist;
5. payment provider and merchant-of-record model;
6. payout timing and provider-fee treatment;
7. exact permissions for CASHIER and WAITER;
8. object-storage provider for production;
9. customer notification channels;
10. fiscal treatment of booking payments and deposits.

These decisions do not block Phase 01 or the structural portion of Phase 02, but they block production payment and fiscal behavior.

## Verification strategy

Each phase runs only the checks relevant to its changes. The final hardening phase runs:

- backend lint, tests and build;
- web lint, tests and build;
- Flutter analyze, tests and supported builds;
- migration validation;
- concurrent booking tests;
- tenant and location isolation tests;
- webhook replay tests;
- realtime scoping tests;
- check-in and table-session conversion tests;
- onboarding rollback tests;
- regression checks for orders, payments, printing and A-Cube.
