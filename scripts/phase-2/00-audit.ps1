param(
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'Phase2.Common.ps1')

$repoRoot = Get-RepositoryRoot
Assert-RepoRoot -Path $repoRoot
Assert-Command -Name 'git'
Assert-Command -Name 'node'
Assert-Command -Name 'npm'

Write-Step 'Verifica repository e branch'
$branch = (Invoke-Checked -FilePath 'git' -ArgumentList @('branch', '--show-current') -WorkingDirectory $repoRoot) -join ''
$status = Invoke-Checked -FilePath 'git' -ArgumentList @('status', '--short') -WorkingDirectory $repoRoot
$head = (Invoke-Checked -FilePath 'git' -ArgumentList @('rev-parse', 'HEAD') -WorkingDirectory $repoRoot) -join ''

Write-Host "Branch: $branch"
Write-Host "HEAD: $head"
if ($status.Count -gt 0) {
  Write-Warning 'La working tree contiene modifiche locali. Lo script non le altera.'
  $status | ForEach-Object { Write-Host "  $_" }
}

Write-Step 'Verifica toolchain dichiarata'
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'package.json') | ConvertFrom-Json
$nestConfig = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'nest-cli.json') | ConvertFrom-Json

Write-Host "Node richiesto: $($packageJson.engines.node)"
Write-Host "npm richiesto: $($packageJson.engines.npm)"
Write-Host "Nest monorepo: $($nestConfig.monorepo)"
Write-Host "Progetti Nest: $((@($nestConfig.projects.PSObject.Properties.Name) -join ', '))"

Write-Step 'Verifica struttura applicativa'
$required = @(
  'apps/api',
  'apps/fiscal-worker',
  'apps/background-worker',
  'apps/pos',
  'libs/config',
  'libs/database',
  'libs/queue',
  'drizzle',
  'docker-compose.yml'
)
foreach ($relativePath in $required) {
  $exists = Test-Path -LiteralPath (Join-Path $repoRoot $relativePath)
  Write-Host ("{0,-35} {1}" -f $relativePath, $(if ($exists) { 'OK' } else { 'MISSING' }))
  if (-not $exists) {
    throw "Struttura inattesa: manca $relativePath"
  }
}

Write-Step 'Verifica domini e infrastruttura riutilizzabili'
$checks = [ordered]@{
  'Identità e multi-tenancy' = 'apps/api/src/auth'
  'Organizzazioni' = 'apps/api/src/organizations'
  'Merchant' = 'apps/api/src/merchants'
  'Location' = 'apps/api/src/locations'
  'Sale e tavoli' = 'apps/api/src/hospitality'
  'Ordini' = 'apps/api/src/orders'
  'Pagamenti' = 'apps/api/src/payments'
  'Stampa' = 'apps/api/src/printing'
  'Fiscale A-Cube' = 'apps/api/src/fiscal'
  'Audit e outbox schema' = 'libs/database/src/schema.ts'
  'Redis e BullMQ' = 'libs/queue/src/queue.module.ts'
}
foreach ($entry in $checks.GetEnumerator()) {
  $exists = Test-Path -LiteralPath (Join-Path $repoRoot $entry.Value)
  Write-Host ("{0,-35} {1}" -f $entry.Key, $(if ($exists) { 'OK' } else { 'MISSING' }))
}

Write-Step 'Controlli non invasivi'
Invoke-Checked -FilePath 'npm' -ArgumentList @('run', 'lint', '--', '--help') -WorkingDirectory $repoRoot -DryRun:$DryRun | Out-Null
Invoke-Checked -FilePath 'npm' -ArgumentList @('run', 'test', '--', '--help') -WorkingDirectory $repoRoot -DryRun:$DryRun | Out-Null
Invoke-Checked -FilePath 'npm' -ArgumentList @('run', 'build', '--', '--help') -WorkingDirectory $repoRoot -DryRun:$DryRun | Out-Null

Write-Step 'Esito audit'
Write-Host 'La Fase 2 deve estendere il backend NestJS esistente e mantenere PostgreSQL come unica fonte autorevole.'
Write-Host 'Nessun file applicativo, migrazione, dipendenza o workflow viene modificato dalla Fase 00.'
Write-Host 'Documenti prodotti e versionati in docs/phase-2/.'
