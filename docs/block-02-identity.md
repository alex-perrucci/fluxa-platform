# Fluxa - Blocco 02: identità e multi-tenancy

## Ambito completato

- identità utente con password Argon2id;
- amministratore di piattaforma;
- organizzazioni e appartenenze;
- ruoli per organizzazione;
- esercenti e punti vendita;
- dispositivi e assegnazioni ai tenant;
- access token JWT brevi;
- refresh token opachi, ruotati e memorizzati solo come hash;
- rilevamento del riutilizzo dei refresh token;
- revoca per sessione, dispositivo e organizzazione;
- selezione e cambio dell'organizzazione attiva;
- guardie globali per autenticazione, tenant e autorizzazione;
- audit degli eventi amministrativi;
- test automatici e smoke test end-to-end.

## Ruoli

- `OWNER`
- `ADMIN`
- `MANAGER`
- `CASHIER`
- `WAITER`
- `ACCOUNTANT`
- `SUPPORT_READONLY`

Il ruolo è sempre associato a una membership nell'organizzazione. Un utente può
avere ruoli differenti in organizzazioni differenti.

## Isolamento multi-tenant

Gli endpoint commerciali non accettano un `organization_id` libero dal client:
usano l'organizzazione presente nella sessione autenticata. Quando un ID
organizzazione compare nel percorso, viene confrontato con il tenant attivo.

Merchant, location e assegnazioni dei dispositivi vengono filtrati sempre per
`organization_id` lato database.

## Sessioni

L'access token JWT contiene identificativi di utente, sessione, tenant e
membership, ma il backend rilegge sessione e ruolo dal database a ogni richiesta.
La revoca e i cambi di ruolo hanno quindi effetto immediato.

Il refresh token ha forma `sessionId.secret`, viene salvato solo come SHA-256 e
ruotato a ogni utilizzo. Il riutilizzo del token precedente revoca le sessioni
attive del dispositivo.

## Contesto operativo del dispositivo

`GET /api/v1/devices/me` continua a restituire l'identità tecnica del device.
Il contesto operativo del tenant attivo è esposto separatamente da:

```http
GET /api/v1/devices/me/assignment
```

L'endpoint usa il device, l'utente e l'organizzazione presenti nella sessione;
non accetta identificativi liberi dal client e non richiede ruoli amministrativi.
La risposta distingue:

- `READY`;
- `LOCATION_REQUIRED`;
- `ASSIGNMENT_REVOKED`;
- `LOCATION_INACTIVE`.

L'assenza del tenant produce `TENANT_CONTEXT_REQUIRED`; l'assenza del device o
dell'assignment produce rispettivamente `DEVICE_NOT_FOUND` o
`DEVICE_ASSIGNMENT_NOT_FOUND`.

Il contratto completo per il POS è documentato in
`docs/frontend-block-02-device-location-contract.md`.

## Endpoint principali

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/switch-organization`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/auth/me`
- `GET /api/v1/devices/me`
- `GET /api/v1/devices/me/assignment`
- `GET|POST /api/v1/organizations`
- `GET|POST|PATCH /api/v1/organizations/:id/members`
- `GET|POST|PATCH /api/v1/merchants`
- `GET|POST|PATCH /api/v1/locations`
- `GET|PUT|DELETE /api/v1/devices`

## Verifiche del contratto device/location

```powershell
npm run test:device-context
npm run smoke:device-context
```

## Nota per la produzione

Il bootstrap admin è destinato soltanto alla prima inizializzazione. In
produzione la password va ruotata e le variabili di bootstrap vanno rimosse dal
runtime dopo aver creato l'amministratore.
