# Fluxa POS — Frontend Blocco 06: tavoli e cucina

## Ambito

Questo blocco collega il POS Flutter ai contratti backend del Blocco 06:

- pianta sala tramite `GET /api/v1/floor`;
- apertura e gestione delle sessioni tavolo;
- collegamento di più ordini `TABLE` allo stesso conto;
- creazione rapida di un ordine tavolo;
- spostamento del conto su un tavolo libero;
- chiusura del tavolo solo con ordini `PAID` o `CANCELLED`;
- elenco delle postazioni cucina;
- invio incrementale delle quantità non ancora mandate;
- bacheca comande e avanzamento `QUEUED → IN_PROGRESS → READY → SERVED`;
- annullamento manageriale delle sole comande ancora `QUEUED`.

## Regole rispettate

Il frontend non calcola né invia prezzi, totali o quantità già spedite. Il backend
mantiene gli snapshot commerciali, decide il routing per categoria e crea una
comanda distinta per ogni postazione coinvolta.

Le mutazioni tavolo e cucina usano UUID v4 e `expectedVersion`. In caso di
`TABLE_SESSION_VERSION_CONFLICT` o `KITCHEN_TICKET_VERSION_CONFLICT`, il
frontend ricarica il dato autorevole invece di forzare la modifica.

La location deriva esclusivamente dal contesto operativo del dispositivo. Al
cambio location i controller eliminano immediatamente pianta, sessione
selezionata, postazioni e comande precedenti.

## Ruoli

`OWNER`, `ADMIN`, `MANAGER`, `CASHIER` e `WAITER` possono:

- aprire e aggiornare un tavolo;
- collegare ordini;
- spostare e chiudere il conto;
- inviare ordini in cucina;
- avanzare le comande.

Solo `OWNER`, `ADMIN` e `MANAGER` vedono le azioni di annullamento sessione e
comanda. La configurazione di sale, tavoli, postazioni e routing categorie resta
fuori dal POS operativo e continua a usare gli endpoint manageriali backend.

## Endpoint utilizzati

- `GET /api/v1/floor?locationId=...`
- `GET /api/v1/table-sessions/:sessionId`
- `POST /api/v1/table-sessions`
- `PATCH /api/v1/table-sessions/:sessionId`
- `POST /api/v1/table-sessions/:sessionId/orders`
- `POST /api/v1/table-sessions/:sessionId/move`
- `POST /api/v1/table-sessions/:sessionId/close`
- `POST /api/v1/table-sessions/:sessionId/cancel`
- `GET /api/v1/kitchen-stations?locationId=...`
- `GET /api/v1/kitchen-tickets`
- `GET /api/v1/kitchen-tickets/:ticketId`
- `POST /api/v1/orders/:orderId/kitchen-tickets`
- `POST /api/v1/kitchen-tickets/:ticketId/start`
- `POST /api/v1/kitchen-tickets/:ticketId/ready`
- `POST /api/v1/kitchen-tickets/:ticketId/serve`
- `POST /api/v1/kitchen-tickets/:ticketId/cancel`

Non vengono usati endpoint inventati e non vengono chiamati gli endpoint
manageriali di configurazione.

## Limiti intenzionali

La configurazione di sale, tavoli, postazioni e routing delle categorie non è
inclusa in questo blocco POS. Se tali dati mancano, le schermate mostrano uno
stato esplicito che richiede l'intervento di un amministratore.

La stampa delle comande viene accodata automaticamente dal backend durante
l'invio. Visualizzazione delle code di stampa, retry e routing stampanti saranno
gestiti nel Frontend Blocco 07.
