# Fluxa — Blocco 05: Payments & Checkout

## Ambito completato

- apertura checkout idempotente tramite `clientCheckoutId`;
- transizione ordine `OPEN → AWAITING_PAYMENT → PAID`;
- pagamenti misti e parziali;
- contanti con importo ricevuto e resto;
- carta o altro metodo tramite terminale manuale/esterno;
- pagamenti `PENDING`, `CAPTURED`, `FAILED` e `CANCELLED`;
- idempotenza tramite `clientPaymentId`, `mutationId` e hash canonico;
- deduplicazione degli eventi del provider;
- lock transazionali PostgreSQL;
- annullamento checkout soltanto senza importi acquisiti;
- audit e transactional outbox;
- isolamento tenant, location e dispositivo;
- test automatici e smoke test end-to-end.

## Principi finanziari

Il client non modifica mai il totale dell'ordine. Il checkout fotografa totale,
valuta e versione dell'ordine. I pagamenti possono coprire il totale in più
operazioni, ma la somma di importi acquisiti e pendenti non può superarlo.

Per i contanti `amountCents` rappresenta la quota applicata all'ordine, mentre
`tenderedCents` è quanto consegnato dal cliente. La differenza è il resto.

I pagamenti con terminale nascono `PENDING` e diventano `CAPTURED`, `FAILED` o
`CANCELLED` tramite mutazioni idempotenti. Quando gli importi acquisiti
raggiungono esattamente il totale, checkout e ordine vengono chiusi nella stessa
transazione.

## Endpoint

- `GET|POST /api/v1/checkouts`
- `GET /api/v1/checkouts/:checkoutId`
- `POST /api/v1/checkouts/:checkoutId/payments`
- `POST /api/v1/checkouts/:checkoutId/cancel`
- `GET /api/v1/payments/:paymentId`
- `POST /api/v1/payments/:paymentId/capture`
- `POST /api/v1/payments/:paymentId/fail`
- `POST /api/v1/payments/:paymentId/cancel`

## Autorizzazioni

Owner, admin, manager, cassiere e cameriere possono aprire un checkout. Soltanto
owner, admin, manager e cassiere possono registrare o finalizzare pagamenti.
Contabili e supporto mantengono accesso in sola lettura.
