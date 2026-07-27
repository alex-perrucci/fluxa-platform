# Fluxa Phase 2 — Confini dei domini

## Principio generale

Fluxa API e PostgreSQL restano la fonte autorevole per:

- identità;
- tenant;
- location;
- tavoli;
- eventi;
- prenotazioni;
- pagamenti;
- commissioni;
- ordini;
- fiscalizzazione.

Il sito Next.js non deve contenere un secondo dominio backend indipendente.

## Domini esistenti da riutilizzare

### Identità

Riutilizzare:

- users;
- auth_sessions;
- devices;
- organization_memberships;
- ruoli e autorizzazioni.

Non creare una seconda tabella utenti per il sito web.

### Tenant

Riutilizzare:

- organizations;
- merchants;
- locations;
- platformAdmin;
- membership tenant-scoped.

Un amministratore tenant non equivale a un platform admin.

### Hospitality

Riutilizzare:

- dining_areas;
- dining_tables;
- table_sessions.

Una prenotazione futura non è una table_session.

La table_session nasce quando il cliente arriva e il tavolo viene occupato operativamente.

### Orders e pagamenti POS

Riutilizzare:

- orders;
- checkouts;
- payment_transactions.

Il pagamento della prenotazione online deve restare separato dal pagamento dell'ordine consumato nel locale.

### Fiscalità

Riutilizzare:

- fiscal_profiles;
- fiscal_documents;
- fiscal worker;
- adapter A-Cube.

Il pagamento della prenotazione non deve essere fiscalizzato automaticamente senza una regola fiscale esplicita.

### Affidabilità

Riutilizzare:

- audit_events;
- outbox_events;
- Redis;
- BullMQ;
- optimistic concurrency;
- transazioni PostgreSQL.

## Nuovo dominio Events

Il dominio Events gestirà:

- evento;
- immagini e locandina;
- pubblicazione;
- periodo di prenotazione;
- capacità;
- prezzo;
- inventario dei tavoli;
- regole di cancellazione.

Un evento appartiene a una organization e a una location.

## Nuovo dominio Reservations

Il dominio Reservations gestirà:

- hold temporaneo;
- prenotazione;
- dati del cliente;
- numero di ospiti;
- assegnazione tavolo;
- stato;
- check-in;
- no-show;
- cancellazione;
- rimborso;
- collegamento successivo alla table session.

## Nuovo dominio Booking Payments

Booking Payments gestirà:

- sessione di pagamento;
- webhook provider;
- idempotenza;
- importo pagato;
- commissione Fluxa;
- importo spettante al locale;
- costi del provider;
- rimborsi;
- ledger.

Non deve riutilizzare payment_transactions senza una decisione esplicita, perché quelle transazioni rappresentano il checkout POS.

## Realtime

Il realtime serve a notificare cambiamenti già confermati.

Non deve essere usato per impedire overbooking.

La prevenzione dell'overbooking deve avvenire tramite:

- transazioni PostgreSQL;
- locking;
- unique constraint;
- controlli di stato;
- idempotency key.

## Flusso finale previsto

Evento pubblicato
→ cliente crea hold
→ backend riserva temporaneamente un tavolo
→ cliente avvia pagamento
→ webhook verifica il pagamento
→ prenotazione confermata
→ gestionale e POS ricevono aggiornamento
→ cliente arriva
→ check-in
→ table session
→ ordine
→ pagamento POS
→ eventuale fiscalizzazione A-Cube
