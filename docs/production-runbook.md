# Fluxa production runbook

## 1. Prerequisiti

- dominio HTTPS per API e applicazione web;
- PostgreSQL gestito con backup automatici e TLS;
- Redis gestito, persistente e protetto da password;
- credenziali A-Cube production;
- keystore Android di upload conservato fuori dalla repository;
- GitHub environment `production` con approvazione manuale.

## 2. Configurazione backend

1. Copiare `.env.production.example` in un secret manager o in `.env.production` fuori da Git.
2. Sostituire tutti i placeholder con valori casuali distinti.
3. Eseguire:

```bash
node scripts/verify-production-config.mjs --env .env.production --pos-api https://api.example.com/api/v1
```

4. Applicare le migrazioni una sola volta prima di avviare la nuova versione:

```bash
npm ci
npm run build
npm run db:migrate
```

5. Avviare API, fiscal-worker e background-worker. `compose.production.yml` usa i servizi dati esterni indicati nelle variabili ambiente:

```bash
docker compose -f compose.production.yml --env-file .env.production up -d --build
```

6. Verificare:

```bash
node scripts/smoke-production.mjs --base-url https://api.example.com/api/v1
```

## 3. Configurazione A-Cube

- mantenere il profilo della location in `SANDBOX` durante il collaudo;
- passare a `PRODUCTION` solo dopo conferma contrattuale e test end-to-end;
- configurare `ACUBE_BEARER_TOKEN` oppure email e password nel fiscal-worker;
- non salvare le credenziali nel database o nel POS;
- verificare emissione, retry, rifiuto e annullamento prima dell’apertura.

## 4. Release Android

1. Creare un upload keystore e conservarne una copia cifrata.
2. Copiare `apps/pos/android/key.properties.example` in `key.properties`.
3. Compilare:

```powershell
./scripts/build-pos-release.ps1 `
  -ApiBaseUrl https://api.example.com/api/v1 `
  -Environment production `
  -BuildApk
```

La build genera AAB, APK per ABI e simboli di offuscamento. Conservare i simboli insieme alla versione distribuita.

## 5. GitHub environment secrets

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_STORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `POS_API_BASE_URL`

## 6. Ordine di collaudo

1. login e selezione location;
2. catalogo e prezzi IVA;
3. ordine banco e tavolo;
4. pagamento contanti e terminale;
5. stampa Wi-Fi e Bluetooth;
6. emissione A-Cube sandbox;
7. retry e annullamento autorizzato;
8. riavvio del POS e ripristino sessione;
9. interruzione temporanea di rete e recupero delle code.

## 7. Rollback

- non eseguire downgrade distruttivi del database;
- conservare l’immagine backend e l’AAB/APK della versione precedente;
- riportare i servizi alla versione precedente solo se compatibile con le migrazioni già applicate;
- non duplicare manualmente documenti fiscali: verificare prima lo stato e l’idempotency key.

## 8. Backup e monitoraggio

- backup PostgreSQL giornaliero con prova periodica di ripristino;
- allarmi su health readiness, job fiscali `REJECTED`, code di stampa `FAILED` e saturazione database;
- conservazione dei log senza token, password o payload fiscali completi;
- rotazione programmata dei segreti e revoca immediata in caso di esposizione.
