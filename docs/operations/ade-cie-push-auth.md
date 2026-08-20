# ADE_WEB CIE push authentication

This phase refreshes the Agenzia delle Entrate Playwright session through CIE level 2 without automating the second factor.

The worker may fill the CIE username/password and submit them. The user must approve the push notification in the official CieID app. The worker then waits for the authenticated AdE page and persists the resulting Playwright `storage-state.json`.

No fiscal document can be submitted by this authentication flow.

## Runtime directories

Keep configuration, session and identity secrets separate:

```text
/opt/fluxa/runtime/ade/               # read-only in container
  selectors.json
  auth-profile.json

/opt/fluxa/runtime/ade-session/       # writable only by ADE worker
  storage-state.json                  # created/refreshed by Playwright

/opt/fluxa/runtime/ade-secrets/       # read-only in container
  cie-username
  cie-password
```

Never commit any of these runtime files.

Recommended host permissions: directories `0700`; secret files `0600` and owned by the account used to run the deployment.

## Environment

```text
ADE_DRY_RUN_ENABLED=true
ADE_WORKER_INTERNAL_TOKEN=<at-least-32-random-characters>
ADE_WEB_ENTRY_URL=<Documento Commerciale or authenticated AdE HTTPS entry>
ADE_AUTH_ENTRY_URL=<public AdE HTTPS page from which CIE login starts>
ADE_RUNTIME_DIR=/opt/fluxa/runtime/ade
ADE_SESSION_DIR=/opt/fluxa/runtime/ade-session
ADE_SECRET_DIR=/opt/fluxa/runtime/ade-secrets
ADE_NAVIGATION_TIMEOUT_MS=20000
ADE_MFA_TIMEOUT_MS=180000
```

The CIE username and password are not environment variables. Put the username (for example the tax code when accepted by CIE) in `cie-username` and the CIE password in `cie-password`.

## Authentication selector profile

`auth-profile.json` is runtime-only. Do not guess selectors: capture them from the live flow using Playwright Codegen and keep them outside Git.

Schema:

```json
{
  "version": 1,
  "enterWithCieSelector": "<selector>",
  "level2Selector": "<optional selector if a CIE level-2 choice is required>",
  "usernameSelector": "<selector>",
  "passwordSelector": "<selector>",
  "credentialsSubmitSelector": "<selector>",
  "waitingMfaMarker": "<optional marker shown after push is started>",
  "postMfaContinueSelector": "<optional browser confirmation shown after phone approval>",
  "authenticatedMarker": "<marker only visible after successful AdE authentication>"
}
```

The profile accepts Playwright locator strings supported by `page.locator()`, such as stable CSS selectors or Playwright selector engines. Prefer stable IDs/names when present. Avoid positional selectors.

## Endpoints

All endpoints below require `x-fluxa-internal-token`.

### Refresh the session

```http
POST /internal/auth/refresh
```

The request stays open while CIE approval is pending. Expected lifecycle:

```text
LOGIN_STARTING
  -> credentials submitted
WAITING_MFA
  -> user approves CieID push on phone
SESSION_READY
```

On success:

```json
{
  "status": "SESSION_READY",
  "finalUrl": "https://...",
  "sessionSaved": true
}
```

### Check status

```http
GET /internal/auth/status
```

Possible states:

```text
IDLE
LOGIN_STARTING
WAITING_MFA
SESSION_READY
FAILED
```

The status endpoint never returns credentials, cookies or selector values.

## First live validation

1. Populate `auth-profile.json` from the real CIE login flow.
2. Provision `cie-username` and `cie-password` as host secret files.
3. Ensure `/opt/fluxa/runtime/ade-session` is writable by the container user.
4. Start the `ade-fiscal` Compose profile.
5. Call `POST /internal/auth/refresh` from inside the application network.
6. Confirm the CieID push on the phone.
7. Verify the response is `SESSION_READY`.
8. Call the existing read-only `/internal/dry-run` and verify the authenticated/document-commercial markers.

Do not proceed to fiscal form filling or submit until both authentication refresh and the read-only dry-run are reliable.
