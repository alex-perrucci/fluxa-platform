[CmdletBinding()]
param(
    [switch] $DryRun,
    [switch] $SkipInstall,
    [switch] $SkipVerify
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonScript = Join-Path -Path $PSScriptRoot -ChildPath 'Phase2.Common.ps1'

if (-not (Test-Path -LiteralPath $commonScript)) {
    throw "File condiviso non trovato: $commonScript"
}

. $commonScript

function Write-ScaffoldFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Content,

        [switch] $DryRun
    )

    $normalized = $Content.Replace("`r`n", "`n").TrimEnd() + "`n"

    if (Test-Path -LiteralPath $Path) {
        $existing = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")

        if ($existing -eq $normalized) {
            Write-Host "File invariato: $Path"
            return
        }

        throw @"
Il file esiste ma non coincide con lo scaffold previsto:

$Path

Lo script non lo sovrascrive automaticamente.
"@
    }

    Write-Utf8File -Path $Path -Content $Content -DryRun:$DryRun
}

$repositoryRoot = Get-RepositoryRoot
$webRoot = Join-Path -Path $repositoryRoot -ChildPath 'apps/web'
$markerPath = Join-Path -Path $webRoot -ChildPath '.fluxa-phase-2-scaffold'

Write-Step -Message 'Preflight Fase 01'

Assert-RepoRoot -Path $repositoryRoot
Assert-Command -Name 'git'
Assert-Command -Name 'node'

$npmCommand = if ($env:OS -eq 'Windows_NT') {
    'npm.cmd'
}
else {
    'npm'
}

Assert-Command -Name $npmCommand
Assert-NoWorkflowChanges -RepositoryRoot $repositoryRoot

$currentBranch = Get-CurrentGitBranch -RepositoryRoot $repositoryRoot

if ($currentBranch -eq 'main') {
    throw @"
La Fase 01 non può essere eseguita direttamente su main.

Crea prima un branch dedicato, per esempio:

git switch -c feature/phase-2-web-reservations
"@
}

$phaseZeroDocuments = @(
    'docs/phase-2/current-architecture.md',
    'docs/phase-2/domain-boundaries.md',
    'docs/phase-2/implementation-plan.md'
)

foreach ($relativePath in $phaseZeroDocuments) {
    $candidate = Join-Path -Path $repositoryRoot -ChildPath $relativePath

    if (-not (Test-Path -LiteralPath $candidate)) {
        throw "Documento della Fase 00 mancante: $relativePath"
    }
}

if ((Test-Path -LiteralPath $webRoot) -and -not (Test-Path -LiteralPath $markerPath)) {
    $existingFiles = @(
        Get-ChildItem -LiteralPath $webRoot -Force -ErrorAction SilentlyContinue
    )

    if ($existingFiles.Count -gt 0) {
        throw @"
apps/web esiste già e non contiene il marker dello scaffold Fluxa.

Lo script si ferma per evitare di sovrascrivere un'applicazione esistente.
"@
    }
}

Write-Step -Message 'Creazione dello scaffold Next.js'

$content_apps_web_package_json = @'
{
  "name": "@fluxa/web",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=22 <25",
    "npm": ">=10"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "16.2.11",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.0",
    "@types/node": "24.0.0",
    "@types/react": "19.2.0",
    "@types/react-dom": "19.2.0",
    "eslint": "9.18.0",
    "eslint-config-next": "16.2.11",
    "tailwindcss": "4.3.0",
    "typescript": "5.7.3",
    "vitest": "4.1.0"
  }
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\package.json') `
    -Content $content_apps_web_package_json `
    -DryRun:$DryRun

$content_apps_web_tsconfig_json = @'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    ".next/types/**/*.ts",
    "**/*.ts",
    "**/*.tsx"
  ],
  "exclude": ["node_modules"]
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\tsconfig.json') `
    -Content $content_apps_web_tsconfig_json `
    -DryRun:$DryRun

$content_apps_web_next_env_d_ts = @'
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// Questo file è gestito da Next.js.
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\next-env.d.ts') `
    -Content $content_apps_web_next_env_d_ts `
    -DryRun:$DryRun

$content_apps_web_next_config_ts = @'
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\next.config.ts') `
    -Content $content_apps_web_next_config_ts `
    -DryRun:$DryRun

$content_apps_web_postcss_config_mjs = @'
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\postcss.config.mjs') `
    -Content $content_apps_web_postcss_config_mjs `
    -DryRun:$DryRun

$content_apps_web_eslint_config_mjs = @'
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default [
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
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\eslint.config.mjs') `
    -Content $content_apps_web_eslint_config_mjs `
    -DryRun:$DryRun

$content_apps_web_vitest_config_ts = @'
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    passWithNoTests: false,
  },
});
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\vitest.config.ts') `
    -Content $content_apps_web_vitest_config_ts `
    -DryRun:$DryRun

$content_apps_web__env_example = @'
FLUXA_API_BASE_URL=http://localhost:3000/api/v1
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\.env.example') `
    -Content $content_apps_web__env_example `
    -DryRun:$DryRun

$content_apps_web__gitignore = @'
.next/
node_modules/
coverage/
.env
.env.local
.env.*.local
!.env.example
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\.gitignore') `
    -Content $content_apps_web__gitignore `
    -DryRun:$DryRun

$content_apps_web_app_globals_css = @'
@import "tailwindcss";

:root {
  color-scheme: dark;
  --background: #070b14;
  --surface: #101827;
  --surface-strong: #172238;
  --border: #273653;
  --text: #f6f8fc;
  --muted: #9eabc2;
  --accent: #6d8cff;
  --danger: #ff6b7a;
}

* {
  box-sizing: border-box;
}

html {
  min-height: 100%;
  background: var(--background);
}

body {
  min-height: 100vh;
  margin: 0;
  background:
    radial-gradient(circle at 15% 15%, rgb(109 140 255 / 16%), transparent 34rem),
    var(--background);
  color: var(--text);
  font-family: Arial, Helvetica, sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
input {
  font: inherit;
}

.shell {
  width: min(1120px, calc(100% - 2rem));
  margin-inline: auto;
}

.panel {
  border: 1px solid var(--border);
  border-radius: 1.25rem;
  background: rgb(16 24 39 / 88%);
  box-shadow: 0 1.5rem 5rem rgb(0 0 0 / 28%);
  backdrop-filter: blur(18px);
}

.muted {
  color: var(--muted);
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\globals.css') `
    -Content $content_apps_web_app_globals_css `
    -DryRun:$DryRun

$content_apps_web_app_layout_tsx = @'
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Fluxa',
    template: '%s | Fluxa',
  },
  description: 'Eventi, prenotazioni e operatività per locali e ristoranti.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\layout.tsx') `
    -Content $content_apps_web_app_layout_tsx `
    -DryRun:$DryRun

$content_apps_web_app__public__page_tsx = @'
import Link from 'next/link';
import { Card } from '@/components/ui/card';

export default function PublicHomePage() {
  return (
    <main className="shell py-16">
      <section className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em] text-blue-300">
            Fluxa Events
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Eventi, tavoli e prenotazioni collegati al gestionale del locale.
          </h1>
          <p className="muted mt-6 max-w-2xl text-lg leading-8">
            Questa è la base del nuovo portale web. Il catalogo pubblico degli eventi
            verrà collegato al backend Fluxa nelle fasi successive.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              className="rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white hover:bg-blue-400"
              href="/login"
            >
              Accedi al gestionale
            </Link>
            <Link
              className="rounded-xl border border-slate-700 px-5 py-3 font-semibold hover:bg-slate-900"
              href="/health"
            >
              Verifica configurazione
            </Link>
          </div>
        </div>

        <Card>
          <h2 className="text-xl font-semibold">Interfacce previste</h2>
          <ul className="muted mt-5 space-y-3">
            <li>Portale pubblico per le prenotazioni</li>
            <li>Gestionale web per gli esercenti</li>
            <li>Super-admin di piattaforma</li>
            <li>Integrazione con il POS Flutter</li>
          </ul>
        </Card>
      </section>
    </main>
  );
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\(public)\page.tsx') `
    -Content $content_apps_web_app__public__page_tsx `
    -DryRun:$DryRun

$content_apps_web_app__public__health_page_tsx = @'
import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { fluxaServerFetch } from '@/lib/api/fluxa-api';
import { getServerEnv } from '@/lib/config/env';

export const metadata: Metadata = {
  title: 'Configurazione',
};

export const dynamic = 'force-dynamic';

async function loadBackendHealth(): Promise<{
  ok: boolean;
  payload: unknown;
}> {
  try {
    const payload = await fluxaServerFetch<unknown>('/health/ready');
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      payload: error instanceof Error ? error.message : 'Errore sconosciuto',
    };
  }
}

export default async function HealthPage() {
  const environment = getServerEnv();
  const health = await loadBackendHealth();

  return (
    <main className="shell py-12">
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
          Diagnostica
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Configurazione web</h1>

        <dl className="mt-8 grid gap-5">
          <div>
            <dt className="muted text-sm">Fluxa API</dt>
            <dd className="mt-1 break-all font-mono text-sm">
              {environment.FLUXA_API_BASE_URL}
            </dd>
          </div>

          <div>
            <dt className="muted text-sm">Backend ready</dt>
            <dd className={health.ok ? 'mt-1 text-emerald-300' : 'mt-1 text-red-300'}>
              {health.ok ? 'Raggiungibile' : 'Non raggiungibile'}
            </dd>
          </div>
        </dl>

        <pre className="mt-8 overflow-auto rounded-xl border border-slate-800 bg-black/30 p-4 text-xs">
          {JSON.stringify(health.payload, null, 2)}
        </pre>
      </Card>
    </main>
  );
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\(public)\health\page.tsx') `
    -Content $content_apps_web_app__public__health_page_tsx `
    -DryRun:$DryRun

$content_apps_web_app__auth__login_page_tsx = @'
import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Accesso',
};

export default function LoginPage() {
  return (
    <main className="shell grid min-h-screen place-items-center py-10">
      <div className="w-full max-w-lg">
        <Link className="muted mb-5 inline-block text-sm hover:text-white" href="/">
          ← Torna al sito
        </Link>

        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
            Fluxa
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Accedi al gestionale</h1>
          <p className="muted mt-3">
            Usa lo stesso account gestito dal backend Fluxa.
          </p>

          <LoginForm />
        </Card>
      </div>
    </main>
  );
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\(auth)\login\page.tsx') `
    -Content $content_apps_web_app__auth__login_page_tsx `
    -DryRun:$DryRun

$content_apps_web_app_merchant_layout_tsx = @'
import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogoutButton } from '@/components/auth/logout-button';
import { requireMerchantSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function MerchantLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await requireMerchantSession();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/70 backdrop-blur">
        <div className="shell flex min-h-16 items-center justify-between gap-4">
          <div>
            <Link className="font-semibold" href="/merchant">
              Fluxa Gestionale
            </Link>
            <p className="muted text-xs">
              {session.organization?.name} · {session.session.role}
            </p>
          </div>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\merchant\layout.tsx') `
    -Content $content_apps_web_app_merchant_layout_tsx `
    -DryRun:$DryRun

$content_apps_web_app_merchant_page_tsx = @'
import { Card } from '@/components/ui/card';
import { requireMerchantSession } from '@/lib/auth/session';

export default async function MerchantDashboardPage() {
  const session = await requireMerchantSession();

  return (
    <main className="shell py-10">
      <h1 className="text-3xl font-semibold">
        Benvenuto, {session.user.displayName}
      </h1>
      <p className="muted mt-2">
        Lo scaffold è collegato all’autenticazione Fluxa. Eventi e prenotazioni
        verranno aggiunti nelle fasi successive.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        <Card>
          <p className="muted text-sm">Eventi pubblicati</p>
          <p className="mt-3 text-3xl font-semibold">—</p>
        </Card>
        <Card>
          <p className="muted text-sm">Prenotazioni di oggi</p>
          <p className="mt-3 text-3xl font-semibold">—</p>
        </Card>
        <Card>
          <p className="muted text-sm">Posti disponibili</p>
          <p className="mt-3 text-3xl font-semibold">—</p>
        </Card>
      </div>
    </main>
  );
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\merchant\page.tsx') `
    -Content $content_apps_web_app_merchant_page_tsx `
    -DryRun:$DryRun

$content_apps_web_app_platform_admin_layout_tsx = @'
import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogoutButton } from '@/components/auth/logout-button';
import { requirePlatformAdminSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function PlatformAdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await requirePlatformAdminSession();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/70 backdrop-blur">
        <div className="shell flex min-h-16 items-center justify-between gap-4">
          <div>
            <Link className="font-semibold" href="/platform-admin">
              Fluxa Platform Admin
            </Link>
            <p className="muted text-xs">{session.user.email}</p>
          </div>
          <LogoutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\platform-admin\layout.tsx') `
    -Content $content_apps_web_app_platform_admin_layout_tsx `
    -DryRun:$DryRun

$content_apps_web_app_platform_admin_page_tsx = @'
import { Card } from '@/components/ui/card';
import { requirePlatformAdminSession } from '@/lib/auth/session';

export default async function PlatformAdminPage() {
  const session = await requirePlatformAdminSession();

  return (
    <main className="shell py-10">
      <h1 className="text-3xl font-semibold">
        Amministrazione piattaforma
      </h1>
      <p className="muted mt-2">
        Accesso verificato per {session.user.displayName}. L’onboarding
        transazionale dei tenant verrà implementato nella Fase 08.
      </p>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <Card>
          <p className="muted text-sm">Organizzazioni attive</p>
          <p className="mt-3 text-3xl font-semibold">—</p>
        </Card>
        <Card>
          <p className="muted text-sm">Errori operativi</p>
          <p className="mt-3 text-3xl font-semibold">—</p>
        </Card>
      </div>
    </main>
  );
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\platform-admin\page.tsx') `
    -Content $content_apps_web_app_platform_admin_page_tsx `
    -DryRun:$DryRun

$content_apps_web_app_api_auth_login_route_ts = @'
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { LoginResponse } from '@/lib/auth/auth-types';
import {
  ACCESS_COOKIE,
  INSTALLATION_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  installationCookieOptions,
  refreshCookieOptions,
} from '@/lib/auth/cookies';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  organizationId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const input = loginSchema.parse(await request.json());
    const installationId =
      request.cookies.get(INSTALLATION_COOKIE)?.value ?? randomUUID();

    const result = await fluxaServerFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        device: {
          installationId,
          name: 'Fluxa Web',
          platform: 'WEB',
          model: 'Browser',
          appVersion: '0.1.0',
        },
      }),
    });

    const response = NextResponse.json({
      user: result.user,
      organization: result.organization,
      availableOrganizations: result.availableOrganizations,
    });

    response.cookies.set(
      ACCESS_COOKIE,
      result.tokens.accessToken,
      accessCookieOptions(result.tokens.expiresIn),
    );
    response.cookies.set(
      REFRESH_COOKIE,
      result.tokens.refreshToken,
      refreshCookieOptions(),
    );
    response.cookies.set(
      INSTALLATION_COOKIE,
      installationId,
      installationCookieOptions(),
    );

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          code: 'INVALID_LOGIN_INPUT',
          message: 'Controlla email, password e organizzazione.',
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    if (error instanceof FluxaApiError) {
      return NextResponse.json(
        {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        code: 'LOGIN_FAILED',
        message: 'Accesso non riuscito.',
      },
      { status: 500 },
    );
  }
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\api\auth\login\route.ts') `
    -Content $content_apps_web_app_api_auth_login_route_ts `
    -DryRun:$DryRun

$content_apps_web_app_api_auth_logout_route_ts = @'
import { NextRequest, NextResponse } from 'next/server';
import { fluxaServerFetch } from '@/lib/api/fluxa-api';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
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
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\api\auth\logout\route.ts') `
    -Content $content_apps_web_app_api_auth_logout_route_ts `
    -DryRun:$DryRun

$content_apps_web_app_api_auth_refresh_route_ts = @'
import { NextRequest, NextResponse } from 'next/server';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { RefreshResponse } from '@/lib/auth/auth-types';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  clearAuthCookies,
  refreshCookieOptions,
} from '@/lib/auth/cookies';

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json(
      {
        code: 'REFRESH_TOKEN_MISSING',
        message: 'Sessione non disponibile.',
      },
      { status: 401 },
    );
  }

  try {
    const result = await fluxaServerFetch<RefreshResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    const response = NextResponse.json({
      organization: result.organization,
    });

    response.cookies.set(
      ACCESS_COOKIE,
      result.tokens.accessToken,
      accessCookieOptions(result.tokens.expiresIn),
    );
    response.cookies.set(
      REFRESH_COOKIE,
      result.tokens.refreshToken,
      refreshCookieOptions(),
    );

    return response;
  } catch (error) {
    const status = error instanceof FluxaApiError ? error.status : 500;
    const response = NextResponse.json(
      {
        code:
          error instanceof FluxaApiError
            ? error.code
            : 'SESSION_REFRESH_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Aggiornamento sessione non riuscito.',
      },
      { status },
    );

    if (status === 401 || status === 403) {
      clearAuthCookies(response.cookies);
    }

    return response;
  }
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\api\auth\refresh\route.ts') `
    -Content $content_apps_web_app_api_auth_refresh_route_ts `
    -DryRun:$DryRun

$content_apps_web_app_api_auth_session_route_ts = @'
import { NextRequest, NextResponse } from 'next/server';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { MeResponse, RefreshResponse } from '@/lib/auth/auth-types';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  clearAuthCookies,
  refreshCookieOptions,
} from '@/lib/auth/cookies';

async function loadSession(accessToken: string) {
  return fluxaServerFetch<MeResponse>('/auth/me', {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (accessToken) {
    try {
      return NextResponse.json(await loadSession(accessToken));
    } catch (error) {
      if (!(error instanceof FluxaApiError) || error.status !== 401) {
        throw error;
      }
    }
  }

  if (!refreshToken) {
    return NextResponse.json(
      {
        code: 'SESSION_NOT_AVAILABLE',
        message: 'Sessione non disponibile.',
      },
      { status: 401 },
    );
  }

  try {
    const refreshed = await fluxaServerFetch<RefreshResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    const session = await loadSession(refreshed.tokens.accessToken);
    const response = NextResponse.json(session);

    response.cookies.set(
      ACCESS_COOKIE,
      refreshed.tokens.accessToken,
      accessCookieOptions(refreshed.tokens.expiresIn),
    );
    response.cookies.set(
      REFRESH_COOKIE,
      refreshed.tokens.refreshToken,
      refreshCookieOptions(),
    );

    return response;
  } catch (error) {
    const status = error instanceof FluxaApiError ? error.status : 500;
    const response = NextResponse.json(
      {
        code:
          error instanceof FluxaApiError
            ? error.code
            : 'SESSION_LOAD_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Impossibile caricare la sessione.',
      },
      { status },
    );

    if (status === 401 || status === 403) {
      clearAuthCookies(response.cookies);
    }

    return response;
  }
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\api\auth\session\route.ts') `
    -Content $content_apps_web_app_api_auth_session_route_ts `
    -DryRun:$DryRun

$content_apps_web_components_auth_login_form_tsx = @'
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface LoginResult {
  user?: {
    platformAdmin?: boolean;
  };
  organization?: {
    id: string;
  } | null;
  code?: string;
  message?: string;
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const organizationId = String(form.get('organizationId') ?? '').trim();

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
          ...(organizationId ? { organizationId } : {}),
        }),
      });

      const payload = (await response.json()) as LoginResult;

      if (!response.ok) {
        setError(payload.message ?? 'Accesso non riuscito.');
        return;
      }

      const destination =
        payload.user?.platformAdmin && !payload.organization
          ? '/platform-admin'
          : '/merchant';

      router.replace(destination);
      router.refresh();
    } catch {
      setError('Il server non è raggiungibile.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-8 grid gap-5" onSubmit={submit}>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Email</span>
        <input
          autoComplete="email"
          className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 outline-none focus:border-blue-400"
          name="email"
          required
          type="email"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">Password</span>
        <input
          autoComplete="current-password"
          className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 outline-none focus:border-blue-400"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-medium">
          ID organizzazione <span className="muted">(solo se richiesto)</span>
        </span>
        <input
          className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 outline-none focus:border-blue-400"
          name="organizationId"
          placeholder="UUID"
          type="text"
        />
      </label>

      {error ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}

      <button
        className="rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Accesso in corso…' : 'Accedi'}
      </button>
    </form>
  );
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\auth\login-form.tsx') `
    -Content $content_apps_web_components_auth_login_form_tsx `
    -DryRun:$DryRun

$content_apps_web_components_auth_logout_button_tsx = @'
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <button
      className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-900 disabled:opacity-60"
      disabled={pending}
      onClick={logout}
      type="button"
    >
      {pending ? 'Uscita…' : 'Esci'}
    </button>
  );
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\auth\logout-button.tsx') `
    -Content $content_apps_web_components_auth_logout_button_tsx `
    -DryRun:$DryRun

$content_apps_web_components_ui_card_tsx = @'
import type { ReactNode } from 'react';

export function Card({ children }: Readonly<{ children: ReactNode }>) {
  return <section className="panel p-6">{children}</section>;
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\ui\card.tsx') `
    -Content $content_apps_web_components_ui_card_tsx `
    -DryRun:$DryRun

$content_apps_web_lib_api_fluxa_api_ts = @'
import { getServerEnv } from '@/lib/config/env';

interface FluxaErrorBody {
  code?: unknown;
  message?: unknown;
}

export class FluxaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown,
  ) {
    super(message);
    this.name = 'FluxaApiError';
  }
}

function buildUrl(path: string): URL {
  const base = getServerEnv().FLUXA_API_BASE_URL.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');
  return new URL(`${base}/${normalizedPath}`);
}

async function parseResponse(response: Response): Promise<unknown> {
  const raw = await response.text();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export async function fluxaServerFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  headers.set('accept', 'application/json');

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
    cache: 'no-store',
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    const body =
      payload && typeof payload === 'object'
        ? (payload as FluxaErrorBody)
        : undefined;

    throw new FluxaApiError(
      response.status,
      typeof body?.code === 'string' ? body.code : 'FLUXA_API_ERROR',
      typeof body?.message === 'string'
        ? body.message
        : `Fluxa API ha risposto con HTTP ${response.status}.`,
      payload,
    );
  }

  return payload as T;
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\lib\api\fluxa-api.ts') `
    -Content $content_apps_web_lib_api_fluxa_api_ts `
    -DryRun:$DryRun

$content_apps_web_lib_api_fluxa_api_test_ts = @'
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FluxaApiError, fluxaServerFetch } from './fluxa-api';

describe('fluxaServerFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FLUXA_API_BASE_URL;
  });

  it('returns the decoded payload for a successful request', async () => {
    process.env.FLUXA_API_BASE_URL = 'http://localhost:3000/api/v1';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(fluxaServerFetch('/health/ready')).resolves.toEqual({
      status: 'ok',
    });
  });

  it('maps backend errors to FluxaApiError', async () => {
    process.env.FLUXA_API_BASE_URL = 'http://localhost:3000/api/v1';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'INVALID_ACCESS_TOKEN',
            message: 'Token non valido.',
          }),
          {
            status: 401,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    );

    await expect(fluxaServerFetch('/auth/me')).rejects.toMatchObject<
      Partial<FluxaApiError>
    >({
      status: 401,
      code: 'INVALID_ACCESS_TOKEN',
      message: 'Token non valido.',
    });
  });
});
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\lib\api\fluxa-api.test.ts') `
    -Content $content_apps_web_lib_api_fluxa_api_test_ts `
    -DryRun:$DryRun

$content_apps_web_lib_auth_auth_types_ts = @'
export type MembershipRole =
  | 'OWNER'
  | 'ADMIN'
  | 'MANAGER'
  | 'CASHIER'
  | 'WAITER'
  | 'ACCOUNTANT'
  | 'SUPPORT_READONLY';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface AvailableOrganization {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: MembershipRole;
  defaultLocationId: string | null;
}

export interface ActiveOrganization {
  id: string;
  name: string;
  slug: string;
  role: MembershipRole;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    platformAdmin: boolean;
  };
  device: {
    id: string;
    installationId: string;
    name: string;
    platform: string;
  };
  organization: ActiveOrganization | null;
  availableOrganizations: AvailableOrganization[];
  tokens: TokenPair;
}

export interface RefreshResponse {
  organization: ActiveOrganization | null;
  tokens: TokenPair;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    platformAdmin: boolean;
  };
  session: {
    id: string;
    organizationId: string | null;
    membershipId: string | null;
    role: MembershipRole | null;
  };
  device: unknown;
  availableOrganizations: AvailableOrganization[];
}

export interface AuthenticatedSession extends MeResponse {
  organization: ActiveOrganization | null;
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\lib\auth\auth-types.ts') `
    -Content $content_apps_web_lib_auth_auth_types_ts `
    -DryRun:$DryRun

$content_apps_web_lib_auth_cookies_ts = @'
import type { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies';

export const ACCESS_COOKIE = 'fluxa_access_token';
export const REFRESH_COOKIE = 'fluxa_refresh_token';
export const INSTALLATION_COOKIE = 'fluxa_web_installation';

function secureCookie() {
  return process.env.NODE_ENV === 'production';
}

export function accessCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: secureCookie(),
    path: '/',
    maxAge,
  };
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: secureCookie(),
    path: '/',
  };
}

export function installationCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: secureCookie(),
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  };
}

export function clearAuthCookies(cookies: ResponseCookies) {
  cookies.set(ACCESS_COOKIE, '', {
    ...accessCookieOptions(0),
    expires: new Date(0),
  });
  cookies.set(REFRESH_COOKIE, '', {
    ...refreshCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\lib\auth\cookies.ts') `
    -Content $content_apps_web_lib_auth_cookies_ts `
    -DryRun:$DryRun

$content_apps_web_lib_auth_session_ts = @'
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import type {
  ActiveOrganization,
  AuthenticatedSession,
  MeResponse,
} from '@/lib/auth/auth-types';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

function currentOrganization(session: MeResponse): ActiveOrganization | null {
  const selected = session.availableOrganizations.find(
    (organization) =>
      organization.organizationId === session.session.organizationId,
  );

  return selected
    ? {
        id: selected.organizationId,
        name: selected.organizationName,
        slug: selected.organizationSlug,
        role: selected.role,
      }
    : null;
}

export async function getCurrentSession(): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  if (!accessToken) {
    return null;
  }

  try {
    const session = await fluxaServerFetch<MeResponse>('/auth/me', {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    return {
      ...session,
      organization: currentOrganization(session),
    };
  } catch (error) {
    if (error instanceof FluxaApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function requireMerchantSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect('/login?reason=session');
  }

  if (!session.session.organizationId || !session.session.role) {
    redirect('/login?reason=organization');
  }

  return session;
}

export async function requirePlatformAdminSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect('/login?reason=session');
  }

  if (!session.user.platformAdmin) {
    redirect('/merchant');
  }

  return session;
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\lib\auth\session.ts') `
    -Content $content_apps_web_lib_auth_session_ts `
    -DryRun:$DryRun

$content_apps_web_lib_config_env_ts = @'
import { z } from 'zod';

const serverEnvironmentSchema = z.object({
  FLUXA_API_BASE_URL: z
    .string()
    .url()
    .default('http://localhost:3000/api/v1'),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function getServerEnv(): ServerEnvironment {
  return serverEnvironmentSchema.parse({
    FLUXA_API_BASE_URL: process.env.FLUXA_API_BASE_URL,
  });
}
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\lib\config\env.ts') `
    -Content $content_apps_web_lib_config_env_ts `
    -DryRun:$DryRun

$content_apps_web_lib_config_env_test_ts = @'
import { afterEach, describe, expect, it } from 'vitest';
import { getServerEnv } from './env';

describe('getServerEnv', () => {
  afterEach(() => {
    delete process.env.FLUXA_API_BASE_URL;
  });

  it('uses the local Fluxa API by default', () => {
    expect(getServerEnv().FLUXA_API_BASE_URL).toBe(
      'http://localhost:3000/api/v1',
    );
  });

  it('rejects an invalid backend URL', () => {
    process.env.FLUXA_API_BASE_URL = 'not-a-url';
    expect(() => getServerEnv()).toThrow();
  });
});
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\lib\config\env.test.ts') `
    -Content $content_apps_web_lib_config_env_test_ts `
    -DryRun:$DryRun

$content_apps_web_proxy_ts = @'
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/cookies';

export function proxy(request: NextRequest) {
  const hasSession =
    request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE);

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set(
      'returnTo',
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/merchant/:path*', '/platform-admin/:path*'],
};
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\proxy.ts') `
    -Content $content_apps_web_proxy_ts `
    -DryRun:$DryRun

$content_apps_web_README_md = @'
# Fluxa Web

Frontend Next.js della Fase 2.

## Avvio locale

Copia la configurazione:

```powershell
Copy-Item .env.example .env.local
```

Avvia prima Fluxa API dalla root della monorepo, poi:

```powershell
npm install
npm run dev
```

URL:

- sito pubblico: http://localhost:3001
- login: http://localhost:3001/login
- diagnostica: http://localhost:3001/health
- gestionale: http://localhost:3001/merchant
- platform admin: http://localhost:3001/platform-admin

Per evitare il conflitto con Fluxa API sulla porta 3000:

```powershell
npm run dev -- --port 3001
```

## Variabili

```env
FLUXA_API_BASE_URL=http://localhost:3000/api/v1
```

La variabile non usa il prefisso `NEXT_PUBLIC_`: viene letta soltanto dal runtime
server di Next.js.

## Sessione

Il browser invia le credenziali alla Route Handler di login. I token restituiti da
Fluxa API vengono conservati in cookie `HttpOnly`, non in localStorage.

Le autorizzazioni reali vengono comunque verificate da Fluxa API. `proxy.ts`
esegue solo un controllo preliminare sulla presenza della sessione.
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\README.md') `
    -Content $content_apps_web_README_md `
    -DryRun:$DryRun

$content_docs_phase_2_web_scaffold_md = @'
# Fluxa Phase 2 — Scaffold web

## Applicazione

La Fase 01 aggiunge `apps/web` senza trasformare la repository in Nx, Turborepo
o in un npm workspace.

L'applicazione ha un proprio `package.json` e un proprio `package-lock.json`.

## Stack

- Next.js App Router;
- React;
- TypeScript strict;
- Tailwind CSS;
- ESLint;
- Vitest.

## Route iniziali

- `/`: portale pubblico provvisorio;
- `/health`: diagnostica backend;
- `/login`: accesso;
- `/merchant`: area esercente protetta;
- `/platform-admin`: area platform admin protetta.

## Autenticazione

Il backend Fluxa resta l'autorità per autenticazione e autorizzazione.

La Route Handler `/api/auth/login` inoltra il login a Fluxa API e conserva
access token e refresh token in cookie `HttpOnly`.

`proxy.ts` fa soltanto un controllo preliminare. I layout server delle aree
private richiamano `/auth/me` sul backend e applicano il controllo effettivo.

## Confini

Non vengono introdotti:

- database web separato;
- ORM web;
- utenti duplicati;
- dominio applicativo dentro Next.js;
- segreti pubblicati con `NEXT_PUBLIC_`.

## Verifica

Dalla directory `apps/web`:

```powershell
npm run lint
npm run test
npm run build
```
'@
Write-ScaffoldFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'docs\phase-2\web-scaffold.md') `
    -Content $content_docs_phase_2_web_scaffold_md `
    -DryRun:$DryRun

$markerContent = @'
Fluxa Phase 2 web scaffold
Generated by scripts/phase-2/01-web-scaffold.ps1
'@

Write-ScaffoldFile `
    -Path $markerPath `
    -Content $markerContent `
    -DryRun:$DryRun

$rootGitIgnore = Join-Path -Path $repositoryRoot -ChildPath '.gitignore'
$gitIgnoreBlock = @'
# Fluxa web
apps/web/.next/
apps/web/node_modules/
apps/web/coverage/
apps/web/.env
apps/web/.env.local
apps/web/.env.*.local
!apps/web/.env.example
'@

Add-ContentOnce `
    -Path $rootGitIgnore `
    -Content $gitIgnoreBlock `
    -DryRun:$DryRun

if (-not $DryRun -and -not $SkipInstall) {
    Write-Step -Message 'Installazione dipendenze web'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('install', '--no-audit', '--no-fund') `
        -WorkingDirectory $webRoot | ForEach-Object {
            Write-Host $_
        }
}

if (-not $DryRun -and -not $SkipVerify) {
    if (-not (Test-Path -LiteralPath (Join-Path -Path $webRoot -ChildPath 'node_modules'))) {
        throw @"
node_modules non è presente.

Esegui nuovamente senza -SkipInstall oppure installa le dipendenze in apps/web.
"@
    }

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

Write-Step -Message 'Fase 01 completata'

Write-Host @"
Scaffold creato in apps/web.

Comandi di sviluppo:

cd apps/web
Copy-Item .env.example .env.local
npm run dev -- --port 3001

La Fase 02 dovrà aggiungere esclusivamente schema e migrazioni Events/Reservations.
"@
