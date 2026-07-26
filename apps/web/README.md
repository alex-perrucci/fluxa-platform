# Fluxa Web

Frontend Next.js della Fase 2.

## Avvio locale

Copia la configurazione:

```powershell
Copy-Item .env.example .env.local
```

Avvia prima Fluxa API dalla root della monorepo, poi:

```powershell
npm install
npm run dev
```

URL:

- sito pubblico: http://localhost:3001
- login: http://localhost:3001/login
- diagnostica: http://localhost:3001/health
- gestionale: http://localhost:3001/merchant
- platform admin: http://localhost:3001/platform-admin

Per evitare il conflitto con Fluxa API sulla porta 3000:

```powershell
npm run dev -- --port 3001
```

## Variabili

```env
FLUXA_API_BASE_URL=http://localhost:3000/api/v1
```

La variabile non usa il prefisso `NEXT_PUBLIC_`: viene letta soltanto dal runtime
server di Next.js.

## Sessione

Il browser invia le credenziali alla Route Handler di login. I token restituiti da
Fluxa API vengono conservati in cookie `HttpOnly`, non in localStorage.

Le autorizzazioni reali vengono comunque verificate da Fluxa API. `proxy.ts`
esegue solo un controllo preliminare sulla presenza della sessione.
