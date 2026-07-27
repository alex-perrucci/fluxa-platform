[CmdletBinding()]
param(
    [switch] $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonScript = Join-Path -Path $PSScriptRoot -ChildPath 'Phase2.Common.ps1'

if (-not (Test-Path -LiteralPath $commonScript)) {
    throw "File condiviso non trovato: $commonScript"
}

. $commonScript

$repositoryRoot = Get-RepositoryRoot
$documentationDirectory = Join-Path -Path $repositoryRoot -ChildPath 'docs/phase-2'

Write-Step -Message 'Verifica della repository'

Assert-RepoRoot -Path $repositoryRoot
Assert-Command -Name 'git'
Assert-Command -Name 'node'
Assert-Command -Name 'npm'
Assert-NoWorkflowChanges -RepositoryRoot $repositoryRoot

$currentBranch = Get-CurrentGitBranch -RepositoryRoot $repositoryRoot

if ([string]::IsNullOrWhiteSpace($currentBranch)) {
    throw 'Impossibile determinare il branch Git corrente.'
}

Write-Host "Repository: $repositoryRoot"
Write-Host "Branch: $currentBranch"

if ($currentBranch -eq 'main') {
    Write-Warning @"
Stai eseguendo l'audit sul branch main.

L'audit non modifica il codice applicativo, ma genera documentazione.
Prima delle fasi successive crea un branch dedicato:

git switch -c feature/phase-2-events-reservations
"@
}

Write-Step -Message 'Raccolta delle versioni'

$gitVersion = (
    Invoke-Checked `
        -FilePath 'git' `
        -ArgumentList @('--version') `
        -WorkingDirectory $repositoryRoot
) -join ''

$nodeVersion = (
    Invoke-Checked `
        -FilePath 'node' `
        -ArgumentList @('--version') `
        -WorkingDirectory $repositoryRoot
) -join ''

$npmVersion = (
    Invoke-Checked `
        -FilePath 'npm' `
        -ArgumentList @('--version') `
        -WorkingDirectory $repositoryRoot
) -join ''

Write-Host $gitVersion
Write-Host "Node: $nodeVersion"
Write-Host "npm: $npmVersion"

Write-Step -Message 'Analisi della struttura'

$packagePath = Join-Path -Path $repositoryRoot -ChildPath 'package.json'
$nestPath = Join-Path -Path $repositoryRoot -ChildPath 'nest-cli.json'
$schemaPath = Join-Path -Path $repositoryRoot -ChildPath 'libs/database/src/schema.ts'
$queuePath = Join-Path -Path $repositoryRoot -ChildPath 'libs/queue/src/queue.module.ts'
$appModulePath = Join-Path -Path $repositoryRoot -ChildPath 'apps/api/src/app.module.ts'
$dockerComposePath = Join-Path -Path $repositoryRoot -ChildPath 'docker-compose.yml'
$appsPath = Join-Path -Path $repositoryRoot -ChildPath 'apps'
$apiSourcePath = Join-Path -Path $repositoryRoot -ChildPath 'apps/api/src'
$drizzlePath = Join-Path -Path $repositoryRoot -ChildPath 'drizzle'

$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$nestConfiguration = Get-Content -LiteralPath $nestPath -Raw | ConvertFrom-Json

$appDirectories = @(
    Get-ChildItem -LiteralPath $appsPath -Directory |
        Sort-Object -Property Name
)

$apiModuleDirectories = @(
    Get-ChildItem -LiteralPath $apiSourcePath -Directory |
        Sort-Object -Property Name
)

$migrationFiles = @(
    Get-ChildItem -LiteralPath $drizzlePath -File -Recurse |
        Where-Object {
            $_.Extension -in @('.sql', '.json')
        }
)

$trackedFiles = @(
    Invoke-Checked `
        -FilePath 'git' `
        -ArgumentList @('ls-files') `
        -WorkingDirectory $repositoryRoot
)

$statusLines = @(
    Invoke-Checked `
        -FilePath 'git' `
        -ArgumentList @('status', '--short') `
        -WorkingDirectory $repositoryRoot
)

$workingTreeStatus = if ($statusLines.Count -eq 0) {
    'Pulito'
}
else {
    "Contiene $($statusLines.Count) modifica/e locale/i"
}

$webExists = Test-Path -LiteralPath (
    Join-Path -Path $repositoryRoot -ChildPath 'apps/web'
)

$schemaContent = Get-Content -LiteralPath $schemaPath -Raw
$queueContent = Get-Content -LiteralPath $queuePath -Raw
$appModuleContent = Get-Content -LiteralPath $appModulePath -Raw

$detectedDomains = [ordered]@{
    Authentication = $schemaContent.Contains('auth_sessions')
    Organizations  = $schemaContent.Contains('organizations')
    Memberships    = $schemaContent.Contains('organization_memberships')
    Merchants      = $schemaContent.Contains('merchants')
    Locations      = $schemaContent.Contains('locations')
    DiningAreas    = $schemaContent.Contains('dining_areas')
    DiningTables   = $schemaContent.Contains('dining_tables')
    TableSessions  = $schemaContent.Contains('table_sessions')
    Orders         = $schemaContent.Contains('orders')
    Payments       = $schemaContent.Contains('payment_transactions')
    Printing       = $schemaContent.Contains('print_jobs')
    Fiscal         = $schemaContent.Contains('fiscal_documents')
    Audit          = $schemaContent.Contains('audit_events')
    Outbox         = $schemaContent.Contains('outbox_events')
}

$detectedDomainLines = @(
    foreach ($entry in $detectedDomains.GetEnumerator()) {
        "- $($entry.Key): $($entry.Value)"
    }
)

$appNames = @(
    $appDirectories |
        ForEach-Object {
            "- apps/$($_.Name)"
        }
)

$apiModuleNames = @(
    $apiModuleDirectories |
        ForEach-Object {
            "- $($_.Name)"
        }
)

$nestProjects = @(
    $nestConfiguration.projects.PSObject.Properties |
        ForEach-Object {
            "- $($_.Name): $($_.Value.sourceRoot)"
        }
)

$packageScripts = @(
    $package.scripts.PSObject.Properties |
        Sort-Object -Property Name |
        ForEach-Object {
            "- $($_.Name): $($_.Value)"
        }
)

Write-Step -Message 'Generazione della documentazione'

$currentArchitecture = @(
    '# Fluxa Phase 2 — Architettura corrente'
    ''
    'Documento generato da scripts/phase-2/00-audit.ps1.'
    ''
    '## Contesto Git'
    ''
    "- Branch analizzato: $currentBranch"
    "- Working tree: $workingTreeStatus"
    "- File versionati rilevati: $($trackedFiles.Count)"
    ''
    '## Toolchain'
    ''
    "- $gitVersion"
    "- Node: $nodeVersion"
    "- npm: $npmVersion"
    '- Package manager: npm con package-lock.json'
    "- Versione applicazione backend: $($package.version)"
    ''
    '## Applicazioni'
    ''
    $appNames
    ''
    "apps/web presente: $webExists"
    ''
    '## Progetti NestJS'
    ''
    $nestProjects
    ''
    'Il backend è già una monorepo NestJS con API, fiscal worker e background worker.'
    ''
    '## Moduli API rilevati'
    ''
    $apiModuleNames
    ''
    '## Database'
    ''
    '- ORM/schema: Drizzle ORM'
    '- Schema autorevole: libs/database/src/schema.ts'
    '- Directory migrazioni: drizzle/'
    "- File di migrazione/metadati rilevati: $($migrationFiles.Count)"
    '- PostgreSQL: previsto dal progetto'
    ''
    '## Redis e code'
    ''
    "- BullMQ configurato: $($queueContent.Contains('BullModule'))"
    "- Coda fiscale rilevata: $($queueContent.Contains('FISCAL_QUEUE'))"
    "- Coda background rilevata: $($queueContent.Contains('BACKGROUND_QUEUE'))"
    ''
    '## Domini rilevati nello schema'
    ''
    $detectedDomainLines
    ''
    '## Sicurezza applicativa'
    ''
    "- Guard JWT globale rilevata: $($appModuleContent.Contains('JwtAuthGuard'))"
    "- Guard tenant globale rilevata: $($appModuleContent.Contains('TenantContextGuard'))"
    "- Guard ruoli globale rilevata: $($appModuleContent.Contains('AuthorizationGuard'))"
    "- Rate limiting rilevato: $($appModuleContent.Contains('ThrottlerModule'))"
    ''
    '## Docker locale'
    ''
    "- docker-compose.yml presente: $(Test-Path -LiteralPath $dockerComposePath)"
    '- PostgreSQL e Redis devono restare infrastrutture condivise per POS e web.'
    ''
    '## Script npm rilevati'
    ''
    $packageScripts
    ''
    '## Conclusione'
    ''
    'La Fase 2 deve estendere il backend corrente e non creare un secondo backend o un secondo database.'
) -join "`n"

$domainBoundaries = @'
# Fluxa Phase 2 — Confini dei domini

## Principio generale

Fluxa API e PostgreSQL restano la fonte autorevole per:

- identità;
- tenant;
- location;
- tavoli;
- eventi;
- prenotazioni;
- pagamenti;
- commissioni;
- ordini;
- fiscalizzazione.

Il sito Next.js non deve contenere un secondo dominio backend indipendente.

## Domini esistenti da riutilizzare

### Identità

Riutilizzare:

- users;
- auth_sessions;
- devices;
- organization_memberships;
- ruoli e autorizzazioni.

Non creare una seconda tabella utenti per il sito web.

### Tenant

Riutilizzare:

- organizations;
- merchants;
- locations;
- platformAdmin;
- membership tenant-scoped.

Un amministratore tenant non equivale a un platform admin.

### Hospitality

Riutilizzare:

- dining_areas;
- dining_tables;
- table_sessions.

Una prenotazione futura non è una table_session.

La table_session nasce quando il cliente arriva e il tavolo viene occupato operativamente.

### Orders e pagamenti POS

Riutilizzare:

- orders;
- checkouts;
- payment_transactions.

Il pagamento della prenotazione online deve restare separato dal pagamento dell'ordine consumato nel locale.

### Fiscalità

Riutilizzare:

- fiscal_profiles;
- fiscal_documents;
- fiscal worker;
- adapter A-Cube.

Il pagamento della prenotazione non deve essere fiscalizzato automaticamente senza una regola fiscale esplicita.

### Affidabilità

Riutilizzare:

- audit_events;
- outbox_events;
- Redis;
- BullMQ;
- optimistic concurrency;
- transazioni PostgreSQL.

## Nuovo dominio Events

Il dominio Events gestirà:

- evento;
- immagini e locandina;
- pubblicazione;
- periodo di prenotazione;
- capacità;
- prezzo;
- inventario dei tavoli;
- regole di cancellazione.

Un evento appartiene a una organization e a una location.

## Nuovo dominio Reservations

Il dominio Reservations gestirà:

- hold temporaneo;
- prenotazione;
- dati del cliente;
- numero di ospiti;
- assegnazione tavolo;
- stato;
- check-in;
- no-show;
- cancellazione;
- rimborso;
- collegamento successivo alla table session.

## Nuovo dominio Booking Payments

Booking Payments gestirà:

- sessione di pagamento;
- webhook provider;
- idempotenza;
- importo pagato;
- commissione Fluxa;
- importo spettante al locale;
- costi del provider;
- rimborsi;
- ledger.

Non deve riutilizzare payment_transactions senza una decisione esplicita, perché quelle transazioni rappresentano il checkout POS.

## Realtime

Il realtime serve a notificare cambiamenti già confermati.

Non deve essere usato per impedire overbooking.

La prevenzione dell'overbooking deve avvenire tramite:

- transazioni PostgreSQL;
- locking;
- unique constraint;
- controlli di stato;
- idempotency key.

## Flusso finale previsto

Evento pubblicato
→ cliente crea hold
→ backend riserva temporaneamente un tavolo
→ cliente avvia pagamento
→ webhook verifica il pagamento
→ prenotazione confermata
→ gestionale e POS ricevono aggiornamento
→ cliente arriva
→ check-in
→ table session
→ ordine
→ pagamento POS
→ eventuale fiscalizzazione A-Cube
'@

$implementationPlan = @'
# Fluxa Phase 2 — Piano di implementazione

## Obiettivo

Aggiungere a Fluxa:

1. portale pubblico degli eventi;
2. prenotazioni online;
3. pagamenti con commissione;
4. gestionale esercente;
5. super-admin Fluxa;
6. realtime;
7. integrazione con il POS Flutter.

## Fase 01 — Scaffold web

Creare apps/web con:

- Next.js App Router;
- TypeScript strict;
- Tailwind;
- client HTTP per Fluxa API;
- autenticazione collegata al backend esistente;
- route pubbliche, merchant e platform-admin.

Nessun nuovo backend Next.js.

## Fase 02 — Schema dati

Aggiungere migrazioni per:

- events;
- event_media;
- event_table_inventory;
- event_booking_rules;
- reservations;
- reservation_holds;
- reservation_table_assignments;
- reservation_payments;
- platform_fee_rules;
- platform_fee_ledger;
- reservation_status_history.

Le vecchie migrazioni non devono essere modificate.

## Fase 03 — API eventi

Aggiungere un modulo Events tenant-scoped con:

- CRUD;
- pubblicazione;
- annullamento;
- media;
- inventario tavoli;
- optimistic concurrency;
- audit e outbox.

## Fase 04 — Booking engine

Aggiungere:

- catalogo pubblico degli eventi;
- disponibilità;
- hold temporanei;
- scelta automatica del tavolo più piccolo adeguato;
- scadenza degli hold;
- protezione concorrente dall'overbooking.

## Fase 05 — Pagamenti

Introdurre BookingPaymentProvider e provider mock.

La conferma deve arrivare esclusivamente da un webhook verificato.

Salvare sempre:

- importo;
- valuta;
- commissione;
- quota locale;
- idempotency key;
- provider payment ID;
- webhook event ID;
- rimborsi.

## Fase 06 — Portale pubblico

Implementare:

- elenco eventi;
- dettaglio;
- immagini;
- disponibilità;
- prenotazione;
- pagamento;
- conferma;
- QR code;
- recupero prenotazione.

## Fase 07 — Gestionale esercente

Implementare:

- gestione eventi;
- inventario tavoli;
- prenotazioni;
- check-in;
- no-show;
- rimborsi;
- incassi;
- commissioni;
- esportazione CSV.

## Fase 08 — Platform admin

Aggiungere onboarding transazionale per:

- organization;
- owner;
- membership;
- merchant;
- location;
- fee rule.

Il platform admin deve essere distinto dall'admin tenant.

## Fase 09 — Realtime

Preferire SSE per aggiornamenti server-client.

Utilizzare:

- outbox;
- Redis come bus;
- canali organization/location;
- reconnect;
- fallback polling.

## Fase 10 — POS Flutter

Aggiungere:

- prenotazioni di oggi;
- prossimi arrivi;
- ricerca;
- check-in;
- assegnazione tavolo;
- apertura table session;
- collegamento reservation/table session.

## Fase 11 — Hardening

Aggiungere:

- rate limiting pubblico;
- protezione enumerazione;
- token pubblici sicuri;
- retention;
- privacy;
- logging;
- metriche;
- dead-letter handling;
- documentazione deploy e restore;
- test end-to-end.

## File esistenti da riutilizzare

- apps/api/src/auth/
- apps/api/src/organizations/
- apps/api/src/merchants/
- apps/api/src/locations/
- apps/api/src/hospitality/
- apps/api/src/orders/
- apps/api/src/payments/
- apps/api/src/fiscal/
- libs/database/src/schema.ts
- libs/database/
- libs/queue/
- apps/background-worker/
- apps/pos/

## Nuovi moduli backend previsti

- apps/api/src/events/
- apps/api/src/reservations/
- apps/api/src/booking-payments/
- apps/api/src/platform-admin/
- apps/api/src/realtime/

## Rischi principali

1. overbooking concorrente;
2. webhook duplicati;
3. pagamento confermato dopo scadenza hold;
4. accesso cross-tenant;
5. rimborsi parziali;
6. modifica delle commissioni dopo il pagamento;
7. collegamento errato tra prenotazione e table session;
8. gestione fiscale del deposito;
9. file upload non sicuri;
10. perdita di eventi realtime.

## Decisioni da confermare prima della Fase 05

- provider di pagamento;
- modello Stripe Connect o incasso centralizzato;
- percentuale predefinita Fluxa;
- trattamento dei costi del provider;
- regole di rimborso;
- trattamento fiscale del deposito;
- chi emette il documento fiscale;
- object storage scelto;
- dominio pubblico del portale.

## Verifiche obbligatorie

Ogni fase deve verificare:

- lint;
- test;
- build;
- isolamento tenant;
- nessuna modifica ai workflow;
- nessuna regressione sui moduli esistenti.
'@

Write-Utf8File `
    -Path (Join-Path -Path $documentationDirectory -ChildPath 'current-architecture.md') `
    -Content $currentArchitecture `
    -DryRun:$DryRun

Write-Utf8File `
    -Path (Join-Path -Path $documentationDirectory -ChildPath 'domain-boundaries.md') `
    -Content $domainBoundaries `
    -DryRun:$DryRun

Write-Utf8File `
    -Path (Join-Path -Path $documentationDirectory -ChildPath 'implementation-plan.md') `
    -Content $implementationPlan `
    -DryRun:$DryRun

Assert-NoWorkflowChanges -RepositoryRoot $repositoryRoot

if (-not $DryRun) {
    Show-GitDiffSummary -RepositoryRoot $repositoryRoot
}

Write-Step -Message 'Audit completato'

Write-Host @"
Sono stati generati esclusivamente:

- docs/phase-2/current-architecture.md
- docs/phase-2/domain-boundaries.md
- docs/phase-2/implementation-plan.md

Nessun file applicativo, dipendenza, migrazione o workflow è stato modificato.
"@
