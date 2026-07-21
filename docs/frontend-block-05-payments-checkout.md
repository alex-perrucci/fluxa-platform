# Frontend Blocco 05 — Checkout e pagamenti

## Ambito

Questo blocco collega il POS Flutter al backend pagamenti già presente in Fluxa.

Contratti usati:

- `GET|POST /api/v1/checkouts`
- `GET /api/v1/checkouts/:checkoutId`
- `POST /api/v1/checkouts/:checkoutId/payments`
- `POST /api/v1/checkouts/:checkoutId/cancel`
- `GET /api/v1/payments/:paymentId`
- `POST /api/v1/payments/:paymentId/capture`
- `POST /api/v1/payments/:paymentId/fail`
- `POST /api/v1/payments/:paymentId/cancel`

Il frontend non calcola né modifica il totale dell’ordine. L’apertura del checkout
invia esclusivamente `clientCheckoutId`, `orderId` ed `expectedOrderVersion`.

## Flusso operativo

1. L’operatore apre un ordine `OPEN` con almeno una riga e totale positivo.
2. Il POS cerca un checkout `OPEN` già associato all’ordine nella location.
3. Se non esiste, apre un checkout idempotente.
4. L’ordine passa a `AWAITING_PAYMENT`.
5. I pagamenti possono essere parziali o misti:
   - `CASH` + provider `CASH`: acquisizione immediata;
   - `CARD` o `OTHER`: nasce `PENDING` con provider
     `MANUAL_TERMINAL` o `EXTERNAL_TERMINAL`;
   - un pagamento `PENDING` può essere acquisito, fallito o annullato.
6. Quando gli importi acquisiti raggiungono il totale, checkout e ordine diventano
   rispettivamente `COMPLETED` e `PAID`.

Gli importi sono sempre centesimi interi. La conversione dell’input dell’operatore
non utilizza floating point.

## Sicurezza del contesto

Il checkout viene accettato soltanto quando `locationId` e `orderId` coincidono
con il contesto operativo corrente. Il cambio location elimina immediatamente il
checkout mantenuto dal controller.

`OWNER`, `ADMIN`, `MANAGER`, `CASHIER` e `WAITER` possono aprire un checkout.
La registrazione e finalizzazione dei pagamenti è mostrata soltanto a
`OWNER`, `ADMIN`, `MANAGER` e `CASHIER`. Il backend resta comunque la fonte
autorevole delle autorizzazioni.

## Idempotenza e conflitti

Ogni apertura e operazione finanziaria usa UUID v4 distinti:

- `clientCheckoutId`;
- `clientPaymentId`;
- `mutationId`.

Il frontend non forza i conflitti. In caso di checkout o pagamento modificato da
un’altra operazione, ricarica il checkout autorevole oppure mostra l’errore
backend e richiede un retry esplicito.

## Casi coperti

- checkout nuovo e checkout aperto già esistente;
- contanti con importo ricevuto e resto;
- carta o altro metodo con pagamento `PENDING`;
- acquisizione, fallimento e annullamento del pagamento pendente;
- pagamenti parziali e misti;
- annullamento checkout soltanto senza importi acquisiti;
- completamento automatico e ordine `PAID`;
- recupero dopo cambio location;
- parser dei DTO, importi e stati backend.
