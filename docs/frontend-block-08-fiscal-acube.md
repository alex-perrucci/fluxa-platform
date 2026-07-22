# Frontend Blocco 08 — Fiscalizzazione A-Cube

## Ambito

- profilo fiscale A-Cube per location, configurabile in sandbox da owner/admin;
- elenco degli ordini pagati non ancora fiscalizzati;
- emissione idempotente con `clientRequestId` e codice lotteria facoltativo;
- monitoraggio degli stati `QUEUED`, `PROCESSING`, `ISSUED`, `RETRY`, `REJECTED`, `VOIDED`, `CANCELLED`;
- polling automatico mentre esistono documenti in lavorazione;
- dettaglio delle righe, riepiloghi IVA, pagamenti e tentativi provider;
- retry versionato per owner/admin/manager;
- annullamento di un documento emesso per owner/admin;
- recupero dai conflitti `FISCAL_VERSION_CONFLICT`;
- accesso diretto dal checkout completato e dagli ordini pagati.

## Scelta provider

Fluxa usa `ACUBE_SMART_RECEIPTS`. Durante lo sviluppo il profilo viene configurato con ambiente `SANDBOX`. Le credenziali non transitano nel POS e restano nelle variabili ambiente del `fiscal-worker`.

## Emissione

Il POS non considera fiscale il riepilogo stampato nel Blocco 07. Dopo il pagamento, l'ordine compare nella sezione **Fiscale** finché non esiste un documento `SALE`. L'operatore autorizzato invia l'ordine ad A-Cube; il backend crea uno snapshot immutabile e lo mette nella coda fiscale.

## Produzione

Il passaggio da sandbox a produzione, la gestione dei segreti reali e la validazione end-to-end con A-Cube appartengono al blocco finale di hardening e rilascio.
