# Fluxa — Blocco 04: Orders & Pricing Engine

## Ambito completato

- ordini persistenti tenant-scoped;
- numero ordine interno progressivo per location e data commerciale;
- idempotenza della creazione tramite `clientOrderId`;
- idempotenza delle mutazioni tramite `mutationId`;
- concorrenza ottimistica tramite `expectedVersion`;
- righe ordine con snapshot di prodotto, categoria, prezzo, IVA e listino;
- quantità intere o scalate senza uso di floating point;
- ricalcolo server-side di lordo, netto e imposta;
- sconti fissi e percentuali con allocazione proporzionale;
- riepilogo IVA riconciliato;
- stati `OPEN`, `HELD` e `CANCELLED`;
- audit e outbox;
- controllo del dispositivo sulla location;
- isolamento multi-tenant;
- test unitari e smoke test end-to-end.

## Principi

Il client Flutter non invia mai prezzo, IVA o totale. Invia soltanto prodotto,
variante, quantità e identificativi idempotenti. Il backend risolve il catalogo
effettivo della location e salva uno snapshot immutabile dei dati commerciali.

Gli importi sono memorizzati in centesimi interi. Le quantità sono rappresentate
come intero più scala:

- `2` pezzi: `quantityAmount = 2`, `quantityScale = 0`;
- `1,250 kg`: `quantityAmount = 1250`, `quantityScale = 3`.

Il campo `number` è un numero operativo interno Fluxa e non è mai un numero
fiscale A-Cube.

## Stati

- `OPEN`: modificabile;
- `HELD`: conservato in attesa, non modificabile finché non viene ripreso;
- `CANCELLED`: definitivo e non modificabile;
- `AWAITING_PAYMENT` e `PAID`: già presenti nello schema per il Blocco 05.

## Endpoint

- `GET|POST /api/v1/orders`
- `GET /api/v1/orders/:orderId`
- `POST /api/v1/orders/:orderId/items`
- `PATCH|DELETE /api/v1/orders/:orderId/items/:itemId`
- `POST /api/v1/orders/:orderId/adjustments`
- `DELETE /api/v1/orders/:orderId/adjustments/:adjustmentId`
- `POST /api/v1/orders/:orderId/hold`
- `POST /api/v1/orders/:orderId/resume`
- `POST /api/v1/orders/:orderId/cancel`

## Autorizzazioni

Owner, admin, manager, cassiere e cameriere possono creare e modificare ordini.
Solo owner, admin e manager possono applicare rettifiche o annullare ordini.
Contabili e supporto mantengono accesso in sola lettura.

Ogni richiesta verifica tenant, location e assegnazione del dispositivo.
Un ordine di un altro tenant viene restituito come non trovato.