# Observability and alerting

Fluxa already emits structured Pino logs, request IDs and health checks.
Production must centralize and retain those signals.

## Required log fields

- timestamp and level;
- service name;
- release SHA and version;
- request ID;
- organization ID when safe;
- route and HTTP status;
- job name and job ID;
- provider event ID;
- error code and stack.

Authorization headers, cookies, passwords, refresh tokens and set-cookie values
must remain redacted.

## Minimum alerts

- `/health/ready` unavailable or degraded;
- sustained API `5xx` rate;
- PostgreSQL or Redis connection failures;
- background or fiscal job failures and retry exhaustion;
- Stripe signature failures or webhook backlog;
- A-Cube authentication/submission failures;
- reservation conflict or payment failure anomaly;
- newest verified database backup older than the recovery target;
- disk, memory or restart loop on any service.

## Release correlation

Set:

```text
RELEASE_SHA=<GIT_SHA>
RELEASE_VERSION=<SEMVER>
```

The health endpoints expose both values. Every hosting service should use the
same values for a release.

## Incident evidence

Preserve:

- request ID;
- organization and location IDs;
- reservation/order/fiscal document IDs;
- provider event IDs;
- release SHA;
- sanitized logs;
- timestamps in UTC.

Do not paste production secrets or customer personal data into public issues.
