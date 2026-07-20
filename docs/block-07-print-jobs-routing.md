# Fluxa — Blocco 07: Print Jobs, stampanti e routing

## Ambito completato

- anagrafica stampanti tenant-scoped per punto vendita;
- associazione della stampante a un dispositivo agente locale;
- routing per comande cucina, ricevute ordine e riepiloghi pagamento;
- creazione automatica dei lavori di stampa quando viene generata una comanda;
- ristampa esplicita e idempotente di comande, ordini e checkout;
- pagina di test della stampante;
- coda durevole PostgreSQL con priorità, tentativi e backoff;
- claim concorrente tramite `FOR UPDATE SKIP LOCKED`;
- lease temporaneo associato al dispositivo agente;
- completamento e fallimento idempotenti tramite `leaseToken`;
- recupero dei lease scaduti;
- retry e cancellazione amministrativa versionati;
- snapshot testuale immutabile del documento;
- storico dei tentativi, audit e transactional outbox;
- isolamento multi-tenant e controllo location/device;
- test unitari e smoke test end-to-end.

## Architettura

Fluxa non tenta di raggiungere direttamente una stampante LAN dal cloud. Una
stampante viene assegnata a un dispositivo agente autenticato nella stessa sede.
L'agente esegue il polling della coda, reclama un lavoro con un lease e invia il
contenuto alla periferica locale.

Il lease impedisce che due agenti stampino lo stesso documento. Se l'agente si
interrompe, il lavoro torna reclamabile alla scadenza. Dopo il numero massimo di
tentativi il lavoro passa a `FAILED` e può essere ritentato manualmente.

## Documenti

- `KITCHEN_TICKET`: comanda cucina, creata automaticamente dal dispatch;
- `ORDER_RECEIPT`: riepilogo commerciale dell'ordine;
- `PAYMENT_RECEIPT`: riepilogo del checkout e dei pagamenti;
- `TEST_PAGE`: verifica della stampante e dell'agente.

Le ricevute di ordine e pagamento riportano esplicitamente che non sono documenti
fiscali. La fiscalizzazione A-Cube sarà aggiunta nel blocco successivo.

## Endpoint principali

- `GET|POST /api/v1/printers`
- `GET|PATCH /api/v1/printers/:printerId`
- `POST /api/v1/printers/:printerId/heartbeat`
- `POST /api/v1/printers/:printerId/test`
- `GET|PUT /api/v1/print-routes`
- `DELETE /api/v1/print-routes/:routeId`
- `GET /api/v1/print-jobs`
- `GET /api/v1/print-jobs/:jobId`
- `POST /api/v1/orders/:orderId/print-receipt`
- `POST /api/v1/checkouts/:checkoutId/print-receipt`
- `POST /api/v1/kitchen-tickets/:ticketId/reprint`
- `POST /api/v1/print-jobs/:jobId/retry`
- `POST /api/v1/print-jobs/:jobId/cancel`
- `POST /api/v1/print-agent/jobs/claim`
- `POST /api/v1/print-agent/jobs/:jobId/complete`
- `POST /api/v1/print-agent/jobs/:jobId/fail`

## Stati

`QUEUED → CLAIMED → COMPLETED`

Un claim fallito può tornare `QUEUED` con backoff oppure passare a `FAILED`.
Un lavoro `QUEUED` o `FAILED` può essere cancellato da owner, admin o manager.

## Sicurezza

Ogni operazione verifica tenant, sede e assegnazione del dispositivo. Solo il
dispositivo configurato come agente della stampante può reclamare e concludere i
suoi lavori. Gli identificativi di altri tenant vengono restituiti come non trovati.
