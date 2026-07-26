# Fluxa Phase 2 — Current Architecture

## Repository baseline

Fluxa is already a monorepo. Phase 2 must extend it rather than introduce a second platform.

Current applications:

- `apps/api`: NestJS REST API;
- `apps/fiscal-worker`: BullMQ worker for A-Cube fiscal documents;
- `apps/background-worker`: asynchronous non-fiscal work;
- `apps/pos`: Flutter POS application.

Shared infrastructure:

- PostgreSQL 17 as the authoritative database;
- Redis 7.4 and BullMQ for durable queues;
- Drizzle schema in `libs/database/src/schema.ts`;
- versioned migrations in `drizzle/`;
- shared configuration in `libs/config`;
- shared queue registration in `libs/queue`.

## Identity and tenancy

The backend already provides:

- users with Argon2id passwords;
- platform administrator flag;
- organizations;
- organization memberships;
- tenant roles;
- merchants;
- locations;
- devices and assignments;
- short JWT access tokens and rotated refresh tokens;
- global authentication, tenant and authorization guards.

The authenticated organization remains the tenant boundary. New event and reservation endpoints must derive `organizationId` from the authenticated context rather than accepting a free tenant identifier.

## Hospitality

The existing hospitality domain provides:

- dining areas;
- dining tables;
- current floor occupancy;
- table sessions;
- table movement with transactional locking;
- order linkage to table sessions;
- kitchen stations and kitchen tickets.

A reservation is not a table session. Reservations model future inventory for a specific event. A table session starts only when the guest is checked in and the table becomes operationally occupied.

## Commerce

The current commerce flow already includes:

- catalog and VAT rates;
- orders with immutable commercial snapshots;
- checkout state;
- cash and terminal payments;
- fiscal documents through A-Cube;
- non-fiscal print jobs and local Android printing.

Booking payments must be a separate domain from POS checkout payments. References may be added between reservations, orders and fiscal documents, but their state machines must remain distinct.

## Audit, outbox and queues

The platform already uses audit events, transactional outbox records, Redis and BullMQ. Phase 2 should reuse these mechanisms for:

- reservation lifecycle events;
- payment webhook processing;
- hold expiration;
- event availability changes;
- realtime publication.

PostgreSQL transactions and database constraints remain responsible for preventing overbooking. Realtime delivery is only a projection mechanism.

## Deployment constraints

The root package uses npm and Node `>=22 <25`. NestJS is configured as a monorepo containing API and workers. Docker builds a selected Nest application through `FLUXA_APP`.

The Flutter application has an independent package lifecycle under `apps/pos`.

Phase 2 must not introduce Nx, Turborepo or another package manager unless a later, explicit decision demonstrates a concrete need.

## Current gaps for Phase 2

The repository does not yet contain:

- `apps/web`;
- public events;
- event media;
- future table inventory by event;
- reservation holds;
- online booking payments;
- platform fee accounting;
- merchant event management;
- atomic platform onboarding;
- tenant-scoped realtime reservation feeds;
- reservation views in Flutter POS.
