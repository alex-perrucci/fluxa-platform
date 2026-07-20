# Fluxa — Blocco 08: Documenti fiscali e A-Cube Smart Receipts

## Ambito completato

- profilo fiscale per location;
- provider `MOCK` e `ACUBE_SMART_RECEIPTS`;
- ambienti sandbox e produzione;
- fiscalizzazione idempotente di ordini pagati;
- snapshot immutabile di righe, IVA e pagamenti;
- coda BullMQ dedicata e fiscal-worker reale;
- tentativi, backoff, retry e rifiuto definitivo;
- annullamento di un documento emesso;
- audit e transactional outbox;
- isolamento tenant/location/device;
- smoke test end-to-end con provider mock.

## Sicurezza

Le credenziali A-Cube non vengono salvate nel database. Il worker legge
`ACUBE_BEARER_TOKEN` oppure `ACUBE_EMAIL` e `ACUBE_PASSWORD` dall'ambiente.

## Endpoint

- `GET|PUT /api/v1/fiscal-profiles/:locationId`
- `GET /api/v1/fiscal-documents`
- `GET /api/v1/fiscal-documents/:documentId`
- `POST /api/v1/orders/:orderId/fiscalize`
- `POST /api/v1/fiscal-documents/:documentId/retry`
- `POST /api/v1/fiscal-documents/:documentId/void`

## Provider mock

Il provider `MOCK` viene usato nello smoke test e produce identificativi e numeri
documento deterministici senza chiamate esterne. Il provider A-Cube usa il payload
Smart Receipts con prezzi lordi, aliquota/natura IVA e ripartizione contanti/elettronico.
