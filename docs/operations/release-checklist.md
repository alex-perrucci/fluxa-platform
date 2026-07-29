# Release checklist

## Code and CI

- [ ] Pull request contains a summary, risk and rollback plan.
- [ ] `Fluxa CI / Backend quality` is green.
- [ ] `Fluxa CI / Web quality` is green.
- [ ] `Fluxa CI / Release E2E` is green.
- [ ] No secret, `.env`, `.next`, local bootstrap or generated backup is tracked.
- [ ] Migration integrity passes.

## Configuration

- [ ] Production environment verifier passes.
- [ ] `RELEASE_SHA` matches the deployed commit.
- [ ] `RELEASE_VERSION` matches the release.
- [ ] CORS contains only approved HTTPS origins.
- [ ] Swagger is disabled.
- [ ] JWT and session secrets are distinct.
- [ ] Stripe live key and webhook secret are configured.
- [ ] `BOOKING_WEB_BASE_URL` is the public HTTPS web origin.
- [ ] A-Cube production credentials and HTTPS endpoints are configured.

## Data and providers

- [ ] Pre-deploy PostgreSQL backup exists.
- [ ] Backup checksum and archive catalog are valid.
- [ ] Migration has an explicit forward-fix or rollback decision.
- [ ] Stripe webhook delivery is successful.
- [ ] A-Cube production connectivity is verified.
- [ ] No sandbox credentials are present.

## Deployment

- [ ] API, web and workers use immutable image tags.
- [ ] Database migration ran once.
- [ ] API readiness reports PostgreSQL and Redis `up`.
- [ ] Release SHA and version are visible in health output.
- [ ] Background and fiscal workers are running.
- [ ] Public catalog and booking pages return `200`.
- [ ] Authenticated production smoke passes.
- [ ] Logs and alerts are active.

## Pilot acceptance

- [ ] Organization onboarding.
- [ ] OWNER login and organization switch.
- [ ] Event creation and publishing.
- [ ] Public free booking.
- [ ] Stripe deposit booking.
- [ ] Check-in and POS table session.
- [ ] Seating, session close and reservation completion.
- [ ] No-show.
- [ ] Fiscal document in the intended provider environment.
- [ ] Printer and receipt flow on the target device.
