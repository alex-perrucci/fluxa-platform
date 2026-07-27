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

function Get-PhaseMigration {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $DrizzleDirectory
    )

    $matches = @(
        Get-ChildItem -LiteralPath $DrizzleDirectory -Filter '*.sql' -File |
            Where-Object {
                $content = [System.IO.File]::ReadAllText($_.FullName)

                return (
                    $content.Contains('CREATE TABLE "events"') -and
                    $content.Contains('CREATE TABLE "platform_fee_ledger"') -and
                    $content.Contains('CREATE TABLE "reservation_status_history"')
                )
            }
    )

    if ($matches.Count -eq 0) {
        throw @"
Migrazione Phase 2 non trovata.

Lo script principale dovrebbe aver generato un file simile a:

drizzle\0009_*.sql
"@
    }

    if ($matches.Count -gt 1) {
        $details = @(
            $matches |
                ForEach-Object {
                    $_.FullName
                }
        ) -join [Environment]::NewLine

        throw @"
Sono state trovate più migrazioni Phase 2:

$details
"@
    }

    return $matches[0]
}

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

$repositoryRoot = Get-RepositoryRoot
$drizzleDirectory = Join-Path -Path $repositoryRoot -ChildPath 'drizzle'
$schemaPath = Join-Path -Path $repositoryRoot -ChildPath 'libs/database/src/schema.ts'
$testPath = Join-Path -Path $repositoryRoot -ChildPath 'libs/database/src/schema.phase-2.spec.ts'
$verifyScriptPath = Join-Path -Path $repositoryRoot -ChildPath 'scripts/verify-phase-2-schema.mjs'
$documentationPath = Join-Path -Path $repositoryRoot -ChildPath 'docs/phase-2/reservations-schema.md'

Write-Step -Message 'Preflight ripresa Fase 02'

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
    throw 'La Fase 02 non può essere completata direttamente su main.'
}

$requiredFiles = @(
    $schemaPath,
    $testPath,
    $verifyScriptPath,
    $documentationPath
)

foreach ($path in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "File Phase 2 mancante: $path"
    }
}

$schemaContent = [System.IO.File]::ReadAllText($schemaPath)

$requiredMarkers = @(
    'PHASE_2_EVENTS_RESERVATIONS_ENUMS_START',
    'PHASE_2_EVENTS_RESERVATIONS_TABLES_START',
    'PHASE_2_EVENTS_RESERVATIONS_TYPES_START'
)

foreach ($marker in $requiredMarkers) {
    if (-not $schemaContent.Contains($marker)) {
        throw "Marker schema mancante: $marker"
    }
}

$phaseMigration = Get-PhaseMigration -DrizzleDirectory $drizzleDirectory
$relativeMigrationPath = Get-RepositoryRelativePath `
    -RepositoryRoot $repositoryRoot `
    -FullPath $phaseMigration.FullName

Write-Host "Migrazione rilevata: $relativeMigrationPath"

if ($DryRun) {
    Write-Step -Message 'DryRun ripresa Fase 02 completato'

    Write-Host @"
Verrebbero eseguiti:

- formattazione dei file Phase 2;
- verifica della migrazione;
- lint backend;
- test schema mirato;
- build completa.
"@

    return
}

Write-Step -Message 'Formattazione dei file Phase 2'

Invoke-Checked `
    -FilePath $npxCommand `
    -ArgumentList @(
        'prettier',
        '--write',
        'libs/database/src/schema.ts',
        'libs/database/src/schema.phase-2.spec.ts',
        'scripts/verify-phase-2-schema.mjs',
        'docs/phase-2/reservations-schema.md'
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Verifica della migrazione'

Invoke-Checked `
    -FilePath 'node' `
    -ArgumentList @(
        'scripts/verify-phase-2-schema.mjs',
        $relativeMigrationPath
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

if (-not $SkipVerify) {
    Write-Step -Message 'Lint backend'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'lint') `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }

    Write-Step -Message 'Test schema Phase 2'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @(
            'run',
            'test',
            '--',
            'libs/database/src/schema.phase-2.spec.ts'
        ) `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }

    Write-Step -Message 'Build backend e worker'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'build') `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }
}

Assert-NoWorkflowChanges -RepositoryRoot $repositoryRoot
Show-GitDiffSummary -RepositoryRoot $repositoryRoot

Write-Step -Message 'Fase 02 completata'

Write-Host @"
Migrazione verificata:
$relativeMigrationPath

La migrazione non è stata applicata al database.

Controlli finali:

git status --short
git diff --check
git diff --stat
"@
