# Fluxa Phase 2 — Runtime integration

## Obiettivo

La Fase 07 è la prima fase che applica le migrazioni degli eventi e delle
prenotazioni a un database PostgreSQL locale e verifica il flusso reale
API/database/background worker.

## Protezione del database

Prima di eseguire `db:migrate` il guard rifiuta:

- `NODE_ENV=production`;
- host PostgreSQL diversi da `localhost`, `127.0.0.1` e `::1`;
- database `postgres`, `template0` e `template1`;
- configurazioni senza `DATABASE_URL`.

La fase non esegue `infra:reset` e non cancella dati applicativi generici.

Il seed pulisce e ricrea soltanto la fixture con organizzazione:

```text
77000000-0000-4000-8000-000000000001
```

## Migrazioni

Vengono applicate tramite Drizzle tutte le migrazioni locali non ancora
applicate, incluse:

```text
0009_* — eventi e prenotazioni
0010_* — reservations.payment_expires_at
```

Non viene generata una nuova migrazione.

## Fixture

Il seed crea:

- organizzazione, merchant e location dedicati;
- una sala;
- sei tavoli;
- sei eventi pubblicati, ciascuno con un solo tavolo;
- regole di prenotazione;
- commissione organizzazione del 7,5%.

Ogni scenario usa un evento separato per evitare interferenze.

## Smoke test

Il test runtime verifica:

1. disponibilità pubblica;
2. due hold concorrenti sullo stesso tavolo: uno solo deve riuscire;
3. retry idempotente dell’hold;
4. cancellazione e rilascio tavolo;
5. conversione atomica hold → reservation;
6. retry idempotente della conversione;
7. prenotazione gratuita confermata senza pagamento;
8. webhook Stripe firmato sul raw body;
9. pagamento riuscito → `CONFIRMED`;
10. ledger, audit e outbox;
11. scadenza hold tramite background worker;
12. scadenza `PENDING_PAYMENT` e rilascio tavolo;
13. pagamento tardivo → `REFUND_PENDING`.

## Webhook Stripe locale

Il test genera una firma con l’SDK Stripe e invia un evento
`checkout.session.completed` all’endpoint HTTP reale.

Non viene contattata l’API Stripe e non viene creato un addebito. Questo smoke
verifica:

- raw body;
- firma webhook;
- metadata del pagamento;
- transazione database;
- conferma reservation;
- late-payment protection.

La creazione di una Checkout Session reale in Stripe Test Mode resta un test
esterno, perché richiede credenziali e rete.

## Processi

Lo script:

1. avvia PostgreSQL e Redis tramite Docker Compose;
2. applica le migrazioni;
3. esegue il seed;
4. compila il monorepo;
5. avvia API e background worker compilati;
6. esegue lo smoke;
7. arresta i due processi Node avviati dalla fase.

Il fiscal worker non viene avviato.
