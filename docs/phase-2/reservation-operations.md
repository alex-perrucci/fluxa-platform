# Fase 10 — operazioni prenotazioni e collegamento POS

La Fase 10 trasforma la lista prenotazioni in un board operativo di sala.

## Flusso

```text
CONFIRMED
  → check-in
  → apertura atomica table_session
  → CHECKED_IN
  → accompagnamento al tavolo
  → SEATED
  → chiusura conto/sessione dal POS
  → COMPLETED
```

Da `CONFIRMED` è disponibile anche `NO_SHOW`.

## Collegamento POS

Il check-in apre una vera riga `table_sessions` usando il tavolo assegnato alla
prenotazione. La sessione compare quindi nel floor endpoint già utilizzato dal
dominio hospitality/POS.

La prenotazione usa il campo `table_session_id` già presente nello schema:
non serve una nuova migrazione.

## Concorrenza

Ogni operazione usa:

- `expectedVersion`;
- `mutationId`;
- advisory lock sulla prenotazione;
- advisory lock sul tavolo durante il check-in;
- vincolo univoco della sessione attiva;
- audit event e outbox event.

Un retry con lo stesso `mutationId` non ripete l’operazione.

## Feed live

Il Control Center interroga un feed cursorizzato basato su `outbox_events`.
Quando arriva una modifica relativa alla sede corrente, Next.js aggiorna i
Server Components.

Il feed è multi-instance e riutilizzabile in seguito dal client Flutter.

## Limiti deliberati

Questa fase non esegue rimborsi Stripe e non annulla prenotazioni pagate.
Rimborsi, cancellazioni economiche e riconciliazione appartengono alla fase
finanziaria dedicata.
