# Fluxa Phase 2 — Scaffold web

## Applicazione

La Fase 01 aggiunge `apps/web` senza trasformare la repository in Nx, Turborepo
o in un npm workspace.

L'applicazione ha un proprio `package.json` e un proprio `package-lock.json`.

## Stack

- Next.js App Router;
- React;
- TypeScript strict;
- Tailwind CSS;
- ESLint;
- Vitest.

## Route iniziali

- `/`: portale pubblico provvisorio;
- `/health`: diagnostica backend;
- `/login`: accesso;
- `/merchant`: area esercente protetta;
- `/platform-admin`: area platform admin protetta.

## Autenticazione

Il backend Fluxa resta l'autorità per autenticazione e autorizzazione.

La Route Handler `/api/auth/login` inoltra il login a Fluxa API e conserva
access token e refresh token in cookie `HttpOnly`.

`proxy.ts` fa soltanto un controllo preliminare. I layout server delle aree
private richiamano `/auth/me` sul backend e applicano il controllo effettivo.

## Confini

Non vengono introdotti:

- database web separato;
- ORM web;
- utenti duplicati;
- dominio applicativo dentro Next.js;
- segreti pubblicati con `NEXT_PUBLIC_`.

## Verifica

Dalla directory `apps/web`:

```powershell
npm run lint
npm run test
npm run build
```
