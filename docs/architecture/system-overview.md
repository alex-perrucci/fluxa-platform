# Fluxa system overview

## Boundaries

Fluxa separates synchronous customer and operator requests from durable
background work.

- PostgreSQL is the source of truth.
- Redis coordinates BullMQ workers and short-lived queue state.
- The API owns validation, authentication, authorization and tenant scope.
- Workers execute asynchronous fiscal and non-fiscal jobs.
- Next.js provides public booking, merchant control center and platform admin.
- Flutter provides the POS client.

## Core invariants

- Every tenant-owned record is scoped by `organization_id`.
- Future reservations are not table sessions.
- Check-in creates the operational table session.
- Database transactions and locks prevent overbooking and duplicate sessions.
- Realtime refresh improves UX but is never the consistency mechanism.
- Provider webhooks are verified and idempotent.
- Audit and outbox events are written with the state transition.

## External systems

- Stripe: reservation deposits and payment webhooks.
- A-Cube: fiscal-document submission.
- Object storage: event media, when configured.
- Hosting platform: web, API and workers as separate processes.

## Release topology

```text
web service
api service
background-worker service
fiscal-worker service
managed PostgreSQL
managed Redis
Stripe webhook → API
A-Cube API ← fiscal-worker
```
