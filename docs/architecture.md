# Fluxa â€” architettura iniziale

## Processi

### API
Riceve richieste dai client Flutter, valida input e autorizzazioni e salva
operazioni atomiche nel database.

### Fiscal worker
Processo isolato destinato alle chiamate A-Cube eReceipts, ai retry fiscali,
alla gestione mTLS, agli annulli, ai resi e agli emergency report.

### Background worker
Gestisce attivitÃ  non fiscali: notifiche, report, sincronizzazioni e lavori
differibili.

## Persistenza

PostgreSQL Ã¨ la fonte ufficiale degli stati. Redis non Ã¨ utilizzato come
archivio definitivo delle vendite.

## Transactional outbox

La tabella `outbox_events` permette di registrare nella stessa transazione
database sia il cambiamento di dominio sia l'evento da pubblicare in coda.

## Audit

La tabella `audit_events` Ã¨ la base append-only per tracciare azioni sensibili.
I riferimenti a organizzazione e utente diventeranno chiavi esterne nel blocco
dedicato a identitÃ  e multi-tenancy.