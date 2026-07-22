# Fluxa — Blocco 09: hardening e rilascio

Questo blocco chiude la roadmap iniziale e non aggiunge nuove funzioni commerciali.

## Contenuto

- guardie backend per impedire configurazioni production insicure;
- Swagger disabilitato in produzione;
- avvio dei processi con errore esplicito e shutdown hooks;
- immagine Docker con sole dipendenze runtime e utente non privilegiato;
- compose production senza porte pubbliche per PostgreSQL e Redis;
- scansione preventiva dei file segreti;
- verifica della configurazione e smoke test degli health endpoint;
- gestione globale degli errori Flutter con redazione dei token;
- API HTTPS obbligatoria nelle build POS production;
- Android SDK 36, AGP 8.9.1, Gradle 8.11.1, NDK 27.0.12077973 e Java 17;
- firma release obbligatoria, R8 e resource shrinking;
- CI backend/POS e workflow manuale per AAB/APK firmati;
- runbook e checklist operativa.

## Principio di rilascio

La repository non contiene segreti. Lo script di release richiede un keystore locale o GitHub environment secrets e conserva i simboli necessari a interpretare stack trace di build offuscate.
