# Fluxa Phase 2 — Piano di implementazione

## Obiettivo

Aggiungere a Fluxa:

1. portale pubblico degli eventi;
2. prenotazioni online;
3. pagamenti con commissione;
4. gestionale esercente;
5. super-admin Fluxa;
6. realtime;
7. integrazione con il POS Flutter.

## Fase 01 — Scaffold web

Creare apps/web con:

- Next.js App Router;
- TypeScript strict;
- Tailwind;
- client HTTP per Fluxa API;
- autenticazione collegata al backend esistente;
- route pubbliche, merchant e platform-admin.

Nessun nuovo backend Next.js.

## Fase 02 — Schema dati

Aggiungere migrazioni per:

- events;
- event_media;
- event_table_inventory;
- event_booking_rules;
- reservations;
- reservation_holds;
- reservation_table_assignments;
- reservation_payments;
- platform_fee_rules;
- platform_fee_ledger;
- reservation_status_history.

Le vecchie migrazioni non devono essere modificate.

## Fase 03 — API eventi

Aggiungere un modulo Events tenant-scoped con:

- CRUD;
- pubblicazione;
- annullamento;
- media;
- inventario tavoli;
- optimistic concurrency;
- audit e outbox.

## Fase 04 — Booking engine

Aggiungere:

- catalogo pubblico degli eventi;
- disponibilità;
- hold temporanei;
- scelta automatica del tavolo più piccolo adeguato;
- scadenza degli hold;
- protezione concorrente dall'overbooking.

## Fase 05 — Pagamenti

Introdurre BookingPaymentProvider e provider mock.

La conferma deve arrivare esclusivamente da un webhook verificato.

Salvare sempre:

- importo;
- valuta;
- commissione;
- quota locale;
- idempotency key;
- provider payment ID;
- webhook event ID;
- rimborsi.

## Fase 06 — Portale pubblico

Implementare:

- elenco eventi;
- dettaglio;
- immagini;
- disponibilità;
- prenotazione;
- pagamento;
- conferma;
- QR code;
- recupero prenotazione.

## Fase 07 — Gestionale esercente

Implementare:

- gestione eventi;
- inventario tavoli;
- prenotazioni;
- check-in;
- no-show;
- rimborsi;
- incassi;
- commissioni;
- esportazione CSV.

## Fase 08 — Platform admin

Aggiungere onboarding transazionale per:

- organization;
- owner;
- membership;
- merchant;
- location;
- fee rule.

Il platform admin deve essere distinto dall'admin tenant.

## Fase 09 — Realtime

Preferire SSE per aggiornamenti server-client.

Utilizzare:

- outbox;
- Redis come bus;
- canali organization/location;
- reconnect;
- fallback polling.

## Fase 10 — POS Flutter

Aggiungere:

- prenotazioni di oggi;
- prossimi arrivi;
- ricerca;
- check-in;
- assegnazione tavolo;
- apertura table session;
- collegamento reservation/table session.

## Fase 11 — Hardening

Aggiungere:

- rate limiting pubblico;
- protezione enumerazione;
- token pubblici sicuri;
- retention;
- privacy;
- logging;
- metriche;
- dead-letter handling;
- documentazione deploy e restore;
- test end-to-end.

## File esistenti da riutilizzare

- apps/api/src/auth/
- apps/api/src/organizations/
- apps/api/src/merchants/
- apps/api/src/locations/
- apps/api/src/hospitality/
- apps/api/src/orders/
- apps/api/src/payments/
- apps/api/src/fiscal/
- libs/database/src/schema.ts
- libs/database/
- libs/queue/
- apps/background-worker/
- apps/pos/

## Nuovi moduli backend previsti

- apps/api/src/events/
- apps/api/src/reservations/
- apps/api/src/booking-payments/
- apps/api/src/platform-admin/
- apps/api/src/realtime/

## Rischi principali

1. overbooking concorrente;
2. webhook duplicati;
3. pagamento confermato dopo scadenza hold;
4. accesso cross-tenant;
5. rimborsi parziali;
6. modifica delle commissioni dopo il pagamento;
7. collegamento errato tra prenotazione e table session;
8. gestione fiscale del deposito;
9. file upload non sicuri;
10. perdita di eventi realtime.

## Decisioni da confermare prima della Fase 05

- provider di pagamento;
- modello Stripe Connect o incasso centralizzato;
- percentuale predefinita Fluxa;
- trattamento dei costi del provider;
- regole di rimborso;
- trattamento fiscale del deposito;
- chi emette il documento fiscale;
- object storage scelto;
- dominio pubblico del portale.

## Verifiche obbligatorie

Ogni fase deve verificare:

- lint;
- test;
- build;
- isolamento tenant;
- nessuna modifica ai workflow;
- nessuna regressione sui moduli esistenti.
