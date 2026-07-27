# Fluxa Phase 2 — Stripe reservation payments

## Obiettivo

La Fase 06 collega le prenotazioni online a Stripe Checkout senza utilizzare
il dominio dei pagamenti POS.

## Endpoint

```text
POST /api/v1/public/reservations/:reservationToken/checkout-sessions
POST /api/v1/public/reservation-payments/stripe/webhook
```

Creazione checkout:

```json
{
  "idempotencyKey": "chiave stabile del tentativo"
}
```

Gli URL di ritorno vengono costruiti dal backend usando
`BOOKING_WEB_BASE_URL`; non vengono accettati URL arbitrari dal client.

## Configurazione

```text
BOOKING_WEB_BASE_URL=https://booking.example.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

In locale possono essere usate chiavi test Stripe.

## Idempotenza distribuita

Il backend:

1. crea o recupera `reservation_payments`;
2. salva una chiave di idempotenza per prenotazione;
3. usa l’ID locale del pagamento come idempotency key Stripe;
4. collega la Checkout Session alla riga locale;
5. restituisce la stessa sessione nei retry successivi.

Un crash dopo la chiamata Stripe non crea un secondo addebito perché il retry
riutilizza la stessa chiave provider.

## Webhook

La firma viene verificata sul raw body.

Eventi gestiti:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.expired
payment_intent.payment_failed
```

Un pagamento riuscito:

- imposta `reservation_payments.status = PAID`;
- registra la commissione provider disponibile;
- conferma la prenotazione;
- azzera `payment_expires_at`;
- registra storico, audit, outbox e ledger.

## Pagamento tardivo

Un pagamento ricevuto dopo la scadenza o dopo il rilascio della prenotazione
non ricrea automaticamente il tavolo.

La prenotazione passa a:

```text
REFUND_PENDING
```

e viene pubblicato:

```text
reservations.payment.refund_required
```

Il rimborso automatico verrà gestito nella fase dedicata.

## Separazione POS

Non vengono modificati:

```text
apps/api/src/payments
payment_transactions
checkout_sessions
payment_events
```

I pagamenti delle prenotazioni usano esclusivamente:

```text
reservation_payments
platform_fee_ledger
```

## Migrazioni

La fase non genera nuove migrazioni. Usa le strutture create nelle Fasi 02 e 05.
