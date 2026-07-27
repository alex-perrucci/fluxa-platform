[CmdletBinding()]
param(
    [switch] $DryRun,
    [switch] $SkipStaticVerify
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$commonScript = Join-Path -Path $PSScriptRoot -ChildPath 'Phase2.Common.ps1'

if (-not (Test-Path -LiteralPath $commonScript)) {
    throw "File condiviso non trovato: $commonScript"
}

. $commonScript

function Assert-CleanTrackedTree {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $RepositoryRoot
    )

    $changes = @(
        Invoke-Checked `
            -FilePath 'git' `
            -ArgumentList @('status', '--short', '--untracked-files=no') `
            -WorkingDirectory $RepositoryRoot
    )

    if ($changes.Count -gt 0) {
        $details = $changes -join [Environment]::NewLine

        throw @"
Sono presenti modifiche tracciate non salvate:

$details

Completa il commit della Fase 06 oppure usa git stash.
"@
    }
}

function Write-GeneratedFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Content,

        [switch] $DryRun
    )

    if (Test-Path -LiteralPath $Path) {
        $existing = [System.IO.File]::ReadAllText($Path)

        if (-not $existing.Contains('PHASE_7_RUNTIME_INTEGRATION')) {
            throw @"
Il file esiste ma non appartiene alla Fase 07:

$Path

Lo script si ferma per evitare una sovrascrittura.
"@
        }
    }

    Write-Utf8File -Path $Path -Content $Content -DryRun:$DryRun
}

function Get-DotEnvValue {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Name,

        [switch] $Required
    )

    $escapedName = [Regex]::Escape($Name)
    $line = @(
        Get-Content -LiteralPath $Path |
            Where-Object {
                $_ -match "^\s*$escapedName\s*="
            }
    ) | Select-Object -Last 1

    if ($null -eq $line) {
        if ($Required) {
            throw "Variabile $Name non trovata in $Path."
        }

        return $null
    }

    $value = ($line -split '=', 2)[1].Trim()

    if (
        $value.Length -ge 2 -and
        (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        )
    ) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    if ($Required -and [string]::IsNullOrWhiteSpace($value)) {
        throw "Variabile $Name vuota in $Path."
    }

    return $value
}

function Set-PhaseSevenLocalEnvironment {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $EnvironmentFile
    )

    $postgresUser = Get-DotEnvValue `
        -Path $EnvironmentFile `
        -Name 'POSTGRES_USER' `
        -Required
    $postgresPassword = Get-DotEnvValue `
        -Path $EnvironmentFile `
        -Name 'POSTGRES_PASSWORD' `
        -Required
    $postgresDatabase = Get-DotEnvValue `
        -Path $EnvironmentFile `
        -Name 'POSTGRES_DB' `
        -Required
    $postgresPort = Get-DotEnvValue `
        -Path $EnvironmentFile `
        -Name 'POSTGRES_PORT' `
        -Required
    $redisPort = Get-DotEnvValue `
        -Path $EnvironmentFile `
        -Name 'REDIS_PORT' `
        -Required
    $redisPassword = Get-DotEnvValue `
        -Path $EnvironmentFile `
        -Name 'REDIS_PASSWORD' `
        -Required

    $portNumber = 0
    $redisPortNumber = 0

    if (
        -not [int]::TryParse($postgresPort, [ref] $portNumber) -or
        $portNumber -lt 1 -or
        $portNumber -gt 65535
    ) {
        throw "POSTGRES_PORT non valido: $postgresPort"
    }

    if (
        -not [int]::TryParse($redisPort, [ref] $redisPortNumber) -or
        $redisPortNumber -lt 1 -or
        $redisPortNumber -gt 65535
    ) {
        throw "REDIS_PORT non valido: $redisPort"
    }

    $encodedUser = [Uri]::EscapeDataString($postgresUser)
    $encodedPassword = [Uri]::EscapeDataString($postgresPassword)
    $encodedDatabase = [Uri]::EscapeDataString($postgresDatabase)

    $env:NODE_ENV = 'development'
    $env:DATABASE_URL =
        "postgresql://${encodedUser}:${encodedPassword}@127.0.0.1:${portNumber}/${encodedDatabase}"
    $env:DATABASE_SSL = 'false'
    $env:REDIS_HOST = '127.0.0.1'
    $env:REDIS_PORT = [string] $redisPortNumber
    $env:REDIS_PASSWORD = $redisPassword
    $env:REDIS_TLS = 'false'

    Write-Host "Database runtime locale: 127.0.0.1:$portNumber/$postgresDatabase"
    Write-Host "Redis runtime locale: 127.0.0.1:$redisPortNumber"
}

function Restore-EnvironmentValue {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Name,

        [AllowNull()]
        [string] $Value
    )

    if ($null -eq $Value) {
        Remove-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue
        return
    }

    Set-Item -LiteralPath "Env:$Name" -Value $Value
}

function Get-LogTail {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [int] $Lines = 80
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    Write-Host ""
    Write-Host "--- $Path ---"
    Get-Content -LiteralPath $Path -Tail $Lines |
        ForEach-Object {
            Write-Host $_
        }
}

function Wait-ApiReady {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [System.Diagnostics.Process] $ApiProcess,

        [Parameter(Mandatory)]
        [string] $HealthUrl,

        [Parameter(Mandatory)]
        [string] $StdoutLog,

        [Parameter(Mandatory)]
        [string] $StderrLog,

        [int] $TimeoutSeconds = 60
    )

    $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)

    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        if ($ApiProcess.HasExited) {
            Get-LogTail -Path $StdoutLog
            Get-LogTail -Path $StderrLog
            throw "Fluxa API terminata con exit code $($ApiProcess.ExitCode)."
        }

        try {
            $response = Invoke-WebRequest `
                -Uri $HealthUrl `
                -UseBasicParsing `
                -TimeoutSec 2

            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
                return
            }
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }

    Get-LogTail -Path $StdoutLog
    Get-LogTail -Path $StderrLog
    throw "Timeout attesa API: $HealthUrl"
}

function Stop-PhaseProcess {
    [CmdletBinding()]
    param(
        [System.Diagnostics.Process] $Process
    )

    if ($null -eq $Process) {
        return
    }

    try {
        $Process.Refresh()

        if (-not $Process.HasExited) {
            Stop-Process -Id $Process.Id -Force
            $Process.WaitForExit(5000) | Out-Null
        }
    }
    catch {
        Write-Warning "Impossibile arrestare il processo $($Process.Id): $($_.Exception.Message)"
    }
}

$repositoryRoot = Get-RepositoryRoot
$phaseSixService = Join-Path `
    -Path $repositoryRoot `
    -ChildPath 'apps/api/src/reservations/reservation-stripe.service.ts'
$environmentFile = Join-Path -Path $repositoryRoot -ChildPath '.env'

Write-Step -Message 'Preflight Fase 07'

Assert-RepoRoot -Path $repositoryRoot
Assert-Command -Name 'git'
Assert-Command -Name 'node'
Assert-Command -Name 'docker'

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
Assert-CleanTrackedTree -RepositoryRoot $repositoryRoot

$currentBranch = Get-CurrentGitBranch -RepositoryRoot $repositoryRoot

if ($currentBranch -eq 'main') {
    throw 'La Fase 07 non può essere eseguita direttamente su main.'
}

if (-not (Test-Path -LiteralPath $phaseSixService)) {
    throw "Servizio Stripe Fase 06 non trovato: $phaseSixService"
}

$phaseSixContent = [System.IO.File]::ReadAllText($phaseSixService)

if (-not $phaseSixContent.Contains('PHASE_6_STRIPE_RESERVATION_PAYMENTS')) {
    throw 'Marker Fase 06 non trovato.'
}

if (-not (Test-Path -LiteralPath $environmentFile)) {
    throw 'File .env non trovato. Copia e configura .env.example prima della Fase 07.'
}

Write-Step -Message 'Creazione harness runtime Fase 07'

$content_scripts_phase_2_runtime_phase_2_runtime_fixture_mjs = @'
// PHASE_7_RUNTIME_INTEGRATION
export const PHASE_7 = Object.freeze({
  organizationId: '77000000-0000-4000-8000-000000000001',
  userId: '77000000-0000-4000-8000-000000000002',
  merchantId: '77000000-0000-4000-8000-000000000003',
  locationId: '77000000-0000-4000-8000-000000000004',
  areaId: '77000000-0000-4000-8000-000000000005',
  feeRuleId: '77000000-0000-4000-8000-000000000006',
  webhookSecret: 'whsec_phase7_local_signature_secret',
  apiPort: 3107,
  events: {
    concurrency: {
      id: '77000000-0000-4000-8000-000000000101',
      slug: 'phase-7-concurrency',
      tableId: '77000000-0000-4000-8000-000000000201',
      tableCode: 'P7-CONCURRENCY',
      tableName: 'Phase 7 Concurrency',
    },
    paid: {
      id: '77000000-0000-4000-8000-000000000102',
      slug: 'phase-7-paid',
      tableId: '77000000-0000-4000-8000-000000000202',
      tableCode: 'P7-PAID',
      tableName: 'Phase 7 Paid',
    },
    free: {
      id: '77000000-0000-4000-8000-000000000103',
      slug: 'phase-7-free',
      tableId: '77000000-0000-4000-8000-000000000203',
      tableCode: 'P7-FREE',
      tableName: 'Phase 7 Free',
    },
    holdExpiry: {
      id: '77000000-0000-4000-8000-000000000104',
      slug: 'phase-7-hold-expiry',
      tableId: '77000000-0000-4000-8000-000000000204',
      tableCode: 'P7-HOLD-EXPIRY',
      tableName: 'Phase 7 Hold Expiry',
    },
    paymentExpiry: {
      id: '77000000-0000-4000-8000-000000000105',
      slug: 'phase-7-payment-expiry',
      tableId: '77000000-0000-4000-8000-000000000205',
      tableCode: 'P7-PAYMENT-EXPIRY',
      tableName: 'Phase 7 Payment Expiry',
    },
    latePayment: {
      id: '77000000-0000-4000-8000-000000000106',
      slug: 'phase-7-late-payment',
      tableId: '77000000-0000-4000-8000-000000000206',
      tableCode: 'P7-LATE-PAYMENT',
      tableName: 'Phase 7 Late Payment',
    },
  },
});
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'scripts\phase-2\runtime\phase-2-runtime-fixture.mjs') `
    -Content $content_scripts_phase_2_runtime_phase_2_runtime_fixture_mjs `
    -DryRun:$DryRun

$content_scripts_phase_2_runtime_local_database_guard_mjs = @'
// PHASE_7_RUNTIME_INTEGRATION
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

export function loadLocalEnvironment() {
  if (!existsSync('.env')) {
    return;
  }

  const inheritedEnvironment = { ...process.env };
  process.loadEnvFile('.env');
  Object.assign(process.env, inheritedEnvironment);
}

export function localDatabaseConfig() {
  loadLocalEnvironment();

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'PHASE_7_REFUSED: NODE_ENV=production non è consentito.',
    );
  }

  const rawUrl = process.env.DATABASE_URL?.trim();

  if (!rawUrl) {
    throw new Error('PHASE_7_REFUSED: DATABASE_URL non configurato.');
  }

  const databaseUrl = new URL(rawUrl);
  const hostname = databaseUrl.hostname.toLowerCase();
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1']);

  if (!allowedHosts.has(hostname)) {
    throw new Error(
      `PHASE_7_REFUSED: database non locale (${hostname}).`,
    );
  }

  const databaseName = databaseUrl.pathname.replace(/^\/+/, '');

  if (
    !databaseName ||
    ['postgres', 'template0', 'template1'].includes(databaseName)
  ) {
    throw new Error(
      `PHASE_7_REFUSED: database non valido (${databaseName || 'vuoto'}).`,
    );
  }

  return {
    connectionString: databaseUrl.toString(),
    ssl:
      process.env.DATABASE_SSL?.trim().toLowerCase() === 'true'
        ? { rejectUnauthorized: false }
        : false,
    databaseName,
    hostname,
  };
}

export function createLocalPool() {
  const config = localDatabaseConfig();

  return new Pool({
    connectionString: config.connectionString,
    ssl: config.ssl,
    max: 10,
  });
}

export async function waitForLocalDatabase(waitSeconds = 0) {
  const deadline = Date.now() + waitSeconds * 1_000;
  let lastError;

  do {
    const pool = createLocalPool();

    try {
      const result = await pool.query(`
        SELECT
          current_database() AS "databaseName",
          inet_server_addr()::text AS "serverAddress",
          current_user AS "databaseUser"
      `);
      const row = result.rows[0];

      return {
        databaseName: row?.databaseName,
        serverAddress: row?.serverAddress,
        databaseUser: row?.databaseUser,
      };
    } catch (error) {
      lastError = error;
    } finally {
      await pool.end().catch(() => undefined);
    }

    if (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  } while (Date.now() < deadline);

  throw lastError ?? new Error('Database locale non raggiungibile.');
}

async function main() {
  const waitArgumentIndex = process.argv.indexOf('--wait-seconds');
  const waitSeconds =
    waitArgumentIndex >= 0
      ? Number(process.argv[waitArgumentIndex + 1] ?? '0')
      : 0;

  if (!Number.isInteger(waitSeconds) || waitSeconds < 0) {
    throw new Error('--wait-seconds deve essere un intero non negativo.');
  }

  const connection = await waitForLocalDatabase(waitSeconds);

  console.log('Guard database locale: superato');
  console.log(`Database: ${connection.databaseName}`);
  console.log(`Server: ${connection.serverAddress ?? 'local socket'}`);
  console.log(`Utente: ${connection.databaseUser}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  });
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'scripts\phase-2\runtime\local-database-guard.mjs') `
    -Content $content_scripts_phase_2_runtime_local_database_guard_mjs `
    -DryRun:$DryRun

$content_scripts_phase_2_runtime_seed_phase_2_runtime_mjs = @'
// PHASE_7_RUNTIME_INTEGRATION
import { createLocalPool } from './local-database-guard.mjs';
import { PHASE_7 } from './phase-2-runtime-fixture.mjs';

const pool = createLocalPool();

const eventEntries = Object.values(PHASE_7.events);

function eventAmount(event) {
  return event.slug === PHASE_7.events.free.slug ? 0 : 1_000;
}

async function cleanup(client) {
  const organizationId = PHASE_7.organizationId;

  await client.query(
    `DELETE FROM platform_fee_ledger WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM reservation_status_history WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM reservation_payments WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM reservation_table_assignments WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM reservations WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM reservation_holds WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM platform_fee_rules WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM event_booking_rules WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM event_table_inventory WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM event_media WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM events WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM dining_tables WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM dining_areas WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM audit_events WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM outbox_events WHERE payload ->> 'organizationId' = $1`,
    [organizationId],
  );
}

async function seedBase(client) {
  await client.query(
    `
      INSERT INTO users (
        id,
        email,
        password_hash,
        display_name,
        platform_admin,
        status,
        email_verified_at
      )
      VALUES ($1,$2,$3,$4,FALSE,'ACTIVE',NOW())
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        status = 'ACTIVE',
        updated_at = NOW()
    `,
    [
      PHASE_7.userId,
      'phase7-runtime@fluxa.local',
      'phase-7-not-valid-for-login',
      'Phase 7 Runtime',
    ],
  );

  await client.query(
    `
      INSERT INTO organizations (
        id,
        slug,
        name,
        status,
        created_by_user_id
      )
      VALUES ($1,$2,$3,'ACTIVE',$4)
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        name = EXCLUDED.name,
        status = 'ACTIVE',
        updated_at = NOW()
    `,
    [
      PHASE_7.organizationId,
      'phase-7-runtime',
      'Phase 7 Runtime Organization',
      PHASE_7.userId,
    ],
  );

  await client.query(
    `
      INSERT INTO merchants (
        id,
        organization_id,
        legal_name,
        trade_name,
        vat_number,
        country_code,
        status
      )
      VALUES ($1,$2,$3,$4,$5,'IT','ACTIVE')
      ON CONFLICT (id) DO UPDATE SET
        legal_name = EXCLUDED.legal_name,
        trade_name = EXCLUDED.trade_name,
        status = 'ACTIVE',
        updated_at = NOW()
    `,
    [
      PHASE_7.merchantId,
      PHASE_7.organizationId,
      'Fluxa Phase 7 S.r.l.',
      'Fluxa Phase 7',
      'IT00000000007',
    ],
  );

  await client.query(
    `
      INSERT INTO locations (
        id,
        organization_id,
        merchant_id,
        code,
        name,
        address_line_1,
        postal_code,
        city,
        province,
        country_code,
        timezone,
        status
      )
      VALUES (
        $1,$2,$3,'PHASE7','Phase 7 Runtime',
        'Via Runtime 7','43121','Parma','PR','IT',
        'Europe/Rome','ACTIVE'
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = 'ACTIVE',
        updated_at = NOW()
    `,
    [
      PHASE_7.locationId,
      PHASE_7.organizationId,
      PHASE_7.merchantId,
    ],
  );

  await client.query(
    `
      INSERT INTO organization_memberships (
        id,
        organization_id,
        user_id,
        role,
        status,
        default_location_id
      )
      VALUES (
        '77000000-0000-4000-8000-000000000007',
        $1,$2,'OWNER','ACTIVE',$3
      )
      ON CONFLICT (organization_id, user_id) DO UPDATE SET
        role = 'OWNER',
        status = 'ACTIVE',
        default_location_id = EXCLUDED.default_location_id,
        updated_at = NOW()
    `,
    [
      PHASE_7.organizationId,
      PHASE_7.userId,
      PHASE_7.locationId,
    ],
  );

  await client.query(
    `
      INSERT INTO dining_areas (
        id,
        organization_id,
        location_id,
        code,
        name,
        sort_order,
        status
      )
      VALUES ($1,$2,$3,'PHASE7','Phase 7 Runtime',0,'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = 'ACTIVE',
        updated_at = NOW()
    `,
    [PHASE_7.areaId, PHASE_7.organizationId, PHASE_7.locationId],
  );
}

async function seedEvents(client) {
  const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1_000);
  const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1_000);
  const bookingOpensAt = new Date(Date.now() - 60 * 60 * 1_000);
  const bookingClosesAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);

  for (const [index, event] of eventEntries.entries()) {
    await client.query(
      `
        INSERT INTO dining_tables (
          id,
          organization_id,
          location_id,
          area_id,
          code,
          name,
          capacity,
          sort_order,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6,4,$7,'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          capacity = 4,
          status = 'ACTIVE',
          updated_at = NOW()
      `,
      [
        event.tableId,
        PHASE_7.organizationId,
        PHASE_7.locationId,
        PHASE_7.areaId,
        event.tableCode,
        event.tableName,
        index,
      ],
    );

    await client.query(
      `
        INSERT INTO events (
          id,
          organization_id,
          location_id,
          created_by_user_id,
          title,
          slug,
          description,
          timezone,
          status,
          starts_at,
          ends_at,
          booking_opens_at,
          booking_closes_at,
          booking_amount_cents,
          currency,
          capacity,
          cancellation_policy,
          version,
          published_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,'Europe/Rome','PUBLISHED',
          $8,$9,$10,$11,$12,'EUR',4,
          'Fixture locale Fase 07',1,NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          slug = EXCLUDED.slug,
          description = EXCLUDED.description,
          status = 'PUBLISHED',
          starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at,
          booking_opens_at = EXCLUDED.booking_opens_at,
          booking_closes_at = EXCLUDED.booking_closes_at,
          booking_amount_cents = EXCLUDED.booking_amount_cents,
          capacity = 4,
          published_at = NOW(),
          cancelled_at = NULL,
          completed_at = NULL,
          archived_at = NULL,
          version = events.version + 1,
          updated_at = NOW()
      `,
      [
        event.id,
        PHASE_7.organizationId,
        PHASE_7.locationId,
        PHASE_7.userId,
        `Phase 7 ${event.tableName}`,
        event.slug,
        `Evento runtime per ${event.slug}`,
        startsAt,
        endsAt,
        bookingOpensAt,
        bookingClosesAt,
        eventAmount(event),
      ],
    );

    await client.query(
      `
        INSERT INTO event_table_inventory (
          id,
          organization_id,
          location_id,
          event_id,
          dining_table_id,
          capacity_snapshot,
          enabled
        )
        VALUES (
          gen_random_uuid(),$1,$2,$3,$4,4,TRUE
        )
      `,
      [
        PHASE_7.organizationId,
        PHASE_7.locationId,
        event.id,
        event.tableId,
      ],
    );

    await client.query(
      `
        INSERT INTO event_booking_rules (
          id,
          organization_id,
          location_id,
          event_id,
          min_party_size,
          max_party_size,
          hold_minutes,
          booking_cutoff_minutes,
          cancellation_cutoff_minutes,
          auto_assign_smallest_table,
          allow_manual_assignment,
          require_phone
        )
        VALUES (
          gen_random_uuid(),$1,$2,$3,1,4,2,0,0,TRUE,TRUE,TRUE
        )
      `,
      [PHASE_7.organizationId, PHASE_7.locationId, event.id],
    );
  }

  await client.query(
    `
      INSERT INTO platform_fee_rules (
        id,
        scope,
        organization_id,
        event_id,
        basis_points,
        active,
        effective_from,
        created_by_user_id
      )
      VALUES ($1,'ORGANIZATION',$2,NULL,750,TRUE,NOW() - INTERVAL '1 day',$3)
      ON CONFLICT (id) DO UPDATE SET
        basis_points = 750,
        active = TRUE,
        effective_from = NOW() - INTERVAL '1 day',
        effective_to = NULL,
        updated_at = NOW()
    `,
    [PHASE_7.feeRuleId, PHASE_7.organizationId, PHASE_7.userId],
  );
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await cleanup(client);
    await seedBase(client);
    await seedEvents(client);
    await client.query('COMMIT');

    console.log('Seed runtime Fase 07 completato');
    console.log(`Organizzazione: ${PHASE_7.organizationId}`);
    console.log(`Eventi: ${eventEntries.length}`);
    console.log('Tavoli per evento: 1');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'scripts\phase-2\runtime\seed-phase-2-runtime.mjs') `
    -Content $content_scripts_phase_2_runtime_seed_phase_2_runtime_mjs `
    -DryRun:$DryRun

$content_scripts_phase_2_runtime_smoke_phase_2_runtime_mjs = @'
// PHASE_7_RUNTIME_INTEGRATION
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { createLocalPool } from './local-database-guard.mjs';
import { PHASE_7 } from './phase-2-runtime-fixture.mjs';

const pool = createLocalPool();
const apiBaseUrl =
  process.env.PHASE2_API_BASE_URL ??
  `http://127.0.0.1:${PHASE_7.apiPort}/api/v1`;
const stripe = new Stripe('sk_test_phase7_local_signature_only');

function logStep(message) {
  console.log(`\n[phase-7] ${message}`);
}

async function requestJson(path, options = {}) {
  const headers = new Headers(options.headers ?? {});

  if (options.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    body:
      options.body === undefined
        ? undefined
        : typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return {
    status: response.status,
    body,
  };
}

function assertSuccess(result, context) {
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${context}: HTTP ${result.status} ${JSON.stringify(result.body)}`,
  );
}

function createHold(slug, partySize = 4) {
  const holdToken = randomUUID();
  const idempotencyKey = `phase7-hold-${randomUUID()}`;
  const body = { partySize, holdToken, idempotencyKey };

  return {
    holdToken,
    idempotencyKey,
    body,
    request: () =>
      requestJson(`/public/events/${slug}/holds`, {
        method: 'POST',
        body,
      }),
  };
}

async function convertHold(holdToken) {
  const reservationToken = randomUUID();
  const body = {
    reservationToken,
    customerName: 'Mario Runtime',
    customerEmail: 'mario.runtime@example.com',
    customerPhone: '+39 333 1234567',
    customerNote: 'Smoke test Fase 07',
  };
  const result = await requestJson(
    `/public/reservation-holds/${holdToken}/reservations`,
    {
      method: 'POST',
      body,
    },
  );

  assertSuccess(result, 'conversione hold');

  return {
    reservationToken,
    body,
    result,
  };
}

async function insertSyntheticPayment(reservationId, sessionId) {
  const result = await pool.query(
    `
      INSERT INTO reservation_payments (
        id,
        organization_id,
        location_id,
        reservation_id,
        status,
        provider,
        provider_session_id,
        idempotency_key,
        request_hash,
        amount_cents,
        platform_fee_cents,
        merchant_gross_cents,
        provider_fee_cents,
        merchant_net_cents,
        refunded_cents,
        currency
      )
      SELECT
        $2,
        organization_id,
        location_id,
        id,
        'REQUIRES_ACTION',
        'STRIPE',
        $3,
        $4,
        $5,
        amount_cents,
        platform_fee_cents,
        merchant_gross_cents,
        0,
        merchant_gross_cents,
        0,
        currency
      FROM reservations
      WHERE id = $1
      RETURNING id
    `,
    [
      reservationId,
      randomUUID(),
      sessionId,
      `phase7-payment-${randomUUID()}`,
      '7'.repeat(64),
    ],
  );

  assert.equal(result.rowCount, 1);
  return result.rows[0].id;
}

async function sendSignedPaidWebhook({
  paymentId,
  sessionId,
  eventId,
}) {
  const payload = JSON.stringify({
    id: eventId,
    object: 'event',
    api_version: '2026-06-24.dahlia',
    created: Math.floor(Date.now() / 1_000),
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        metadata: {
          reservationPaymentId: paymentId,
        },
        payment_intent: null,
        payment_status: 'paid',
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null,
    },
    type: 'checkout.session.completed',
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: PHASE_7.webhookSecret,
  });
  const result = await requestJson(
    '/public/reservation-payments/stripe/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
      },
      body: payload,
    },
  );

  assertSuccess(result, 'webhook Stripe firmato');
  assert.deepEqual(result.body, { received: true });
}

async function pollDatabase(check, options = {}) {
  const timeoutMs = options.timeoutMs ?? 95_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  let lastValue;

  while (Date.now() < deadline) {
    lastValue = await check();

    if (lastValue?.done) {
      return lastValue.value;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timeout attesa worker. Ultimo valore: ${JSON.stringify(lastValue)}`,
  );
}

async function verifyMigrations() {
  logStep('verifica migrazioni applicate');

  const result = await pool.query(`
    SELECT
      to_regclass('public.events') IS NOT NULL AS "eventsPresent",
      to_regclass('public.reservations') IS NOT NULL AS "reservationsPresent",
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'reservations'
          AND column_name = 'payment_expires_at'
      ) AS "paymentExpiryPresent"
  `);
  const row = result.rows[0];

  assert.equal(row.eventsPresent, true);
  assert.equal(row.reservationsPresent, true);
  assert.equal(row.paymentExpiryPresent, true);
}

async function verifyAvailabilityAndConcurrency() {
  logStep('availability e concorrenza su tavolo singolo');

  const event = PHASE_7.events.concurrency;
  const availability = await requestJson(
    `/public/events/${event.slug}/availability?partySize=4`,
  );

  assertSuccess(availability, 'availability iniziale');
  assert.equal(availability.body.available, true);
  assert.equal(availability.body.availableTableCount, 1);

  const first = createHold(event.slug);
  const second = createHold(event.slug);
  const [firstResult, secondResult] = await Promise.all([
    first.request(),
    second.request(),
  ]);
  const results = [
    { fixture: first, result: firstResult },
    { fixture: second, result: secondResult },
  ];
  const successes = results.filter(
    ({ result }) => result.status >= 200 && result.status < 300,
  );
  const conflicts = results.filter(({ result }) => result.status === 409);

  assert.equal(successes.length, 1, JSON.stringify(results));
  assert.equal(conflicts.length, 1, JSON.stringify(results));

  const winner = successes[0];
  const retry = await winner.fixture.request();

  assertSuccess(retry, 'retry hold idempotente');
  assert.equal(retry.body.id, winner.result.body.id);

  const cancellation = await requestJson(
    `/public/reservation-holds/${winner.fixture.holdToken}`,
    { method: 'DELETE' },
  );

  assertSuccess(cancellation, 'cancellazione hold');
  assert.equal(cancellation.body.status, 'CANCELLED');
}

async function verifyConversionAndSignedWebhook() {
  logStep('conversione paid e webhook Stripe firmato');

  const hold = createHold(PHASE_7.events.paid.slug);
  const holdResult = await hold.request();

  assertSuccess(holdResult, 'creazione hold paid');
  assert.equal(holdResult.body.platformFeeCents, 75);

  const conversion = await convertHold(hold.holdToken);
  const reservation = conversion.result.body;

  assert.equal(reservation.status, 'PENDING_PAYMENT');
  assert.equal(reservation.payment.required, true);
  assert.equal(
    reservation.payment.nextAction,
    'CREATE_CHECKOUT_SESSION',
  );

  const retry = await requestJson(
    `/public/reservation-holds/${hold.holdToken}/reservations`,
    {
      method: 'POST',
      body: conversion.body,
    },
  );

  assertSuccess(retry, 'retry conversione');
  assert.equal(retry.body.id, reservation.id);

  const sessionId = `cs_test_phase7_${randomUUID().replaceAll('-', '')}`;
  const paymentId = await insertSyntheticPayment(
    reservation.id,
    sessionId,
  );

  await sendSignedPaidWebhook({
    paymentId,
    sessionId,
    eventId: `evt_phase7_${randomUUID().replaceAll('-', '')}`,
  });

  const view = await requestJson(
    `/public/reservations/${conversion.reservationToken}`,
  );

  assertSuccess(view, 'lettura reservation confermata');
  assert.equal(view.body.status, 'CONFIRMED');

  const databaseState = await pool.query(
    `
      SELECT
        r.status AS "reservationStatus",
        rp.status AS "paymentStatus",
        rta.status AS "assignmentStatus",
        COUNT(pfl.id)::int AS "ledgerEntries"
      FROM reservations r
      JOIN reservation_payments rp
        ON rp.reservation_id = r.id
      JOIN reservation_table_assignments rta
        ON rta.reservation_id = r.id
      LEFT JOIN platform_fee_ledger pfl
        ON pfl.reservation_id = r.id
      WHERE r.id = $1
      GROUP BY r.status, rp.status, rta.status
    `,
    [reservation.id],
  );
  const state = databaseState.rows[0];

  assert.equal(state.reservationStatus, 'CONFIRMED');
  assert.equal(state.paymentStatus, 'PAID');
  assert.equal(state.assignmentStatus, 'ACTIVE');
  assert.equal(state.ledgerEntries, 1);
}

async function verifyFreeReservation() {
  logStep('prenotazione gratuita confermata senza checkout');

  const hold = createHold(PHASE_7.events.free.slug);
  const holdResult = await hold.request();

  assertSuccess(holdResult, 'creazione hold gratuito');

  const conversion = await convertHold(hold.holdToken);

  assert.equal(conversion.result.body.status, 'CONFIRMED');
  assert.equal(conversion.result.body.payment.required, false);
  assert.equal(conversion.result.body.payment.nextAction, 'NONE');
}

async function verifyHoldExpiryWorker() {
  logStep('scadenza hold tramite background worker');

  const hold = createHold(PHASE_7.events.holdExpiry.slug);
  const holdResult = await hold.request();

  assertSuccess(holdResult, 'creazione hold da far scadere');

  await pool.query(
    `
      UPDATE reservation_holds
      SET
        created_at = NOW() - INTERVAL '10 minutes',
        expires_at = NOW() - INTERVAL '1 second',
        updated_at = NOW()
      WHERE id = $1
    `,
    [holdResult.body.id],
  );

  const state = await pollDatabase(async () => {
    const result = await pool.query(
      `
        SELECT
          h.status AS "holdStatus",
          rta.status AS "assignmentStatus"
        FROM reservation_holds h
        JOIN reservation_table_assignments rta
          ON rta.hold_id = h.id
        WHERE h.id = $1
      `,
      [holdResult.body.id],
    );
    const row = result.rows[0];

    return {
      done:
        row?.holdStatus === 'EXPIRED' &&
        row?.assignmentStatus === 'RELEASED',
      value: row,
    };
  });

  assert.equal(state.holdStatus, 'EXPIRED');
  assert.equal(state.assignmentStatus, 'RELEASED');
}

async function verifyPaymentExpiryWorker() {
  logStep('scadenza PENDING_PAYMENT tramite background worker');

  const hold = createHold(PHASE_7.events.paymentExpiry.slug);
  const holdResult = await hold.request();

  assertSuccess(holdResult, 'creazione hold payment expiry');

  const conversion = await convertHold(hold.holdToken);
  const reservationId = conversion.result.body.id;

  await pool.query(
    `
      UPDATE reservations
      SET
        payment_expires_at = NOW() - INTERVAL '1 second',
        updated_at = NOW()
      WHERE id = $1
    `,
    [reservationId],
  );

  const state = await pollDatabase(async () => {
    const result = await pool.query(
      `
        SELECT
          r.status AS "reservationStatus",
          rta.status AS "assignmentStatus",
          rta.release_reason AS "releaseReason"
        FROM reservations r
        JOIN reservation_table_assignments rta
          ON rta.reservation_id = r.id
        WHERE r.id = $1
      `,
      [reservationId],
    );
    const row = result.rows[0];

    return {
      done:
        row?.reservationStatus === 'EXPIRED' &&
        row?.assignmentStatus === 'RELEASED',
      value: row,
    };
  });

  assert.equal(state.reservationStatus, 'EXPIRED');
  assert.equal(state.assignmentStatus, 'RELEASED');
  assert.equal(state.releaseReason, 'PAYMENT_TIMEOUT');
}

async function verifyLatePaymentProtection() {
  logStep('pagamento tardivo protetto con REFUND_PENDING');

  const hold = createHold(PHASE_7.events.latePayment.slug);
  const holdResult = await hold.request();

  assertSuccess(holdResult, 'creazione hold late payment');

  const conversion = await convertHold(hold.holdToken);
  const reservationId = conversion.result.body.id;

  await pool.query('BEGIN');

  try {
    await pool.query(
      `
        UPDATE reservation_table_assignments
        SET
          status = 'RELEASED',
          active_event_table_key = NULL,
          released_at = NOW(),
          release_reason = 'PHASE_7_LATE_PAYMENT',
          version = version + 1,
          updated_at = NOW()
        WHERE reservation_id = $1
      `,
      [reservationId],
    );
    await pool.query(
      `
        UPDATE reservations
        SET
          status = 'EXPIRED',
          payment_expires_at = NULL,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1
      `,
      [reservationId],
    );
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }

  const sessionId = `cs_test_phase7_late_${randomUUID().replaceAll('-', '')}`;
  const paymentId = await insertSyntheticPayment(
    reservationId,
    sessionId,
  );

  await sendSignedPaidWebhook({
    paymentId,
    sessionId,
    eventId: `evt_phase7_late_${randomUUID().replaceAll('-', '')}`,
  });

  const state = await pool.query(
    `
      SELECT
        r.status AS "reservationStatus",
        rp.status AS "paymentStatus",
        rta.status AS "assignmentStatus",
        COUNT(pfl.id)::int AS "ledgerEntries"
      FROM reservations r
      JOIN reservation_payments rp
        ON rp.reservation_id = r.id
      JOIN reservation_table_assignments rta
        ON rta.reservation_id = r.id
      LEFT JOIN platform_fee_ledger pfl
        ON pfl.reservation_id = r.id
      WHERE r.id = $1
      GROUP BY r.status, rp.status, rta.status
    `,
    [reservationId],
  );
  const row = state.rows[0];

  assert.equal(row.reservationStatus, 'REFUND_PENDING');
  assert.equal(row.paymentStatus, 'PAID');
  assert.equal(row.assignmentStatus, 'RELEASED');
  assert.equal(row.ledgerEntries, 1);
}

async function verifyAuditAndOutbox() {
  logStep('audit e outbox runtime');

  const result = await pool.query(
    `
      SELECT
        (
          SELECT COUNT(*)::int
          FROM audit_events
          WHERE organization_id = $1::uuid
        ) AS "auditCount",
        (
          SELECT COUNT(*)::int
          FROM outbox_events
          WHERE payload ->> 'organizationId' = $2
        ) AS "outboxCount"
    `,
    [PHASE_7.organizationId, PHASE_7.organizationId],
  );
  const row = result.rows[0];

  assert.ok(row.auditCount >= 10, JSON.stringify(row));
  assert.ok(row.outboxCount >= 10, JSON.stringify(row));
}

async function main() {
  try {
    await verifyMigrations();
    await verifyAvailabilityAndConcurrency();
    await verifyConversionAndSignedWebhook();
    await verifyFreeReservation();
    await verifyHoldExpiryWorker();
    await verifyPaymentExpiryWorker();
    await verifyLatePaymentProtection();
    await verifyAuditAndOutbox();

    console.log('\nFase 07 runtime smoke: PASS');
    console.log('Concorrenza tavolo: PASS');
    console.log('Conversione e idempotenza: PASS');
    console.log('Webhook Stripe firmato: PASS');
    console.log('Worker hold/payment expiry: PASS');
    console.log('Late payment REFUND_PENDING: PASS');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'scripts\phase-2\runtime\smoke-phase-2-runtime.mjs') `
    -Content $content_scripts_phase_2_runtime_smoke_phase_2_runtime_mjs `
    -DryRun:$DryRun

$content_scripts_verify_phase_7_runtime_mjs = @'
// PHASE_7_RUNTIME_INTEGRATION
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredFiles = [
  'scripts/phase-2/runtime/phase-2-runtime-fixture.mjs',
  'scripts/phase-2/runtime/local-database-guard.mjs',
  'scripts/phase-2/runtime/seed-phase-2-runtime.mjs',
  'scripts/phase-2/runtime/smoke-phase-2-runtime.mjs',
  'docs/phase-2/runtime-integration.md',
];

for (const relativePath of requiredFiles) {
  await stat(path.join(root, relativePath));
}

const migrationNames = (await readdir(path.join(root, 'drizzle'))).filter(
  (name) => name.endsWith('.sql'),
);
const phaseTwoMigration = migrationNames.find((name) =>
  name.startsWith('0009_'),
);
const paymentExpiryMigration = migrationNames.find((name) =>
  name.startsWith('0010_'),
);

if (!phaseTwoMigration || !paymentExpiryMigration) {
  console.error('Migrazioni 0009 e 0010 non trovate.');
  process.exit(1);
}

const [
  phaseTwoSql,
  paymentExpirySql,
  conversionService,
  stripeService,
  guard,
  seed,
  smoke,
] = await Promise.all([
  readFile(path.join(root, 'drizzle', phaseTwoMigration), 'utf8'),
  readFile(path.join(root, 'drizzle', paymentExpiryMigration), 'utf8'),
  readFile(
    path.join(
      root,
      'apps/api/src/reservations/reservation-conversion.service.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(
      root,
      'apps/api/src/reservations/reservation-stripe.service.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(
      root,
      'scripts/phase-2/runtime/local-database-guard.mjs',
    ),
    'utf8',
  ),
  readFile(
    path.join(
      root,
      'scripts/phase-2/runtime/seed-phase-2-runtime.mjs',
    ),
    'utf8',
  ),
  readFile(
    path.join(
      root,
      'scripts/phase-2/runtime/smoke-phase-2-runtime.mjs',
    ),
    'utf8',
  ),
]);

const checks = [
  ['Migration events', phaseTwoSql, 'CREATE TABLE "events"'],
  ['Migration reservations', phaseTwoSql, 'CREATE TABLE "reservations"'],
  ['Migration payment expiry', paymentExpirySql, 'payment_expires_at'],
  [
    'Phase 05 conversion marker',
    conversionService,
    'PHASE_5_RESERVATION_CONVERSION',
  ],
  [
    'Phase 06 Stripe marker',
    stripeService,
    'PHASE_6_STRIPE_RESERVATION_PAYMENTS',
  ],
  ['Localhost guard', guard, "new Set(['localhost', '127.0.0.1', '::1'])"],
  ['Production refusal', guard, "process.env.NODE_ENV === 'production'"],
  ['Idempotent fixture cleanup', seed, 'DELETE FROM reservation_payments'],
  ['Published event seed', seed, "'PUBLISHED'"],
  ['Concurrency smoke', smoke, 'Promise.all'],
  ['Signed webhook smoke', smoke, 'generateTestHeaderString'],
  ['Hold expiry smoke', smoke, 'verifyHoldExpiryWorker'],
  ['Payment expiry smoke', smoke, 'verifyPaymentExpiryWorker'],
  ['Late payment smoke', smoke, "'REFUND_PENDING'"],
];

const missing = checks
  .filter(([, content, fragment]) => !content.includes(fragment))
  .map(([name]) => name);

if (missing.length > 0) {
  console.error('Verifica Fase 07 fallita.');
  console.error(`Elementi mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`File runtime verificati: ${requiredFiles.length}`);
console.log(`Migrazione eventi: ${phaseTwoMigration}`);
console.log(`Migrazione payment expiry: ${paymentExpiryMigration}`);
console.log('Guard database locale: presente');
console.log('Seed, concorrenza, webhook e worker smoke: presenti');
console.log('Nessuna nuova migrazione richiesta');
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'scripts\verify-phase-7-runtime.mjs') `
    -Content $content_scripts_verify_phase_7_runtime_mjs `
    -DryRun:$DryRun

$content_docs_phase_2_runtime_integration_md = @'
# Fluxa Phase 2 — Runtime integration

## Obiettivo

La Fase 07 è la prima fase che applica le migrazioni degli eventi e delle
prenotazioni a un database PostgreSQL locale e verifica il flusso reale
API/database/background worker.

## Protezione del database

Prima di eseguire `db:migrate` il guard rifiuta:

- `NODE_ENV=production`;
- host PostgreSQL diversi da `localhost`, `127.0.0.1` e `::1`;
- database `postgres`, `template0` e `template1`;
- configurazioni senza `DATABASE_URL`.

La fase non esegue `infra:reset` e non cancella dati applicativi generici.

Il seed pulisce e ricrea soltanto la fixture con organizzazione:

```text
77000000-0000-4000-8000-000000000001
```

## Migrazioni

Vengono applicate tramite Drizzle tutte le migrazioni locali non ancora
applicate, incluse:

```text
0009_* — eventi e prenotazioni
0010_* — reservations.payment_expires_at
```

Non viene generata una nuova migrazione.

## Fixture

Il seed crea:

- organizzazione, merchant e location dedicati;
- una sala;
- sei tavoli;
- sei eventi pubblicati, ciascuno con un solo tavolo;
- regole di prenotazione;
- commissione organizzazione del 7,5%.

Ogni scenario usa un evento separato per evitare interferenze.

## Smoke test

Il test runtime verifica:

1. disponibilità pubblica;
2. due hold concorrenti sullo stesso tavolo: uno solo deve riuscire;
3. retry idempotente dell’hold;
4. cancellazione e rilascio tavolo;
5. conversione atomica hold → reservation;
6. retry idempotente della conversione;
7. prenotazione gratuita confermata senza pagamento;
8. webhook Stripe firmato sul raw body;
9. pagamento riuscito → `CONFIRMED`;
10. ledger, audit e outbox;
11. scadenza hold tramite background worker;
12. scadenza `PENDING_PAYMENT` e rilascio tavolo;
13. pagamento tardivo → `REFUND_PENDING`.

## Webhook Stripe locale

Il test genera una firma con l’SDK Stripe e invia un evento
`checkout.session.completed` all’endpoint HTTP reale.

Non viene contattata l’API Stripe e non viene creato un addebito. Questo smoke
verifica:

- raw body;
- firma webhook;
- metadata del pagamento;
- transazione database;
- conferma reservation;
- late-payment protection.

La creazione di una Checkout Session reale in Stripe Test Mode resta un test
esterno, perché richiede credenziali e rete.

## Processi

Lo script:

1. avvia PostgreSQL e Redis tramite Docker Compose;
2. applica le migrazioni;
3. esegue il seed;
4. compila il monorepo;
5. avvia API e background worker compilati;
6. esegue lo smoke;
7. arresta i due processi Node avviati dalla fase.

Il fiscal worker non viene avviato.
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'docs\phase-2\runtime-integration.md') `
    -Content $content_docs_phase_2_runtime_integration_md `
    -DryRun:$DryRun

if ($DryRun) {
    Write-Step -Message 'DryRun Fase 07 completato'

    Write-Host @"
Verrebbero aggiunti:

- guard che accetta soltanto PostgreSQL locale;
- seed isolato e idempotente;
- verifica migrazioni 0009 e 0010;
- smoke API/database/background worker;
- concorrenza sullo stesso tavolo;
- webhook Stripe locale firmato;
- conferma, scadenze e late-payment protection.

Durante l'esecuzione reale:

- Docker Compose avvia PostgreSQL e Redis;
- db:migrate applica le migrazioni locali;
- non viene eseguito infra:reset;
- non viene generata una nuova migrazione.
"@

    return
}

Write-Step -Message 'Formattazione harness Fase 07'

Invoke-Checked `
    -FilePath $npxCommand `
    -ArgumentList @(
        'prettier',
        '--write',
        'scripts/phase-2/runtime/*.mjs',
        'scripts/verify-phase-7-runtime.mjs',
        'docs/phase-2/runtime-integration.md'
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Verifica strutturale Fase 07'

Invoke-Checked `
    -FilePath 'node' `
    -ArgumentList @('scripts/verify-phase-7-runtime.mjs') `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

if (-not $SkipStaticVerify) {
    Write-Step -Message 'Lint e build prima del runtime'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'lint') `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'build') `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }
}

Write-Step -Message 'Avvio infrastruttura locale'

Invoke-Checked `
    -FilePath $npmCommand `
    -ArgumentList @('run', 'infra:up') `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

$oldNodeEnvironment = $env:NODE_ENV
$oldDatabaseUrl = $env:DATABASE_URL
$oldDatabaseSsl = $env:DATABASE_SSL
$oldRedisHost = $env:REDIS_HOST
$oldRedisPort = $env:REDIS_PORT
$oldRedisPassword = $env:REDIS_PASSWORD
$oldRedisTls = $env:REDIS_TLS

try {
    Write-Step -Message 'Override temporaneo database Docker locale'

    Set-PhaseSevenLocalEnvironment `
        -EnvironmentFile $environmentFile

Write-Step -Message 'Guard e attesa PostgreSQL locale'

Invoke-Checked `
    -FilePath 'node' `
    -ArgumentList @(
        'scripts/phase-2/runtime/local-database-guard.mjs',
        '--wait-seconds',
        '90'
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Applicazione migrazioni locali'

Invoke-Checked `
    -FilePath $npmCommand `
    -ArgumentList @('run', 'db:migrate') `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Seed fixture Fase 07'

Invoke-Checked `
    -FilePath 'node' `
    -ArgumentList @(
        'scripts/phase-2/runtime/seed-phase-2-runtime.mjs'
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

$runDirectory = Join-Path `
    -Path ([System.IO.Path]::GetTempPath()) `
    -ChildPath ("fluxa-phase-7-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null

$apiStdout = Join-Path -Path $runDirectory -ChildPath 'api.stdout.log'
$apiStderr = Join-Path -Path $runDirectory -ChildPath 'api.stderr.log'
$workerStdout = Join-Path -Path $runDirectory -ChildPath 'worker.stdout.log'
$workerStderr = Join-Path -Path $runDirectory -ChildPath 'worker.stderr.log'

$nodeCommand = (Get-Command node).Source
$apiProcess = $null
$workerProcess = $null
$runtimeSucceeded = $false

$oldApiPort = $env:API_PORT
$oldApiBaseUrl = $env:PHASE2_API_BASE_URL
$oldStripeSecret = $env:STRIPE_SECRET_KEY
$oldStripeWebhookSecret = $env:STRIPE_WEBHOOK_SECRET
$oldBookingWebBaseUrl = $env:BOOKING_WEB_BASE_URL

try {
    $env:API_PORT = '3107'
    $env:PHASE2_API_BASE_URL = 'http://127.0.0.1:3107/api/v1'
    $env:STRIPE_SECRET_KEY = 'sk_test_phase7_local_signature_only'
    $env:STRIPE_WEBHOOK_SECRET = 'whsec_phase7_local_signature_secret'
    $env:BOOKING_WEB_BASE_URL = 'http://127.0.0.1:3000'

    Write-Step -Message 'Avvio API e background worker compilati'

    $apiProcess = Start-Process `
        -FilePath $nodeCommand `
        -ArgumentList @('dist/apps/api/main.js') `
        -WorkingDirectory $repositoryRoot `
        -RedirectStandardOutput $apiStdout `
        -RedirectStandardError $apiStderr `
        -PassThru `
        -WindowStyle Hidden

    $workerProcess = Start-Process `
        -FilePath $nodeCommand `
        -ArgumentList @('dist/apps/background-worker/main.js') `
        -WorkingDirectory $repositoryRoot `
        -RedirectStandardOutput $workerStdout `
        -RedirectStandardError $workerStderr `
        -PassThru `
        -WindowStyle Hidden

    Wait-ApiReady `
        -ApiProcess $apiProcess `
        -HealthUrl 'http://127.0.0.1:3107/api/v1/health/ready' `
        -StdoutLog $apiStdout `
        -StderrLog $apiStderr `
        -TimeoutSeconds 60

    Start-Sleep -Seconds 2
    $workerProcess.Refresh()

    if ($workerProcess.HasExited) {
        Get-LogTail -Path $workerStdout
        Get-LogTail -Path $workerStderr
        throw "Background worker terminato con exit code $($workerProcess.ExitCode)."
    }

    Write-Step -Message 'Smoke runtime completo'

    Invoke-Checked `
        -FilePath 'node' `
        -ArgumentList @(
            'scripts/phase-2/runtime/smoke-phase-2-runtime.mjs'
        ) `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }

    $runtimeSucceeded = $true
}
catch {
    Get-LogTail -Path $apiStdout
    Get-LogTail -Path $apiStderr
    Get-LogTail -Path $workerStdout
    Get-LogTail -Path $workerStderr
    throw
}
finally {
    Stop-PhaseProcess -Process $workerProcess
    Stop-PhaseProcess -Process $apiProcess

    $env:API_PORT = $oldApiPort
    $env:PHASE2_API_BASE_URL = $oldApiBaseUrl
    $env:STRIPE_SECRET_KEY = $oldStripeSecret
    $env:STRIPE_WEBHOOK_SECRET = $oldStripeWebhookSecret
    $env:BOOKING_WEB_BASE_URL = $oldBookingWebBaseUrl

    if ($runtimeSucceeded) {
        Remove-Item -LiteralPath $runDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
    else {
        Write-Warning "Log runtime conservati in: $runDirectory"
    }
}

}
finally {
    Restore-EnvironmentValue -Name 'NODE_ENV' -Value $oldNodeEnvironment
    Restore-EnvironmentValue -Name 'DATABASE_URL' -Value $oldDatabaseUrl
    Restore-EnvironmentValue -Name 'DATABASE_SSL' -Value $oldDatabaseSsl
    Restore-EnvironmentValue -Name 'REDIS_HOST' -Value $oldRedisHost
    Restore-EnvironmentValue -Name 'REDIS_PORT' -Value $oldRedisPort
    Restore-EnvironmentValue -Name 'REDIS_PASSWORD' -Value $oldRedisPassword
    Restore-EnvironmentValue -Name 'REDIS_TLS' -Value $oldRedisTls
}

Assert-NoWorkflowChanges -RepositoryRoot $repositoryRoot
Show-GitDiffSummary -RepositoryRoot $repositoryRoot

Write-Step -Message 'Fase 07 completata'

Write-Host @"
Migrazioni locali applicate e runtime smoke superato.

Copertura:

- disponibilità;
- concorrenza e locking;
- idempotenza hold/conversione;
- prenotazione gratuita;
- webhook Stripe firmato;
- CONFIRMED e platform fee ledger;
- expiry hold e PENDING_PAYMENT;
- late payment -> REFUND_PENDING;
- audit e outbox.

Non sono state generate nuove migrazioni.
"@
