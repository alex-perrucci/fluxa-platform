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
        throw 'Migrazione Phase 2 non trovata.'
    }

    if ($matches.Count -gt 1) {
        $details = @(
            $matches |
                ForEach-Object {
                    $_.FullName
                }
        ) -join [Environment]::NewLine

        throw "Più migrazioni Phase 2 rilevate:`n$details"
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
$rootEslintPath = Join-Path -Path $repositoryRoot -ChildPath 'eslint.config.mjs'
$webRoot = Join-Path -Path $repositoryRoot -ChildPath 'apps/web'
$drizzleDirectory = Join-Path -Path $repositoryRoot -ChildPath 'drizzle'

Write-Step -Message 'Preflight hotfix lint Fase 02'

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

if (-not (Test-Path -LiteralPath $rootEslintPath)) {
    throw "Configurazione ESLint root non trovata: $rootEslintPath"
}

if (-not (Test-Path -LiteralPath $webRoot)) {
    throw "Applicazione web non trovata: $webRoot"
}

Write-Step -Message 'Separazione degli scope ESLint'

$eslintContent = [System.IO.File]::ReadAllText($rootEslintPath).Replace("`r`n", "`n")

$oldIgnore = "    ignores: ['eslint.config.mjs'],"
$newIgnore = @"
    ignores: [
      'eslint.config.mjs',
      'apps/web/**',
    ],
"@.TrimEnd()

if ($eslintContent.Contains($oldIgnore)) {
    $eslintContent = $eslintContent.Replace($oldIgnore, $newIgnore)
}
elseif (-not $eslintContent.Contains("'apps/web/**'")) {
    throw @"
La struttura di eslint.config.mjs non coincide con quella prevista.

Lo script non modifica automaticamente una configurazione sconosciuta.
"@
}

Write-Utf8File `
    -Path $rootEslintPath `
    -Content $eslintContent `
    -DryRun:$DryRun

$phaseMigration = Get-PhaseMigration -DrizzleDirectory $drizzleDirectory
$relativeMigrationPath = Get-RepositoryRelativePath `
    -RepositoryRoot $repositoryRoot `
    -FullPath $phaseMigration.FullName

Write-Host "Migrazione rilevata: $relativeMigrationPath"

if ($DryRun) {
    Write-Step -Message 'DryRun hotfix lint completato'

    Write-Host @"
La configurazione ESLint root ignorerebbe apps/web/**.

Il frontend continuerà a essere verificato dal proprio comando:

cd apps/web
npm run lint
"@

    return
}

Write-Step -Message 'Formattazione configurazione ESLint'

Invoke-Checked `
    -FilePath $npxCommand `
    -ArgumentList @(
        'prettier',
        '--write',
        'eslint.config.mjs'
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

    Write-Step -Message 'Lint web separato'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'lint') `
        -WorkingDirectory $webRoot | ForEach-Object {
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
La configurazione ESLint root ora esclude apps/web/**.

Il frontend mantiene il proprio lint indipendente.

Migrazione verificata:
$relativeMigrationPath

La migrazione non è stata applicata al database.
"@
