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

$repositoryRoot = Get-RepositoryRoot
$webRoot = Join-Path -Path $repositoryRoot -ChildPath 'apps/web'
$vitestConfigPath = Join-Path -Path $webRoot -ChildPath 'vitest.config.ts'

Write-Step -Message 'Preflight hotfix alias Vitest'

Assert-RepoRoot -Path $repositoryRoot
Assert-Command -Name 'git'

$npmCommand = if ($env:OS -eq 'Windows_NT') {
    'npm.cmd'
}
else {
    'npm'
}

Assert-Command -Name $npmCommand
Assert-NoWorkflowChanges -RepositoryRoot $repositoryRoot

if (-not (Test-Path -LiteralPath $vitestConfigPath)) {
    throw "Configurazione Vitest non trovata: $vitestConfigPath"
}

Write-Step -Message 'Configurazione alias @ per Vitest'

$vitestConfigContent = @'
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': projectRoot,
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    passWithNoTests: false,
  },
});
'@

Write-Utf8File `
    -Path $vitestConfigPath `
    -Content $vitestConfigContent `
    -DryRun:$DryRun

if (-not $DryRun -and -not $SkipVerify) {
    Write-Step -Message 'Test web'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'test') `
        -WorkingDirectory $webRoot | ForEach-Object {
            Write-Host $_
        }

    Write-Step -Message 'Build web'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'build') `
        -WorkingDirectory $webRoot | ForEach-Object {
            Write-Host $_
        }
}

Assert-NoWorkflowChanges -RepositoryRoot $repositoryRoot

if (-not $DryRun) {
    Show-GitDiffSummary -RepositoryRoot $repositoryRoot
}

Write-Step -Message 'Hotfix Vitest completato'

Write-Host @"
È stato configurato l'alias @ nella risoluzione moduli di Vitest.

Se test e build sono verdi, la Fase 01 è completata.
"@
