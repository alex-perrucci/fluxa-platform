# Fluxa Phase 2 — Reservation engine

## Obiettivo

La Fase 04 introduce il motore pubblico di disponibilità e hold temporanei.

Non crea ancora una prenotazione definitiva e non esegue ancora il pagamento.

## Endpoint pubblici

```text
GET    /api/v1/public/events/:slug/availability?partySize=4
POST   /api/v1/public/events/:slug/holds
GET    /api/v1/public/reservation-holds/:holdToken
DELETE /api/v1/public/reservation-holds/:holdToken
```

Creazione hold:

```json
{
  "partySize": 4,
  "holdToken": "UUID v4 generato dal client",
  "idempotencyKey": "chiave stabile del tentativo"
}
```

Il token pubblico viene restituito al client ma nel database ne viene salvato
soltanto l’hash SHA-256.

## Protezione dall’overbooking

La creazione di un hold:

1. apre una transazione PostgreSQL;
2. blocca la riga dell’evento;
3. acquisisce un advisory lock per evento;
4. libera gli hold già scaduti;
5. verifica la capacità totale residua;
6. sceglie il tavolo attivo più piccolo compatibile;
7. inserisce hold e assegnazione tavolo;
8. inserisce audit e outbox;
9. esegue il commit.

L’indice univoco su `active_event_table_key` resta l’ultima protezione contro
due assegnazioni attive sullo stesso tavolo.

## Idempotenza

La chiave di idempotenza è unica per organizzazione ed evento.

Un retry con la stessa chiave, lo stesso token e gli stessi coperti restituisce
lo stesso hold. Il riuso con dati differenti produce conflitto.

## Commissione

Al momento della creazione dell’hold viene risolta la regola più specifica:

1. evento;
2. organizzazione;
3. globale.

Basis point e importi vengono salvati come snapshot nell’hold.

## Scadenza

Il background worker registra un Job Scheduler BullMQ ogni 30 secondi.

Il job:

- seleziona hold scaduti con `FOR UPDATE SKIP LOCKED`;
- rilascia l’assegnazione tavolo;
- imposta lo stato `EXPIRED`;
- registra audit e outbox.

## Confini

Questa fase non aggiunge:

- dati anagrafici del cliente;
- checkout del provider;
- conversione hold → reservation;
- rimborsi;
- check-in;
- websocket o SSE.
