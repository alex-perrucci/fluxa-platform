# Fluxa - Blocco 03: catalogo, IVA e prezzi

## Ambito completato

- aliquote IVA tenant-scoped, incluse aliquote a zero con codice natura;
- categorie ordinabili e disattivabili;
- prodotti con SKU, barcode, unità di misura e precisione quantità;
- varianti prodotto;
- disponibilità del prodotto per punto vendita;
- listini con priorità, valuta e intervallo di validità;
- assegnazione di più listini a ogni location;
- prezzi base e prezzi per variante in centesimi interi;
- risoluzione del catalogo effettivo per location;
- soft delete tramite stato `INACTIVE`;
- audit delle operazioni amministrative;
- paginazione e ricerca;
- isolamento multi-tenant;
- seed dimostrativo e smoke test end-to-end.

## Scelte di dominio

Gli importi sono memorizzati in centesimi interi. Le aliquote IVA sono
memorizzate in basis point:

- 22% = `2200`;
- 10% = `1000`;
- 5% = `500`;
- 4% = `400`.

Un prodotto non contiene direttamente il prezzo. Il prezzo appartiene a un
listino, che viene assegnato a una o più location. Questa separazione permette
di gestire prezzi differenti tra sedi e periodi promozionali senza modificare
il prodotto.

## Isolamento

L'`organizationId` non viene accettato liberamente dai DTO commerciali. Tutte
le query usano il tenant presente nell'`AuthContext`. Gli identificativi di
categoria, aliquota, prodotto, variante, location e listino vengono
ricontrollati lato database prima di ogni collegamento.

## Endpoint

- `GET|POST|PATCH|DELETE /api/v1/vat-rates`
- `GET|POST|PATCH|DELETE /api/v1/categories`
- `GET|POST|PATCH|DELETE /api/v1/products`
- `POST|PATCH /api/v1/products/:productId/variants`
- `PUT /api/v1/products/:productId/locations/:locationId`
- `GET|POST|PATCH /api/v1/price-lists`
- `PUT /api/v1/price-lists/:priceListId/locations`
- `PUT|DELETE /api/v1/price-lists/:priceListId/prices`
- `GET /api/v1/catalog?locationId=<uuid>`

Gli endpoint di scrittura richiedono `OWNER`, `ADMIN` oppure `MANAGER`.
Cassieri, camerieri, contabili e supporto possono leggere il catalogo ma non
modificarlo.

## Catalogo effettivo

`GET /catalog` restituisce soltanto:

- categorie attive;
- prodotti attivi;
- aliquote attive;
- prodotti non disabilitati per la location;
- varianti attive;
- listini e prezzi attivi nel periodo corrente.

Quando più listini sono assegnati alla stessa sede, vince quello con priorità
di assegnazione maggiore; a parità viene usata la priorità del listino.