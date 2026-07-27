# Fluxa Phase 2 — Conversione hold in prenotazione

## Obiettivo

La Fase 05 converte un hold attivo in una prenotazione persistente.

Il pagamento online resta separato dal checkout POS e verrà collegato nella
fase successiva tramite `reservation_payments`.

## Endpoint pubblici

```text
POST /api/v1/public/reservation-holds/:holdToken/reservations
GET  /api/v1/public/reservations/:reservationToken
```

Corpo della conversione:

```json
{
  "reservationToken": "UUID v4 generato dal client",
  "customerName": "Mario Rossi",
  "customerEmail": "mario@example.com",
  "customerPhone": "+39 333 1234567",
  "customerNote": "Tavolo tranquillo"
}
```

Nel database viene conservato soltanto l’hash SHA-256 del token pubblico.

## Transazione atomica

La conversione:

1. blocca l’hold e l’evento;
2. verifica stato e scadenza;
3. valida i dati cliente;
4. verifica l’assegnazione tavolo attiva;
5. crea la prenotazione;
6. trasferisce l’assegnazione da `hold_id` a `reservation_id`;
7. marca l’hold come `CONVERTED`;
8. registra lo storico di stato;
9. inserisce audit e outbox;
10. esegue il commit.

Un retry identico restituisce la prenotazione già creata. Un retry con token
o dati cliente differenti produce conflitto.

## Stato iniziale

Per importi superiori a zero:

```text
PENDING_PAYMENT
```

La scadenza del pagamento coincide con la scadenza originaria dell’hold.

Per un evento gratuito:

```text
CONFIRMED
```

La prenotazione viene confermata subito e non richiede checkout.

## Scadenza del pagamento

Lo schema aggiunge:

```text
reservations.payment_expires_at
```

Il background worker estende il job già esistente e:

- seleziona prenotazioni `PENDING_PAYMENT` scadute;
- rilascia il tavolo;
- imposta lo stato `EXPIRED`;
- registra storico, audit e outbox.

## Separazione dai pagamenti POS

Questa fase non modifica:

- `payment_transactions`;
- `checkouts`;
- controller e servizi POS sotto `apps/api/src/payments`.

Il prossimo checkout online userà esclusivamente `reservation_payments`.

## Confini

Questa fase non crea ancora:

- sessione del provider di pagamento;
- webhook;
- conferma dopo pagamento;
- rimborso;
- check-in.
