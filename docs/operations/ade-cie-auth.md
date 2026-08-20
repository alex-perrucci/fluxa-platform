# ADE_WEB CIE push authentication

This phase bootstraps and refreshes the authenticated browser session used by the read-only ADE_WEB worker.

It does not submit fiscal documents.

## Recorded live flow

The worker follows the real flow captured with Playwright Codegen:

1. Agenzia delle Entrate login page
2. CIE tab
3. `Entra con CIE`
4. CIE username / codice fiscale
5. CIE password
6. `Procedi`
7. wait for manual approval in the CieID mobile app
8. `Prosegui`
9. search service `fatture`
10. open the first `Vai al servizio`
11. `Accedi`
12. select `Incaricato`
13. `Procedi`
14. select the configured incaricante by matching its codice fiscale inside the option payload
15. `Procedi`
16. `Conferma`
17. persist Playwright `storage-state.json`

The transient CIE SAML URL containing an `execution=...` value is intentionally not hard-coded. It is session-specific and Playwright follows the redirect produced by the real login flow.

## Runtime files

```text
/opt/fluxa/runtime/ade/
  auth-profile.json          # read-only selectors
  selectors.json             # existing dry-run selectors

/opt/fluxa/runtime/ade-session/
  storage-state.json         # writable, generated after CIE approval

/opt/fluxa/runtime/ade-secrets/
  cie-username               # read-only secret file
  cie-password               # read-only secret file
```

Never commit any of the files under `ade-session` or `ade-secrets`.

## Bootstrap runtime directories and CIE secrets

From the repository root on the VPS:

```bash
sudo bash scripts/vps/configure-ade-cie-auth.sh
```

The script prompts for the CIE username/codice fiscale and password without putting the password in shell history. It also installs the recorded selector profile from:

```text
docs/operations/ade-cie-auth-profile.example.json
```

## Environment

Set at least:

```text
ADE_AUTH_ENTRY_URL=https://iampe.agenziaentrate.gov.it/sam/UI/Login?realm=%2Fagenziaentrate&goto=%2Fsam%2FUI%2FLogout%3Frealm%3D%2Fagenziaentrate%26sessionexpired%3Dtrue
ADE_INCARICANTE_CF=<codice-fiscale-societa>
ADE_RUNTIME_DIR=/opt/fluxa/runtime/ade
ADE_SESSION_DIR=/opt/fluxa/runtime/ade-session
ADE_SECRET_DIR=/opt/fluxa/runtime/ade-secrets
ADE_MFA_TIMEOUT_MS=180000
```

`ADE_INCARICANTE_CF` is not used as the CIE identity. It identifies the entity that must be selected in the `Incaricato` work-profile step.

## Start/recreate the worker

```bash
docker compose -f deploy/vps/compose.production.yml --profile ade-fiscal up -d --build ade-fiscal-worker
```

## Trigger a session refresh

The worker is intentionally not published on a host port. Trigger the internal endpoint from inside the container:

```bash
docker compose -f deploy/vps/compose.production.yml --profile ade-fiscal exec -T ade-fiscal-worker \
  node -e "fetch('http://127.0.0.1:3010/internal/auth/refresh',{method:'POST',headers:{'x-fluxa-internal-token':process.env.ADE_WORKER_INTERNAL_TOKEN}}).then(async r=>{console.log(r.status);console.log(await r.text())})"
```

After the worker submits the CIE username/password, the CieID app should receive the approval request. Approve it manually on the phone.

A successful request ends with `SESSION_READY` and writes:

```text
/opt/fluxa/runtime/ade-session/storage-state.json
```

## Check authentication status

From a second shell while the refresh is in progress:

```bash
docker compose -f deploy/vps/compose.production.yml --profile ade-fiscal exec -T ade-fiscal-worker \
  node -e "fetch('http://127.0.0.1:3010/internal/auth/status',{headers:{'x-fluxa-internal-token':process.env.ADE_WORKER_INTERNAL_TOKEN}}).then(async r=>console.log(await r.text()))"
```

Expected progression:

```text
LOGIN_STARTING
WAITING_MFA
SESSION_READY
```

If the CieID approval is not completed within the configured timeout, the worker returns `ADE_CIE_MFA_TIMEOUT` and does not persist a new session.
