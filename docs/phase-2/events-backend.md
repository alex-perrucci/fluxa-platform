# Fluxa Phase 2 — Backend Events

## Modulo

La Fase 03 aggiunge `EventsModule` all’API NestJS esistente.

Il modulo utilizza:

- lo stesso `DatabaseService`;
- lo stesso PostgreSQL;
- lo stesso sistema JWT e tenant context;
- gli stessi utenti, organizzazioni, sedi e tavoli;
- `audit_events` e `outbox_events` già presenti.

## Endpoint autenticati

```text
GET    /api/v1/events
GET    /api/v1/events/:eventId
POST   /api/v1/events
PATCH  /api/v1/events/:eventId
PUT    /api/v1/events/:eventId/tables
PUT    /api/v1/events/:eventId/booking-rules
POST   /api/v1/events/:eventId/publish
POST   /api/v1/events/:eventId/cancel
DELETE /api/v1/events/:eventId
```

Le mutazioni richiedono ruolo `OWNER`, `ADMIN` o `MANAGER`.

## Regole di dominio

Un evento nasce in `DRAFT`.

Soltanto una bozza può cambiare:

- informazioni;
- date;
- prezzo di prenotazione;
- capacità;
- tavoli;
- regole di prenotazione.

La pubblicazione richiede:

- inizio e chiusura prenotazioni nel futuro;
- almeno un tavolo attivo;
- capacità totale dei tavoli sufficiente;
- regole di prenotazione configurate;
- numero massimo di coperti compatibile con il tavolo più grande.

## Concorrenza

Le transizioni di stato e le configurazioni vengono eseguite dentro una
transazione PostgreSQL.

La riga dell’evento viene acquisita con `FOR UPDATE`, evitando due mutazioni
concorrenti sullo stesso aggregato.

## Audit e outbox

Ogni mutazione inserisce, nella stessa transazione:

- un record in `audit_events`;
- un record in `outbox_events`.

La pubblicazione dell’outbox verso web e POS verrà implementata nella fase
realtime.

## Confini

Questa fase non aggiunge:

- endpoint pubblici anonimi;
- creazione delle prenotazioni;
- pagamento online;
- upload binario delle immagini;
- websocket o SSE;
- applicazione automatica della migrazione.
