# Frontend Blocco 01 — Foundation, autenticazione e contesto operativo

## Scope

Il client POS Flutter vive in `apps/pos` e non modifica i moduli backend. Il blocco implementa configurazione per ambiente, bootstrap, design system Material 3, temi chiaro/scuro, navigazione adattiva, storage sicuro, identificativo stabile di installazione, login, selezione/cambio organizzazione, refresh token sincronizzato, logout, sessione corrente, dispositivo corrente e impostazioni tecniche.

## Contratti backend usati

Base URL: `/api/v1`.

- `POST auth/login`: `email`, `password`, `organizationId?`, `device`.
- `POST auth/refresh`: `refreshToken`; ruota sempre la coppia di token.
- `POST auth/switch-organization`: `organizationId`, `refreshToken`; ruota sempre la coppia di token.
- `POST auth/logout`.
- `GET auth/me`.
- `GET devices/me`.
- `PATCH devices/me`: `name?`, `model?`, `appVersion?`.

Il codice gestisce anche il `409 ORGANIZATION_SELECTION_REQUIRED`: conserva le credenziali soltanto in memoria per il tempo necessario a ripetere il login con l’organizzazione scelta.

## Sicurezza e rete

- access token aggiunto centralmente da un interceptor Dio;
- refresh eseguito da un client Dio separato per evitare ricorsione;
- una sola richiesta di refresh alla volta, condivisa dalle richieste concorrenti;
- retry della richiesta originale una sola volta;
- cancellazione locale e ritorno al login quando il refresh fallisce;
- access token, refresh token e installation ID in `flutter_secure_storage`;
- timeout espliciti e parser sia per errori Fluxa `{code,message}` sia per errori di validazione Nest.

## Configurazione

Usare `--dart-define=API_BASE_URL=...`; la URL deve includere `/api/v1`. Gli entrypoint sono:

- `lib/main_development.dart`;
- `lib/main_test.dart`;
- `lib/main_production.dart`.

## Gap backend che blocca il setup location

`GET /api/v1/devices/me` restituisce il record del dispositivo ma non la relativa `device_assignment` e quindi non espone `locationId`. `GET /api/v1/devices` contiene l’assegnazione, ma è riservato ai ruoli `OWNER`, `ADMIN` e `MANAGER`; un `CASHIER` o `WAITER` non può quindi ricavare la propria location operativa.

Per il Blocco 02 è consigliato uno dei seguenti contratti backend:

1. includere l’assegnazione attiva in `GET /devices/me`; oppure
2. aggiungere `GET /devices/me/assignment` accessibile al dispositivo autenticato.

Il frontend non simula né deduce la location finché il contratto non viene esposto.

## Verifiche

```powershell
flutter pub get
dart format lib test
flutter analyze
flutter test
flutter build web --release -t lib/main_production.dart --dart-define=API_BASE_URL=https://example.invalid/api/v1
```
