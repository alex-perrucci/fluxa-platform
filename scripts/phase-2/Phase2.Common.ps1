Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Message
  )

  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Get-RepositoryRoot {
  [CmdletBinding()]
  param()

  return [System.IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..' '..')
  )
}

function Assert-RepoRoot {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  $requiredPaths = @(
    'package.json',
    'nest-cli.json',
    'drizzle.config.ts',
    'apps/api',
    'apps/pos',
    'libs/database/src/schema.ts',
    'libs/queue/src/queue.module.ts',
    'drizzle'
  )

  foreach ($relativePath in $requiredPaths) {
    $candidate = Join-Path $Path $relativePath
    if (-not (Test-Path -LiteralPath $candidate)) {
      throw "La directory '$Path' non è la root attesa di fluxa-platform: manca '$relativePath'."
    }
  }
}

function Assert-Command {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Name
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando richiesto non disponibile: $Name"
  }
}

function Ensure-Directory {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Path,
    [switch]$DryRun
  )

  if (Test-Path -LiteralPath $Path) {
    return
  }

  if ($DryRun) {
    Write-Host "[DryRun] Creerebbe directory: $Path"
    return
  }

  [System.IO.Directory]::CreateDirectory($Path) | Out-Null
}

function Write-Utf8File {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Path,
    [Parameter(Mandatory)]
    [string]$Content,
    [switch]$DryRun
  )

  $parent = Split-Path -Parent $Path
  if ($parent) {
    Ensure-Directory -Path $parent -DryRun:$DryRun
  }

  $normalized = $Content.Replace("`r`n", "`n").TrimEnd() + "`n"
  if (Test-Path -LiteralPath $Path) {
    $existing = [System.IO.File]::ReadAllText($Path)
    if ($existing.Replace("`r`n", "`n") -eq $normalized) {
      Write-Host "Invariato: $Path"
      return
    }
  }

  if ($DryRun) {
    Write-Host "[DryRun] Scriverebbe file UTF-8: $Path"
    return
  }

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $normalized, $encoding)
  Write-Host "Scritto: $Path"
}

function Invoke-Checked {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$FilePath,
    [string[]]$ArgumentList = @(),
    [string]$WorkingDirectory = (Get-Location).Path,
    [switch]$DryRun
  )

  $display = @($FilePath) + $ArgumentList -join ' '
  if ($DryRun) {
    Write-Host "[DryRun] $display"
    return @()
  }

  Push-Location $WorkingDirectory
  try {
    $output = & $FilePath @ArgumentList 2>&1
    if ($LASTEXITCODE -ne 0) {
      $details = $output -join [Environment]::NewLine
      throw "Comando fallito ($LASTEXITCODE): $display`n$details"
    }
    return $output
  }
  finally {
    Pop-Location
  }
}

function Test-FileContains {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Path,
    [Parameter(Mandatory)]
    [string]$Text
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return $false
  }

  return [System.IO.File]::ReadAllText($Path).Contains($Text)
}

function Add-ContentOnce {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)]
    [string]$Path,
    [Parameter(Mandatory)]
    [string]$Content,
    [switch]$DryRun
  )

  if (Test-FileContains -Path $Path -Text $Content) {
    Write-Host "Contenuto già presente: $Path"
    return
  }

  if ($DryRun) {
    Write-Host "[DryRun] Aggiungerebbe contenuto a: $Path"
    return
  }

  $parent = Split-Path -Parent $Path
  if ($parent) {
    Ensure-Directory -Path $parent
  }

  $encoding = [System.Text.UTF8Encoding]::new($false)
  $existing = if (Test-Path -LiteralPath $Path) {
    [System.IO.File]::ReadAllText($Path)
  }
  else {
    ''
  }
  $separator = if ($existing.Length -gt 0 -and -not $existing.EndsWith("`n")) {
    "`n"
  }
  else {
    ''
  }
  [System.IO.File]::WriteAllText(
    $Path,
    $existing + $separator + $Content.TrimEnd() + "`n",
    $encoding
  )
}
