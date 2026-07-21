# Frontend Blocco 03 — Catalogo e ricerca prodotti

## Ambito

Il Blocco 03 collega il POS Flutter al catalogo effettivo della location operativa.
Il frontend usa esclusivamente la location validata dal bootstrap del Blocco 02 e
non consente di inserire manualmente un `locationId`.

## Contratto backend

```http
GET /api/v1/catalog?locationId=<uuid>
Authorization: Bearer <access-token>
```

Il parametro opzionale `q` è previsto dal backend e filtra i campi base del
prodotto (`code`, `name`, `sku`, `barcode`). In questa prima implementazione il
POS carica il catalogo effettivo completo e applica la ricerca in memoria anche
a nome, codice, SKU e barcode delle varianti. Questa scelta evita chiamate a ogni
tasto e copre i campi variante che il filtro backend non considera.

La risposta contiene:

- `locationId`;
- `currency`;
- gli identificativi dei listini effettivi, già ordinati per priorità;
- categorie ordinate;
- prodotti attivi e abilitati nella location;
- aliquota IVA risolta;
- prezzo base effettivo, eventualmente `null`;
- varianti attive con prezzo effettivo, eventualmente `null`.

Il client non ricalcola prezzi, priorità o IVA. Mostra i valori già risolti dal
backend e mantiene gli importi in centesimi interi.

## Flusso POS

```text
bootstrap autenticato e operationalStatus=READY
→ recupera location.id dal contesto device/location
→ GET /catalog?locationId=<location.id>
→ verifica che response.locationId coincida
→ mostra categorie e prodotti
→ ricerca locale su prodotto e varianti
```

Quando cambia la location il controller elimina immediatamente lo snapshot
precedente prima di eseguire la nuova richiesta. Il catalogo della vecchia
location non viene quindi mostrato come valido durante il caricamento.

## UI

La voce `Cassa` della navigazione principale apre il catalogo:

- intestazione con location, valuta e numero prodotti;
- refresh manuale;
- ricerca per nome, codice, SKU e barcode;
- filtro per categoria;
- griglia adattiva per tablet, desktop e web;
- prezzo base o prezzo minimo delle varianti;
- dettaglio prodotto con IVA e varianti;
- loading, catalogo vuoto, ricerca vuota ed errore con retry.

Il Blocco 03 è di sola consultazione. L'aggiunta al carrello, le quantità e le
mutazioni ordine appartengono al Frontend Blocco 04.

## Limitazioni backend osservate

`GET /catalog` non è paginato e il filtro `q` non cerca nei campi delle varianti.
Il frontend non inventa paginazione o endpoint aggiuntivi: mantiene il catalogo
in memoria e filtra localmente. Prima di cataloghi molto grandi o scansione
barcode ad alta frequenza può essere utile aggiungere un endpoint di lookup o
estendere la ricerca backend alle varianti.

## Verifiche

Lo script del blocco esegue:

```powershell
flutter pub get
dart format
flutter analyze
flutter test
flutter build web
```

Sono inclusi test per parsing del contratto, prezzi nullabili, formattazione dei
centesimi, ricerca su barcode variante, cambio location, errori backend e widget
responsive del catalogo.
