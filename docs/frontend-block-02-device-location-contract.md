# Frontend Blocco 02 — Contratto device/location

## Decisione

Il POS usa un endpoint dedicato invece di modificare `GET /devices/me`:

```http
GET /api/v1/devices/me/assignment
Authorization: Bearer <access-token>
```

La scelta mantiene retrocompatibile il contratto del dispositivo corrente e
separa l'identità tecnica del device dal suo contesto operativo tenant/location.
L'endpoint non accetta `deviceId` o `organizationId`: usa esclusivamente
`auth.deviceId`, `auth.userId` e il tenant attivo della sessione.

Non sono richiesti ruoli amministrativi. Qualsiasi membership attiva, inclusi
`CASHIER` e `WAITER`, può leggere esclusivamente il contesto del proprio device.

## Risposta `200 OK`

```json
{
  "operationalStatus": "READY",
  "device": {
    "id": "33333333-3333-4333-8333-333333333333",
    "installationId": "pos-parma-01",
    "name": "Cassa Parma 1",
    "platform": "WINDOWS",
    "model": "Surface Pro",
    "appVersion": "1.0.0",
    "status": "ACTIVE",
    "lastSeenAt": "2026-07-21T10:00:00.000Z"
  },
  "assignment": {
    "id": "44444444-4444-4444-8444-444444444444",
    "organizationId": "11111111-1111-4111-8111-111111111111",
    "locationId": "55555555-5555-4555-8555-555555555555",
    "active": true,
    "assignedAt": "2026-07-20T10:00:00.000Z",
    "revokedAt": null,
    "updatedAt": "2026-07-21T09:00:00.000Z"
  },
  "location": {
    "id": "55555555-5555-4555-8555-555555555555",
    "code": "PARMA",
    "name": "Parma Centro",
    "timezone": "Europe/Rome",
    "status": "ACTIVE"
  }
}
```

## Stati operativi

| Stato                | Significato                                                                   | Comportamento POS                           |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| `READY`              | Assignment attivo e location attiva                                           | Abilita le funzioni operative               |
| `LOCATION_REQUIRED`  | Assignment tenant attivo con `locationId = null`                              | Mostra setup richiesto; non entrare nel POS |
| `ASSIGNMENT_REVOKED` | Record di assignment presente ma non attivo                                   | Cancella la location locale e blocca il POS |
| `LOCATION_INACTIVE`  | `locationId` presente, ma location inattiva, mancante o incoerente col tenant | Cancella la location locale e blocca il POS |

`locationId = null` non rappresenta un setup completato.

## Errori

### `403 TENANT_CONTEXT_REQUIRED`

La sessione non ha un'organizzazione attiva. Il frontend deve mostrare la scelta
organizzazione e non riusare una location salvata da un tenant precedente.

```json
{
  "code": "TENANT_CONTEXT_REQUIRED",
  "message": "Seleziona un'organizzazione prima di usare questa risorsa."
}
```

### `404 DEVICE_NOT_FOUND`

`auth.deviceId` non identifica un device appartenente all'utente autenticato.
Il frontend deve terminare la sessione locale e ripetere il bootstrap/login.

### `404 DEVICE_ASSIGNMENT_NOT_FOUND`

Il device esiste, ma non ha alcun assignment per il tenant attivo. Il frontend
deve cancellare la location locale e mostrare che serve un intervento
amministrativo.

### `401 SESSION_NOT_ACTIVE`

La revoca amministrativa dell'assignment invalida le sessioni attive del device
per quell'organizzazione. Il frontend deve cancellare token e location locale e
richiedere un nuovo accesso.

## Cambio organizzazione

Dopo `POST /api/v1/auth/switch-organization`, il frontend deve scartare sempre la
location memorizzata e richiamare `GET /devices/me/assignment` con il nuovo access
token. La query è filtrata esclusivamente per il tenant attivo, quindi non può
restituire l'assignment dell'organizzazione precedente.

## Bootstrap POS

```text
ripristina o crea la sessione
→ GET /api/v1/auth/me
→ se il tenant manca: scelta organizzazione
→ GET /api/v1/devices/me
→ GET /api/v1/devices/me/assignment
→ READY: persisti locationId insieme a organizationId e avvia il POS
→ LOCATION_REQUIRED: cancella locationId e mostra setup richiesto
→ ASSIGNMENT_REVOKED o LOCATION_INACTIVE: cancella locationId e blocca il POS
→ 401/403/404: cancella la location locale; gestisci sessione o setup in base al codice
```

La location persistita è valida soltanto se associata allo stesso
`organizationId` della sessione e se l'ultima risposta ha
`operationalStatus = READY`.
