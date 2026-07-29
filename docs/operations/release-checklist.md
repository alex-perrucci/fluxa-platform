# Release checklist

## Code and CI

- [ ] Pull request contains a summary, risk and rollback plan.
- [ ] `Fluxa CI / Backend quality` is green.
- [ ] `Fluxa CI / Web quality` is green.
- [ ] `Fluxa CI / Release E2E` is green.
- [ ] VPS deployment structural verification passes.
- [ ] No secret, `.env`, `.next`, local bootstrap or generated backup is tracked.
- [ ] Migration integrity passes.

## Configuration

- [ ] Production environment verifier passes.
- [ ] `RELEASE_SHA` matches the deployed commit.
- [ ] `RELEASE_VERSION` matches the release.
- [ ] Infrastructure trust mode matches the deployment topology.
- [ ] CORS contains only approved HTTPS origins.
- [ ] Swagger is disabled.
- [ ] Reverse-proxy trust is enabled only behind the controlled proxy.
- [ ] JWT and session secrets are distinct.
- [ ] Stripe live credentials are configured when Stripe is enabled.
- [ ] A-Cube production credentials are configured when fiscal processing is enabled.
- [ ] `BOOKING_WEB_BASE_URL` is the public HTTPS web origin.

## Data and providers

- [ ] Pre-deploy PostgreSQL backup exists.
- [ ] Backup checksum and PostgreSQL archive catalog are valid.
- [ ] Daily `fluxa-backup.timer` is active on a VPS deployment.
- [ ] Migration has an explicit forward-fix or rollback decision.
- [ ] Stripe webhook delivery is successful when enabled.
- [ ] A-Cube production connectivity is verified when enabled.
- [ ] No sandbox credentials are present in an enabled production provider.

## Deployment

- [ ] API, web and workers use immutable image tags.
- [ ] PostgreSQL and Redis are not exposed publicly.
- [ ] Database migration ran once.
- [ ] API readiness reports PostgreSQL and Redis `up`.
- [ ] Release SHA and version are visible in health output.
- [ ] Background worker is running.
- [ ] Fiscal worker is running when A-Cube is enabled.
- [ ] Caddy has issued valid HTTPS certificates.
- [ ] Public catalog and booking pages return `200`.
- [ ] `scripts/vps/doctor.sh` or the managed production smoke passes.
- [ ] Logs and alerts are active.

## Pilot acceptance

- [ ] Organization onboarding.
- [ ] OWNER login and organization switch.
- [ ] Event creation and publishing.
- [ ] Public free booking.
- [ ] Stripe deposit booking when enabled.
- [ ] Check-in and POS table session.
- [ ] Seating, session close and reservation completion.
- [ ] No-show.
- [ ] Fiscal document in the intended provider environment when enabled.
- [ ] Printer and receipt flow on the target device.
