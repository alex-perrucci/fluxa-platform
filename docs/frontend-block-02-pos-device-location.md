# Frontend Blocco 02 — Contesto operativo device/location

## Fonte backend

Il contratto è quello disponibile su `main` dopo il merge della PR #8:

```http
GET /api/v1/devices/me/assignment
Authorization: Bearer <access-token>
```

Il client non invia `deviceId`, `organizationId` o `locationId`.

## Bootstrap

```text
sessione/token
→ GET /auth/me
→ verifica tenant
→ GET /devices/me
→ GET /devices/me/assignment
→ applicazione del gate operativo
```

Soltanto `operationalStatus = READY`, con assignment attivo e location `ACTIVE`
coerente con `assignment.locationId`, abilita le route operative.

## Persistenza

Il secure storage conserva soltanto:

- `locationId`;
- `organizationId` associato alla location.

La cache non abilita mai il POS autonomamente: a ogni bootstrap viene ricontrollato
il backend. La location viene cancellata prima dello switch organizzazione, al
logout, alla scadenza della sessione e per ogni stato o errore non operativo.

## Stati UI

- `READY`: Home e Ordini accessibili.
- `LOCATION_REQUIRED`: setup amministrativo richiesto.
- `ASSIGNMENT_REVOKED`: funzioni operative bloccate.
- `LOCATION_INACTIVE`: funzioni operative bloccate.
- `DEVICE_ASSIGNMENT_NOT_FOUND`: dispositivo non assegnato al tenant.
- `TENANT_CONTEXT_REQUIRED`: ritorno alla selezione organizzazione.
- `DEVICE_NOT_FOUND` e `SESSION_NOT_ACTIVE`: cancellazione sessione locale e login.

Le impostazioni tecniche restano accessibili negli stati bloccati per visualizzare
ambiente, API URL, device, tenant, stato operativo e location, oltre a consentire
retry e logout.

## Sicurezza

Il POS non usa `GET /devices`, non mostra un selettore libero delle location e non
riutilizza la location appartenente a un tenant precedente.
