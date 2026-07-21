# Frontend Blocco 04 — Ordini e composizione vendita

## Ambito

Il POS Flutter usa i contratti del Blocco backend 04 per creare e modificare ordini persistenti nella location operativa validata dal Blocco 02.

Il frontend non invia prezzi, IVA, imponibile o totale. Invia soltanto identificativi, modalità di servizio, prodotto/variante, quantità, note e chiavi idempotenti. Il backend risolve prezzo e fiscalità dal catalogo effettivo della location.

## Endpoint usati

- `GET /api/v1/orders?locationId=<uuid>&status=<status>&page=1&pageSize=30`
- `GET /api/v1/orders/:orderId`
- `POST /api/v1/orders`
- `POST /api/v1/orders/:orderId/items`
- `PATCH /api/v1/orders/:orderId/items/:itemId`
- `DELETE /api/v1/orders/:orderId/items/:itemId`
- `POST /api/v1/orders/:orderId/hold`
- `POST /api/v1/orders/:orderId/resume`

Il Blocco 04 frontend non applica rettifiche e non annulla ordini: tali azioni sono riservate a `OWNER`, `ADMIN` e `MANAGER` e saranno integrate con le funzioni manageriali.

## Flusso di vendita

1. L'operatore crea una bozza locale scegliendo `COUNTER`, `TAKEAWAY`, `DELIVERY` o `TABLE`.
2. La bozza viene persistita soltanto quando viene aggiunto il primo prodotto.
3. `clientOrderId` resta stabile durante il tentativo di creazione, così un retry della stessa richiesta è idempotente.
4. Ogni mutazione usa un nuovo `mutationId` e l'ultima `version` ricevuta dal backend.
5. Ogni risposta backend sostituisce integralmente lo snapshot locale dell'ordine.
6. Su `ORDER_VERSION_CONFLICT` il frontend ricarica l'ordine autorevole e chiede all'operatore di ripetere l'azione.

## Quantità

Le quantità non usano `double`:

- pezzi: `quantityAmount = 2`, `quantityScale = 0`;
- `1,250 kg`: `quantityAmount = 1250`, `quantityScale = 3`.

`QuantityCodec` converte input con virgola o punto in un intero esatto e rifiuta precisioni superiori a quelle definite dal prodotto.

## Protezione location

Il controller ordini viene associato al `locationId` validato da `GET /devices/me/assignment`.

Quando cambia location o organizzazione, il frontend elimina immediatamente:

- bozza locale;
- ordine aperto in memoria;
- lista ordini precedente;
- messaggi e filtri.

Ogni ordine ricevuto viene verificato rispetto alla location corrente prima di diventare ordine attivo.

## Stati ordine

- `OPEN`: modificabile e aggiungibile dal catalogo;
- `HELD`: sola lettura finché non viene ripreso;
- `AWAITING_PAYMENT`: sola lettura nel Blocco 04;
- `PAID`: sola lettura;
- `CANCELLED`: sola lettura.

Un ordine `OPEN` con almeno una riga può essere messo in attesa. Un ordine `HELD` può essere ripreso dalla sezione Ordini.

## Errori gestiti

- `ORDER_VERSION_CONFLICT`: ricarica snapshot autorevole;
- `ORDER_NOT_MUTABLE`: blocca la modifica;
- `ORDER_EMPTY`: impedisce la sospensione di un ordine vuoto;
- `ORDER_PRODUCT_NOT_AVAILABLE`;
- `ORDER_VARIANT_NOT_AVAILABLE`;
- `ORDER_PRICE_NOT_FOUND`;
- `ORDER_ITEM_NOT_FOUND`;
- `ORDER_ITEM_ALREADY_SENT_TO_KITCHEN`;
- `LOCATION_NOT_FOUND`;
- `DEVICE_NOT_ASSIGNED`;
- `DEVICE_LOCATION_ACCESS_DENIED`.

Gli errori sono mostrati senza calcolare o mantenere totali locali alternativi.

## Test

Il blocco aggiunge test per:

- parsing completo dello snapshot ordine;
- lista paginata;
- quantità scalate senza floating point;
- UUID v4;
- creazione lazy e aggiunta prima riga;
- recupero da conflitto di versione;
- cancellazione del contesto al cambio location;
- lista ordini in attesa e azione di ripresa;
- regressione della ricerca catalogo.

## Blocco successivo

Frontend Blocco 05: checkout e pagamenti, usando l'ordine `OPEN`/`AWAITING_PAYMENT`, i contratti payment intent e il riepilogo server-side già calcolato.
