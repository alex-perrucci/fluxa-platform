# Security policy

## Supported version

Security fixes are applied to the current `main` branch and to the latest
deployed release candidate.

## Reporting a vulnerability

Do not open a public issue containing credentials, customer data, exploit
details or provider tokens.

Use GitHub's private vulnerability-reporting or security-advisory flow for this
repository. When that is unavailable, contact the repository owner privately
through the GitHub profile.

Include:

- affected component and commit;
- reproduction steps;
- expected and observed behavior;
- potential impact;
- logs or screenshots with secrets and personal data removed.

## Secret handling

- Never commit `.env` files, private keys, A-Cube credentials or Stripe keys.
- Rotate any secret that appears in chat, logs, screenshots or source history.
- Production secrets belong in the hosting provider's secret manager.
- Use distinct JWT access, refresh and session-hash secrets.
