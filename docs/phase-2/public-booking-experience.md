# Fase 09 — esperienza pubblica di prenotazione

La Fase 09 rende utilizzabile dal cliente finale il motore prenotazioni già
presente nelle Fasi 04–06.

## Percorso pubblico

```text
/events
  → /events/:slug
  → disponibilità per numero di persone
  → hold atomico del tavolo
  → dati cliente
  → prenotazione
  → Stripe Checkout oppure conferma gratuita
  → /booking/success | /booking/cancel | /booking/:token
```

## API pubbliche aggiunte

```text
GET /api/v1/public/events
GET /api/v1/public/events/:slug
```

Le API espongono solo dati pubblici dell’evento, organizzatore, sede, regole di
prenotazione e capacità residua. Non espongono l’identità dei tavoli.

## BFF Next.js

Il browser non contatta direttamente NestJS. Tutte le richieste pubbliche
passano attraverso route handler in `apps/web/app/api/public`, mantenendo un
contratto uniforme per errori e configurazione dell’URL API.

## Invarianti

- la disponibilità visuale non sostituisce i lock PostgreSQL;
- il tavolo viene assegnato soltanto dal backend;
- hold token e reservation token sono UUID v4 generati dal client;
- gli idempotency key sono stabili per il singolo tentativo;
- Stripe rimane separato dai pagamenti POS e da A-Cube;
- il webhook firmato è la fonte di verità della conferma del pagamento;
- nessuna nuova migrazione è richiesta.

## Test locale

Per provare il flusso senza Stripe, pubblicare un evento con deposito `0`.
Per provare Stripe, configurare chiave test e webhook CLI, quindi usare un
evento con deposito maggiore di `0`.
