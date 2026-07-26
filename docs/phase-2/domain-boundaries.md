# Fluxa Phase 2 — Domain Boundaries

## Existing domains to reuse

### Identity

Authoritative entities:

- `users`;
- `organizations`;
- `organization_memberships`;
- roles and session context.

Phase 2 must not create a separate web identity store. Merchant and platform web users authenticate through Fluxa.

### Merchant and location

Authoritative entities:

- `merchants` for the legal or commercial operator;
- `locations` for physical venues.

An event belongs to an existing organization and location. A new generic `restaurants` table would duplicate current ownership and location semantics and is forbidden.

### Hospitality

Authoritative entities:

- `dining_areas`;
- `dining_tables`;
- `table_sessions`.

Event inventory references existing tables. It may enable or disable a table for one event, but must not duplicate the table definition.

### Orders, POS payments, printing and fiscalization

These remain operational domains after arrival:

1. reservation confirmation;
2. check-in;
3. table-session opening;
4. order creation;
5. POS payment;
6. fiscal document when applicable;
7. operational printing.

A booking deposit or reservation fee is not automatically a POS checkout payment or A-Cube fiscal receipt.

## New domains

### Events

Owns:

- event identity and slug;
- publication lifecycle;
- schedule and timezone;
- public content;
- media metadata;
- booking window;
- event-specific table inventory;
- event-specific booking rules.

Suggested statuses:

- `DRAFT`;
- `PUBLISHED`;
- `SOLD_OUT`;
- `CANCELLED`;
- `COMPLETED`;
- `ARCHIVED`.

### Reservations

Owns:

- guest contact snapshot;
- party size;
- reservation public token;
- hold and confirmation lifecycle;
- event table assignment;
- check-in, no-show and cancellation state;
- optional link to a table session after arrival.

Suggested statuses:

- `PENDING_PAYMENT`;
- `CONFIRMED`;
- `CHECKED_IN`;
- `SEATED`;
- `COMPLETED`;
- `CANCELLED`;
- `EXPIRED`;
- `NO_SHOW`;
- `REFUND_PENDING`;
- `REFUNDED`.

### Booking payments

Owns online booking-money movement and must remain separate from POS checkout payments.

It records immutable cent-based snapshots for:

- customer amount;
- platform fee;
- merchant gross amount;
- provider fee when known;
- merchant net amount;
- refunded amount;
- currency;
- provider identifiers;
- idempotency and webhook identifiers.

The browser redirect never confirms payment. Only a verified provider webhook may transition the reservation to `CONFIRMED`.

### Platform fees

Owns configurable fee rules and ledger entries.

Resolution order:

1. event-specific rule;
2. organization-specific rule;
3. platform default rule.

The resolved rule and basis points must be snapshotted on the reservation payment so later configuration changes do not rewrite history.

### Platform administration

Owns platform-wide tenant onboarding and suspension. It must be protected by the existing `platformAdmin` identity property, not by a tenant `ADMIN` role.

The onboarding command must atomically create or link:

- organization;
- owner account or invitation;
- OWNER membership;
- merchant;
- location;
- initial platform fee rule.

## Consistency boundaries

### Reservation allocation

The authoritative operation is a PostgreSQL transaction that:

- verifies the event is bookable;
- expires stale holds;
- selects an eligible event-table inventory row;
- locks the chosen inventory;
- creates the hold or reservation assignment;
- records audit and outbox events.

SSE, WebSocket and Redis do not prevent overbooking.

### Check-in

Check-in must be idempotent and verify:

- reservation status is `CONFIRMED`;
- authenticated tenant and location match;
- assigned table is still usable;
- the reservation has not already opened a table session.

The reservation stores the resulting `tableSessionId` after successful conversion.

## Public-data boundary

Public endpoints may expose only event information required for booking. Internal IDs, tenant configuration, audit details and other guests' data must never be returned.

Reservation lookup uses a high-entropy public token rather than a sequential identifier or customer email alone.

## Realtime boundary

Realtime messages are tenant- and location-scoped projections of committed outbox events. Payloads should contain identifiers, status and aggregate counts, avoiding unnecessary personal data. Clients must re-fetch authoritative details from the API.
