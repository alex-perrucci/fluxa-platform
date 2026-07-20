# Fluxa — Blocco 06: sale, tavoli, conti aperti e comande cucina

## Ambito completato

- sale e tavoli tenant-scoped per location;
- pianta sala con occupazione, coperti, ordini e totale aperto;
- sessione tavolo idempotente con un'unica occupazione attiva per tavolo;
- spostamento tavolo con lock transazionale;
- collegamento di ordini `TABLE` alla sessione;
- chiusura del tavolo solo quando tutti gli ordini sono `PAID` o `CANCELLED`;
- postazioni cucina e routing univoco delle categorie;
- invio incrementale delle sole quantità non ancora mandate;
- comande separate per postazione con snapshot di tavolo, prodotto, variante, quantità e note;
- ciclo `QUEUED → IN_PROGRESS → READY → SERVED`;
- annullamento delle sole comande ancora `QUEUED`;
- idempotenza, versionamento ottimistico, audit e outbox;
- protezione delle righe ordine già inviate in cucina.

## Regole principali

Un tavolo può avere al massimo una sessione `OPEN`. Una sessione può contenere più
ordini, ma ogni ordine può appartenere a una sola sessione tavolo. Gli ordini
collegabili devono usare `serviceMode=TABLE` ed essere ancora `OPEN` o `HELD`.

Il routing cucina assegna ogni categoria a una sola postazione per location. Un
invio genera una comanda distinta per ogni postazione coinvolta. Le quantità già
inviate non vengono duplicate nei retry o negli invii successivi.

## Endpoint

- `GET|POST|PATCH /api/v1/dining-areas`
- `GET|POST|PATCH /api/v1/dining-tables`
- `GET /api/v1/floor?locationId=<uuid>`
- `GET|POST|PATCH /api/v1/table-sessions`
- `POST /api/v1/table-sessions/:id/orders`
- `POST /api/v1/table-sessions/:id/move`
- `POST /api/v1/table-sessions/:id/close`
- `POST /api/v1/table-sessions/:id/cancel`
- `GET|POST|PATCH /api/v1/kitchen-stations`
- `PUT|DELETE /api/v1/kitchen-stations/:id/categories/:categoryId`
- `POST /api/v1/orders/:orderId/kitchen-tickets`
- `GET /api/v1/kitchen-tickets`
- `POST /api/v1/kitchen-tickets/:id/start|ready|serve|cancel`
