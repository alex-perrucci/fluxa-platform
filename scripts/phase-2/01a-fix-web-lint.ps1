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

function Write-ExpectedFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Content,

        [switch] $DryRun
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File atteso non trovato: $Path"
    }

    Write-Utf8File -Path $Path -Content $Content -DryRun:$DryRun
}

$repositoryRoot = Get-RepositoryRoot
$webRoot = Join-Path -Path $repositoryRoot -ChildPath 'apps/web'

Write-Step -Message 'Preflight hotfix lint Fase 01'

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

if (-not (Test-Path -LiteralPath $webRoot)) {
    throw "Applicazione web non trovata: $webRoot"
}

$logoutRoutePath = Join-Path -Path $webRoot -ChildPath 'app/api/auth/logout/route.ts'
$eslintConfigPath = Join-Path -Path $webRoot -ChildPath 'eslint.config.mjs'
$postcssConfigPath = Join-Path -Path $webRoot -ChildPath 'postcss.config.mjs'

Write-Step -Message 'Correzione dei warning ESLint'

$logoutRouteContent = @'
import { NextRequest, NextResponse } from 'next/server';
import { fluxaServerFetch } from '@/lib/api/fluxa-api';
import {
  ACCESS_COOKIE,
  clearAuthCookies,
} from '@/lib/auth/cookies';

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;

  if (accessToken) {
    try {
      await fluxaServerFetch('/auth/logout', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      // La sessione locale viene rimossa anche se il backend è irraggiungibile.
    }
  }

  const response = NextResponse.json({ success: true });
  clearAuthCookies(response.cookies);
  return response;
}
'@

$eslintConfigContent = @'
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTypeScript,
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'node_modules/**',
      'next-env.d.ts',
    ],
  },
];

export default config;
'@

$postcssConfigContent = @'
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
'@

Write-ExpectedFile `
    -Path $logoutRoutePath `
    -Content $logoutRouteContent `
    -DryRun:$DryRun

Write-ExpectedFile `
    -Path $eslintConfigPath `
    -Content $eslintConfigContent `
    -DryRun:$DryRun

Write-ExpectedFile `
    -Path $postcssConfigPath `
    -Content $postcssConfigContent `
    -DryRun:$DryRun

if (-not $DryRun -and -not $SkipVerify) {
    Write-Step -Message 'Lint web'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'lint') `
        -WorkingDirectory $webRoot | ForEach-Object {
            Write-Host $_
        }

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

Write-Step -Message 'Hotfix lint completato'

Write-Host @"
Corretti:

- import non usato in app/api/auth/logout/route.ts;
- export anonimo in eslint.config.mjs;
- export anonimo in postcss.config.mjs.

Se lint, test e build sono verdi, la Fase 01 è completata.
"@
