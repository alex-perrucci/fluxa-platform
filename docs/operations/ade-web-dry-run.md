# ADE_WEB Phase D dry-run

Phase D is intentionally non-destructive. The worker can launch Chromium, load a Playwright storage state, navigate to one configured HTTPS entry URL and optionally verify read-only page markers.

It cannot fill fiscal forms, click buttons, submit a receipt, cancel a receipt or mutate Agenzia delle Entrate state.

## Runtime isolation

The service runs only with the Docker Compose profile `ade-fiscal` and is not published through Caddy or a host port.

Runtime files live outside Git, normally under:

```text
/opt/fluxa/runtime/ade/
  storage-state.json
  selectors.json
```

The directory is mounted read-only into the container as `/run/fluxa-ade`.

Never commit `storage-state.json`. It may contain authenticated cookies and browser storage.

## Required environment

Keep Phase D disabled by default:

```text
ADE_DRY_RUN_ENABLED=false
ADE_WORKER_INTERNAL_TOKEN=<long-random-secret>
ADE_WEB_ENTRY_URL=<https-entry-url>
ADE_RUNTIME_DIR=/opt/fluxa/runtime/ade
ADE_NAVIGATION_TIMEOUT_MS=20000
```

`ADE_WORKER_INTERNAL_TOKEN` must be at least 32 characters and must be generated as a random secret. Shorter values are treated as not configured.

`ADE_WEB_ENTRY_URL` has no repository default and must use HTTPS.

## Storage state

`storage-state.json` must be a regular JSON file with the Playwright storage-state shape:

```json
{
  "cookies": [],
  "origins": []
}
```

Phase D does not implement login or create this file. The session is supplied and rotated operationally outside the repository.

Symlinked, malformed or unreadable storage-state files are rejected. A configured path whose file has not been mounted yet is treated as a missing session, not as a corrupt one.

## Selector profile

Selectors are runtime configuration and are not committed in this phase. The only accepted profile keys are read-only markers:

```json
{
  "version": 1
}
```

Optional runtime keys are `authenticatedMarker` and `receiptAreaMarker`.

The selector file itself is optional. If it is absent, the dry-run can still validate browser startup, session loading and navigation without checking page markers.

Any other key, including a submit/click selector, makes the profile invalid. The worker only waits for configured markers to become visible; it never clicks or fills them.

## Health

`GET /health` reports only metadata such as browser/session/profile readiness. It never returns storage-state contents, selector values, internal tokens or the configured URL.

The worker always reports:

```text
operational=false
canSubmit=false
```

because fiscal submission is not implemented in Phase D.

## Dry-run endpoint

The internal endpoint is:

```text
POST /internal/dry-run
x-fluxa-internal-token: <ADE_WORKER_INTERNAL_TOKEN>
```

It accepts no fiscal payload. A successful result contains `submitAttempted=false` and `canSubmit=false` and reports only whether navigation and optional marker checks succeeded.

The endpoint allows only one run at a time.

## Error safety

Dry-run errors are classified as configuration, authentication/session, browser, navigation or selector mismatch errors.

Because Phase D contains no submit capability, navigation/marker failures can be retried manually without creating a fiscal document. Session failures require the runtime storage state to be renewed.

No Phase D error is connected to the fiscal queue or to automatic receipt issuance.
