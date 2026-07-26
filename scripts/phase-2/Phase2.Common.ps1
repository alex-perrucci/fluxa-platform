Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Message
    )

    Write-Host ''
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-RepositoryRoot {
    [CmdletBinding()]
    param()

    $parent = Join-Path -Path $PSScriptRoot -ChildPath '..'
    $root = Join-Path -Path $parent -ChildPath '..'
    return [System.IO.Path]::GetFullPath($root)
}

function Assert-RepoRoot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path
    )

    $requiredPaths = @(
        'package.json',
        'package-lock.json',
        'nest-cli.json',
        'drizzle.config.ts',
        'apps/api',
        'apps/fiscal-worker',
        'apps/background-worker',
        'apps/pos',
        'libs/database/src/schema.ts',
        'libs/queue/src/queue.module.ts',
        'drizzle'
    )

    foreach ($relativePath in $requiredPaths) {
        $candidate = Join-Path -Path $Path -ChildPath $relativePath

        if (-not (Test-Path -LiteralPath $candidate)) {
            throw @"
La directory indicata non sembra essere la root di fluxa-platform.

Root rilevata:
$Path

Percorso mancante:
$relativePath
"@
        }
    }
}

function Assert-Command {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Name
    )

    if (-not (Get-Command -Name $Name -ErrorAction SilentlyContinue)) {
        throw "Comando richiesto non disponibile: $Name"
    }
}

function Ensure-Directory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [switch] $DryRun
    )

    if (Test-Path -LiteralPath $Path) {
        return
    }

    if ($DryRun) {
        Write-Host "[DryRun] Creerebbe la directory: $Path"
        return
    }

    [System.IO.Directory]::CreateDirectory($Path) | Out-Null
    Write-Host "Directory creata: $Path"
}

function Write-Utf8File {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Content,

        [switch] $DryRun
    )

    $parentDirectory = Split-Path -Path $Path -Parent

    if (-not [string]::IsNullOrWhiteSpace($parentDirectory)) {
        Ensure-Directory -Path $parentDirectory -DryRun:$DryRun
    }

    $normalizedContent = $Content.Replace("`r`n", "`n").TrimEnd() + "`n"

    if (Test-Path -LiteralPath $Path) {
        $existingContent = [System.IO.File]::ReadAllText($Path)
        $normalizedExisting = $existingContent.Replace("`r`n", "`n")

        if ($normalizedExisting -eq $normalizedContent) {
            Write-Host "File invariato: $Path"
            return
        }
    }

    if ($DryRun) {
        Write-Host "[DryRun] Scriverebbe il file: $Path"
        return
    }

    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($Path, $normalizedContent, $encoding)
    Write-Host "File scritto: $Path"
}

function Invoke-Checked {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $FilePath,

        [string[]] $ArgumentList = @(),

        [string] $WorkingDirectory = (Get-Location).Path,

        [switch] $DryRun
    )

    $displayCommand = (@($FilePath) + $ArgumentList) -join ' '

    if ($DryRun) {
        Write-Host "[DryRun] $displayCommand"
        return @()
    }

    Push-Location -LiteralPath $WorkingDirectory

    $previousErrorActionPreference = $ErrorActionPreference

    try {
        # Windows PowerShell 5.1 converte qualsiasi output scritto su STDERR
        # da un comando nativo in NativeCommandError. npm usa STDERR anche
        # per semplici notice, pur terminando con exit code 0.
        #
        # Impostiamo temporaneamente Continue, catturiamo STDOUT e STDERR e
        # decidiamo il successo esclusivamente tramite LASTEXITCODE.
        $ErrorActionPreference = 'Continue'
        $output = @(& $FilePath @ArgumentList 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
        Pop-Location
    }

    if ($exitCode -ne 0) {
        $details = @(
            $output |
                ForEach-Object {
                    $_.ToString()
                }
        ) -join [Environment]::NewLine

        throw @"
Comando fallito con exit code ${exitCode}:

$displayCommand

Output:
$details
"@
    }

    return @(
        $output |
            ForEach-Object {
                $_.ToString()
            }
    )
}

function Test-FileContains {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Text
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
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Content,

        [switch] $DryRun
    )

    if (Test-FileContains -Path $Path -Text $Content) {
        Write-Host "Contenuto già presente: $Path"
        return
    }

    if ($DryRun) {
        Write-Host "[DryRun] Aggiungerebbe contenuto a: $Path"
        return
    }

    $parentDirectory = Split-Path -Path $Path -Parent

    if (-not [string]::IsNullOrWhiteSpace($parentDirectory)) {
        Ensure-Directory -Path $parentDirectory
    }

    $existingContent = if (Test-Path -LiteralPath $Path) {
        [System.IO.File]::ReadAllText($Path)
    }
    else {
        ''
    }

    $separator = if (
        $existingContent.Length -gt 0 -and
        -not $existingContent.EndsWith("`n")
    ) {
        "`n"
    }
    else {
        ''
    }

    $encoding = [System.Text.UTF8Encoding]::new($false)
    $newContent = $existingContent + $separator + $Content.TrimEnd() + "`n"

    [System.IO.File]::WriteAllText($Path, $newContent, $encoding)
    Write-Host "Contenuto aggiunto: $Path"
}

function Get-CurrentGitBranch {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $RepositoryRoot
    )

    $result = Invoke-Checked `
        -FilePath 'git' `
        -ArgumentList @('branch', '--show-current') `
        -WorkingDirectory $RepositoryRoot

    return (@($result) -join '').Trim()
}

function Assert-NoWorkflowChanges {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $RepositoryRoot
    )

    $changedFiles = @(
        Invoke-Checked `
            -FilePath 'git' `
            -ArgumentList @('status', '--short') `
            -WorkingDirectory $RepositoryRoot
    )

    $workflowChanges = @(
        $changedFiles |
            Where-Object {
                $_ -match '\.github[/\\]workflows'
            }
    )

    if ($workflowChanges.Count -gt 0) {
        $details = $workflowChanges -join [Environment]::NewLine

        throw @"
Sono state rilevate modifiche ai workflow GitHub, operazione vietata:

$details
"@
    }
}

function Show-GitDiffSummary {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $RepositoryRoot
    )

    Write-Step -Message 'Diff sintetico'

    $status = @(
        Invoke-Checked `
            -FilePath 'git' `
            -ArgumentList @('status', '--short') `
            -WorkingDirectory $RepositoryRoot
    )

    if ($status.Count -eq 0) {
        Write-Host 'Nessuna modifica rilevata.'
        return
    }

    foreach ($line in $status) {
        Write-Host $line
    }

    Write-Host ''

    $diffStat = @(
        Invoke-Checked `
            -FilePath 'git' `
            -ArgumentList @('diff', '--stat') `
            -WorkingDirectory $RepositoryRoot
    )

    foreach ($line in $diffStat) {
        Write-Host $line
    }
}
