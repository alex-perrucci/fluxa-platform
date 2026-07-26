# Fluxa Phase 2 — Schema Events e Reservations

## Obiettivo

Questa fase introduce esclusivamente il modello dati necessario a eventi,
prenotazioni, hold temporanei, assegnazioni tavolo, pagamenti online e
commissioni Fluxa.

Non vengono ancora aggiunti controller, servizi, worker o interfacce utente.

## Domini aggiunti

### Events

- `events`
- `event_media`
- `event_table_inventory`
- `event_booking_rules`

Gli eventi riutilizzano `organizations`, `locations`, `users` e
`dining_tables`.

### Reservations

- `reservation_holds`
- `reservations`
- `reservation_table_assignments`
- `reservation_status_history`

Una prenotazione futura resta distinta da `table_sessions`. Il collegamento
alla table session è nullable e verrà valorizzato solo durante il check-in.

### Booking payments

- `reservation_payments`

Questi pagamenti sono distinti da `payment_transactions`, che rimane il
dominio del checkout POS.

### Commissioni

- `platform_fee_rules`
- `platform_fee_ledger`

Le regole supportano la precedenza:

1. evento;
2. organizzazione;
3. default globale.

Hold e prenotazioni conservano lo snapshot in basis point e centesimi, così
una modifica futura della percentuale non altera transazioni già create.

## Concorrenza tavoli

`reservation_table_assignments.active_event_table_key` viene valorizzato solo
durante un'assegnazione attiva.

L'indice univoco su organizzazione e chiave attiva impedisce due assegnazioni
contemporanee per lo stesso evento e tavolo. Il motore di prenotazione dovrà
comunque usare transazioni e locking PostgreSQL.

## Denaro

Tutti gli importi sono interi in centesimi. Le constraint verificano:

- importi non negativi;
- commissione tra 0 e 10.000 basis point;
- lordo locale uguale a importo meno commissione;
- netto locale uguale a lordo meno costo provider;
- quadratura delle registrazioni nel ledger.

## Migrazione

La migrazione viene generata con Drizzle Kit e non viene applicata
automaticamente al database.

Prima dell'applicazione deve essere revisionato il file SQL generato.

## Verifiche eseguite

- formattazione Prettier;
- controllo della migrazione e delle constraint;
- lint;
- test schema mirato;
- build completa NestJS.
