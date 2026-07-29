# Fluxa Phase 2 — Fase 08 True Control Center

## Risultato

La Fase 08 trasforma lo scaffold Next.js in un’applicazione operativa con due
aree separate.

### Platform Control Center

Percorsi:

```text
/platform-admin
/platform-admin/organizations
/platform-admin/organizations/new
/platform-admin/organizations/[organizationId]
```

Il wizard di onboarding crea in una sola transazione serializzabile:

```text
organization
merchant
location
customer OWNER user
OWNER membership
dining area
initial dining tables
audit event
outbox event
```

Il platform admin che avvia l’onboarding non diventa owner del tenant cliente.

### Venue Control Center

Percorsi:

```text
/merchant
/merchant/events
/merchant/events/new
/merchant/events/[eventId]
/merchant/events/[eventId]/edit
/merchant/reservations
```

Funzioni:

- metriche reali;
- lista eventi;
- Event Studio;
- selezione tavoli;
- regole di prenotazione;
- deposito in euro;
- creazione draft;
- modifica;
- pubblicazione;
- annullamento;
- archiviazione;
- lista e filtri prenotazioni;
- cambio organizzazione.

## Autenticazione

Restano invariati:

- access token e refresh token in cookie HttpOnly;
- verifica backend dei ruoli;
- isolamento tenant;
- protezione server delle route.

Il login multi-organizzazione non richiede più l’inserimento manuale di UUID:
in caso di `ORGANIZATION_SELECTION_REQUIRED` mostra i workspace disponibili.

## Backend

Nuovi endpoint:

```text
GET  /api/v1/platform/overview
POST /api/v1/platform/onboarding
GET  /api/v1/platform/organizations/:organizationId

GET  /api/v1/control-center/merchant-overview
GET  /api/v1/control-center/reservations
```

Gli endpoint platform richiedono `platformAdmin=true`.

## Fuori scope

La Fase 08 non include ancora:

- catalogo pubblico eventi;
- pagina pubblica `/events/[slug]`;
- checkout pubblico visuale;
- upload object storage delle immagini;
- realtime websocket/SSE;
- rimborsi automatici.

Questi elementi appartengono alle fasi successive.
