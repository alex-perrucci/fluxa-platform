## Summary

Describe the user-visible or operational change.

## Verification

- [ ] Backend lint, tests and build
- [ ] Web lint, tests and build
- [ ] Migration integrity check
- [ ] Release E2E where applicable
- [ ] No secrets or local-only files
- [ ] Production configuration impact documented

## Database

- [ ] No migration
- [ ] Additive/backward-compatible migration
- [ ] Destructive change reviewed with backup and rollback plan

## Deployment notes

List new environment variables, worker changes, provider configuration and
post-deploy smoke steps.

## Risk and rollback

Describe the main failure mode and the exact application rollback or
forward-fix strategy.
