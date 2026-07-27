[CmdletBinding()]
param(
    [switch] $DryRun,
    [switch] $SkipVerify
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonScript = Join-Path -Path $PSScriptRoot -ChildPath 'Phase2.Common.ps1'

if (-not (Test-Path -LiteralPath $commonScript)) {
    throw "File condiviso non trovato: $commonScript"
}

. $commonScript

function Get-RepositoryRelativePath {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $RepositoryRoot,

        [Parameter(Mandatory)]
        [string] $FullPath
    )

    Push-Location -LiteralPath $RepositoryRoot

    try {
        $relativePath = Resolve-Path -LiteralPath $FullPath -Relative
    }
    finally {
        Pop-Location
    }

    $relativePath = $relativePath -replace '^[.][\\/]', ''
    return $relativePath.Replace('\', '/')
}

function Find-PhaseFiveMigration {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $DrizzleDirectory
    )

    $matches = @(
        Get-ChildItem -LiteralPath $DrizzleDirectory -Filter '*.sql' -File |
            Where-Object {
                $sql = [System.IO.File]::ReadAllText($_.FullName)

                $sql.Contains('payment_expires_at') -and
                $sql.Contains('reservations_payment_expiry_idx') -and
                $sql.Contains('reservations_payment_expiry_ck')
            }
    )

    if ($matches.Count -ne 1) {
        $details = @(
            $matches |
                ForEach-Object {
                    $_.FullName
                }
        ) -join [Environment]::NewLine

        throw @"
Impossibile identificare una sola migrazione della Fase 05.
Migrazioni candidate: $($matches.Count)

$details
"@
    }

    return $matches[0]
}

$repositoryRoot = Get-RepositoryRoot
$schemaPath = Join-Path -Path $repositoryRoot -ChildPath 'libs/database/src/schema.ts'
$drizzleDirectory = Join-Path -Path $repositoryRoot -ChildPath 'drizzle'
$conversionService = Join-Path -Path $repositoryRoot -ChildPath 'apps/api/src/reservations/reservation-conversion.service.ts'
$expiryService = Join-Path -Path $repositoryRoot -ChildPath 'apps/background-worker/src/reservation-payment-expiry.service.ts'
$verifyScript = Join-Path -Path $repositoryRoot -ChildPath 'scripts/verify-phase-5-reservation-conversion.mjs'

Write-Step -Message 'Ripresa Fase 05 dopo generazione migrazione'

Assert-RepoRoot -Path $repositoryRoot
Assert-Command -Name 'git'
Assert-Command -Name 'node'

$npmCommand = if ($env:OS -eq 'Windows_NT') {
    'npm.cmd'
}
else {
    'npm'
}

$npxCommand = if ($env:OS -eq 'Windows_NT') {
    'npx.cmd'
}
else {
    'npx'
}

Assert-Command -Name $npmCommand
Assert-Command -Name $npxCommand
Assert-NoWorkflowChanges -RepositoryRoot $repositoryRoot

$currentBranch = Get-CurrentGitBranch -RepositoryRoot $repositoryRoot

if ($currentBranch -eq 'main') {
    throw 'La Fase 05 non può essere completata direttamente su main.'
}

$requiredFiles = @(
    $schemaPath,
    $conversionService,
    $expiryService,
    $verifyScript
)

foreach ($requiredFile in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $requiredFile)) {
        throw "File Fase 05 non trovato: $requiredFile"
    }
}

$schema = [System.IO.File]::ReadAllText($schemaPath)
$conversion = [System.IO.File]::ReadAllText($conversionService)
$expiry = [System.IO.File]::ReadAllText($expiryService)

if (-not $schema.Contains("paymentExpiresAt: timestamp(")) {
    throw 'Campo paymentExpiresAt non trovato nello schema.'
}

if (-not $schema.Contains('reservations_payment_expiry_idx')) {
    throw 'Indice reservations_payment_expiry_idx non trovato nello schema.'
}

if (-not $schema.Contains('reservations_payment_expiry_ck')) {
    throw 'Constraint reservations_payment_expiry_ck non trovata nello schema.'
}

if (-not $conversion.Contains('PHASE_5_RESERVATION_CONVERSION')) {
    throw 'Marker Fase 05 non trovato nel servizio di conversione.'
}

if (-not $expiry.Contains('PHASE_5_RESERVATION_CONVERSION')) {
    throw 'Marker Fase 05 non trovato nel servizio di scadenza pagamento.'
}

$migration = Find-PhaseFiveMigration -DrizzleDirectory $drizzleDirectory
$relativeMigrationPath = Get-RepositoryRelativePath `
    -RepositoryRoot $repositoryRoot `
    -FullPath $migration.FullName

Write-Host "Migrazione rilevata: $relativeMigrationPath"

if ($DryRun) {
    Write-Step -Message 'DryRun ripresa Fase 05 completato'

    Write-Host @"
La ripresa userebbe la migrazione:

$relativeMigrationPath

Poi eseguirebbe:

- formattazione dei file Fase 05;
- verifica strutturale;
- lint backend e worker;
- test policy conversione;
- build NestJS completa.

La migrazione non verrebbe applicata al database.
"@

    return
}

Write-Step -Message 'Formattazione file Fase 05'

Invoke-Checked `
    -FilePath $npxCommand `
    -ArgumentList @(
        'prettier',
        '--write',
        'libs/database/src/schema.ts',
        'apps/api/src/reservations/**/*.ts',
        'apps/background-worker/src/background-worker.module.ts',
        'apps/background-worker/src/background.processor.ts',
        'apps/background-worker/src/reservation-payment-expiry.service.ts',
        'scripts/verify-phase-5-reservation-conversion.mjs',
        'docs/phase-2/reservation-conversion.md'
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Verifica strutturale Fase 05'

Invoke-Checked `
    -FilePath 'node' `
    -ArgumentList @(
        'scripts/verify-phase-5-reservation-conversion.mjs',
        $relativeMigrationPath
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

if (-not $SkipVerify) {
    Write-Step -Message 'Lint backend e worker'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'lint') `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }

    Write-Step -Message 'Test policy conversione reservation'

    Invoke-Checked `
        -FilePath $npxCommand `
        -ArgumentList @(
            'jest',
            '--runInBand',
            '--runTestsByPath',
            'apps/api/src/reservations/reservation-conversion-policy.spec.ts',
            '--roots',
            'apps/api/src/reservations'
        ) `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }

    Write-Step -Message 'Build API e worker'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'build') `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }
}

Assert-NoWorkflowChanges -RepositoryRoot $repositoryRoot
Show-GitDiffSummary -RepositoryRoot $repositoryRoot

Write-Step -Message 'Fase 05 completata'

Write-Host @"
Conversione hold → reservation verificata.

Migrazione:
$relativeMigrationPath

La migrazione non è stata applicata al database.

Controlli finali:

git status --short
git diff --check
git diff --stat
"@
