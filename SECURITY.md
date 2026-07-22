# Security policy

## Reporting

Do not open public issues containing credentials, customer data, fiscal payloads or production logs. Report vulnerabilities privately to the repository owner with the affected component, reproduction steps and impact.

## Secret handling

- Never commit `.env`, `key.properties`, keystores, private keys or A-Cube credentials.
- Store production secrets in the deployment secret manager and GitHub environment secrets.
- Rotate a secret immediately if it appears in Git history or logs.
- Use distinct values for access tokens, refresh tokens and session IP hashing.

## Supported branch

Security fixes are applied to `main`. Production releases must be built from a reviewed commit whose CI checks pass.
