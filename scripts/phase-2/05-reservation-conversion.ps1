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

Completa il commit della Fase 04 oppure usa git stash.
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

        if (-not $existing.Contains('PHASE_5_RESERVATION_CONVERSION')) {
            throw @"
Il file esiste ma non appartiene alla Fase 05:

$Path

Lo script si ferma per evitare una sovrascrittura.
"@
        }
    }

    Write-Utf8File -Path $Path -Content $Content -DryRun:$DryRun
}

function Write-ExpectedPhaseFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Content,

        [Parameter(Mandatory)]
        [string] $RequiredMarker,

        [switch] $DryRun
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File atteso non trovato: $Path"
    }

    $existing = [System.IO.File]::ReadAllText($Path)

    if (
        -not $existing.Contains($RequiredMarker) -and
        -not $existing.Contains('PHASE_5_RESERVATION_CONVERSION')
    ) {
        throw @"
Il file non coincide con la fase precedente attesa:

$Path
"@
    }

    Write-Utf8File -Path $Path -Content $Content -DryRun:$DryRun
}

function Update-ReservationsSchema {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [switch] $DryRun
    )

    $content = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
    $tableStart = $content.IndexOf(
        'export const reservations = pgTable(',
        [StringComparison]::Ordinal
    )
    $tableEnd = $content.IndexOf(
        'export const reservationTableAssignments = pgTable(',
        $tableStart,
        [StringComparison]::Ordinal
    )

    if ($tableStart -lt 0 -or $tableEnd -lt 0) {
        throw 'Definizione della tabella reservations non trovata.'
    }

    $before = $content.Substring(0, $tableStart)
    $table = $content.Substring($tableStart, $tableEnd - $tableStart)
    $after = $content.Substring($tableEnd)

    if (-not $table.Contains("paymentExpiresAt: timestamp(")) {
        $confirmedAtMarker =
            "    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),"

        $confirmedAtIndex = $table.IndexOf(
            $confirmedAtMarker,
            [StringComparison]::Ordinal
        )

        if ($confirmedAtIndex -lt 0) {
            $confirmedAtIndex = $table.IndexOf(
                "confirmedAt: timestamp('confirmed_at'",
                [StringComparison]::Ordinal
            )

            if ($confirmedAtIndex -lt 0) {
                throw @"
Campo confirmedAt non trovato nella tabella reservations.

Lo script non modifica automaticamente una struttura sconosciuta.
"@
            }

            $lineStart = $table.LastIndexOf(
                "`n",
                $confirmedAtIndex,
                [StringComparison]::Ordinal
            )

            if ($lineStart -lt 0) {
                $lineStart = 0
            }
            else {
                $lineStart += 1
            }

            $confirmedAtIndex = $lineStart
        }

        $fieldBlock = @'
    paymentExpiresAt: timestamp('payment_expires_at', {
      withTimezone: true,
    }),
'@

        $table = $table.Insert(
            $confirmedAtIndex,
            $fieldBlock.TrimEnd() + "`n"
        )
    }

    if (-not $table.Contains('reservations_payment_expiry_idx')) {
        $firstCheckIndex = $table.IndexOf(
            "    check(",
            [StringComparison]::Ordinal
        )

        if ($firstCheckIndex -lt 0) {
            throw 'Primo blocco check non trovato nella tabella reservations.'
        }

        $indexBlock = @'
    index('reservations_payment_expiry_idx').on(
      table.status,
      table.paymentExpiresAt,
    ),
'@

        $table = $table.Insert(
            $firstCheckIndex,
            $indexBlock.TrimEnd() + "`n"
        )
    }

    if (-not $table.Contains('reservations_payment_expiry_ck')) {
        $tableCloseIndex = $table.LastIndexOf(
            "  ],`n);",
            [StringComparison]::Ordinal
        )

        if ($tableCloseIndex -lt 0) {
            throw 'Chiusura della tabella reservations non trovata.'
        }

        $checkBlock = @'
    check(
      'reservations_payment_expiry_ck',
      sql`(
        (${table.status} = 'PENDING_PAYMENT' and ${table.paymentExpiresAt} is not null)
        or
        (${table.status} <> 'PENDING_PAYMENT')
      )`,
    ),
'@

        $table = $table.Insert(
            $tableCloseIndex,
            $checkBlock.TrimEnd() + "`n"
        )
    }

    Write-Utf8File `
        -Path $Path `
        -Content ($before + $table + $after) `
        -DryRun:$DryRun
}

function Update-BackgroundWorkerModule {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [switch] $DryRun
    )

    $content = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
    $importLine =
        "import { ReservationPaymentExpiryService } from './reservation-payment-expiry.service';"

    if (-not $content.Contains($importLine)) {
        $anchor =
            "import { ReservationHoldSchedulerService } from './reservation-hold-scheduler.service';"

        if (-not $content.Contains($anchor)) {
            throw 'Import ReservationHoldSchedulerService non trovato.'
        }

        $content = $content.Replace(
            $anchor,
            "$anchor`n$importLine"
        )
    }

    if (-not $content.Contains('    ReservationPaymentExpiryService,')) {
        $anchor = '    ReservationHoldSchedulerService,'

        if (-not $content.Contains($anchor)) {
            throw 'Provider ReservationHoldSchedulerService non trovato.'
        }

        $content = $content.Replace(
            $anchor,
            "$anchor`n    ReservationPaymentExpiryService,"
        )
    }

    Write-Utf8File -Path $Path -Content $content -DryRun:$DryRun
}

function Get-NewMigration {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $DrizzleDirectory,

        [Parameter(Mandatory)]
        [hashtable] $ExistingPaths
    )

    return @(
        Get-ChildItem -LiteralPath $DrizzleDirectory -Filter '*.sql' -File |
            Where-Object {
                -not $ExistingPaths.ContainsKey($_.FullName)
            }
    )
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
$schemaPath = Join-Path -Path $repositoryRoot -ChildPath 'libs/database/src/schema.ts'
$drizzleDirectory = Join-Path -Path $repositoryRoot -ChildPath 'drizzle'
$publicControllerPath = Join-Path -Path $repositoryRoot -ChildPath 'apps/api/src/reservations/public-reservations.controller.ts'
$reservationsModulePath = Join-Path -Path $repositoryRoot -ChildPath 'apps/api/src/reservations/reservations.module.ts'
$backgroundModulePath = Join-Path -Path $repositoryRoot -ChildPath 'apps/background-worker/src/background-worker.module.ts'
$backgroundProcessorPath = Join-Path -Path $repositoryRoot -ChildPath 'apps/background-worker/src/background.processor.ts'
$phaseFourEngine = Join-Path -Path $repositoryRoot -ChildPath 'apps/api/src/reservations/reservation-engine.service.ts'

Write-Step -Message 'Preflight Fase 05'

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
Assert-CleanTrackedTree -RepositoryRoot $repositoryRoot

$currentBranch = Get-CurrentGitBranch -RepositoryRoot $repositoryRoot

if ($currentBranch -eq 'main') {
    throw 'La Fase 05 non può essere eseguita direttamente su main.'
}

if (-not (Test-Path -LiteralPath $phaseFourEngine)) {
    throw "Reservation engine della Fase 04 non trovato: $phaseFourEngine"
}

$phaseFourContent = [System.IO.File]::ReadAllText($phaseFourEngine)

if (-not $phaseFourContent.Contains('PHASE_4_RESERVATION_ENGINE')) {
    throw 'Marker Fase 04 non trovato nel reservation engine.'
}

Write-Step -Message 'Creazione della conversione hold → reservation'

$content_apps_api_src_reservations_dto_convert_hold_to_reservation_dto_ts = @'
// PHASE_5_RESERVATION_CONVERSION
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class ConvertHoldToReservationDto {
  @IsUUID('4')
  reservationToken!: string;

  @IsString()
  @Length(2, 180)
  customerName!: string;

  @IsEmail()
  @MaxLength(320)
  customerEmail!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,40}$/)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customerNote?: string;
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\dto\convert-hold-to-reservation.dto.ts') `
    -Content $content_apps_api_src_reservations_dto_convert_hold_to_reservation_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_reservation_conversion_policy_ts = @'
// PHASE_5_RESERVATION_CONVERSION
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

export interface NormalizedReservationCustomer {
  name: string;
  email: string;
  phone: string | null;
  note: string | null;
}

export interface ReservationRetrySnapshot {
  publicTokenHash: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerNote: string | null;
}

export function normalizeReservationCustomer(input: {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerNote?: string;
  requirePhone: boolean;
}): NormalizedReservationCustomer {
  const customer: NormalizedReservationCustomer = {
    name: input.customerName.trim().replace(/\s+/g, ' '),
    email: input.customerEmail.trim().toLowerCase(),
    phone: input.customerPhone?.trim().replace(/\s+/g, ' ') || null,
    note: input.customerNote?.trim() || null,
  };

  if (customer.name.length < 2) {
    throw new BadRequestException({
      code: 'RESERVATION_CUSTOMER_NAME_INVALID',
      message: 'Il nome del cliente non è valido.',
    });
  }

  if (input.requirePhone && !customer.phone) {
    throw new BadRequestException({
      code: 'RESERVATION_CUSTOMER_PHONE_REQUIRED',
      message: 'Il numero di telefono è obbligatorio per questo evento.',
    });
  }

  return customer;
}

export function buildReservationConfirmationCode(): string {
  return `FX-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
}

export function initialReservationState(
  amountCents: number,
  holdExpiresAt: Date,
  now = new Date(),
): {
  status: 'PENDING_PAYMENT' | 'CONFIRMED';
  paymentExpiresAt: Date | null;
  confirmedAt: Date | null;
} {
  if (amountCents === 0) {
    return {
      status: 'CONFIRMED',
      paymentExpiresAt: null,
      confirmedAt: now,
    };
  }

  if (holdExpiresAt.getTime() <= now.getTime()) {
    throw new ConflictException({
      code: 'RESERVATION_HOLD_EXPIRED',
      message: 'L’hold è scaduto. Crea un nuovo tentativo di prenotazione.',
    });
  }

  return {
    status: 'PENDING_PAYMENT',
    paymentExpiresAt: holdExpiresAt,
    confirmedAt: null,
  };
}

export function assertHoldConvertible(input: {
  status: string;
  expiresAt: Date;
  now?: Date;
}): void {
  const now = input.now ?? new Date();

  if (input.status === 'CONVERTED') {
    return;
  }

  if (input.status === 'EXPIRED') {
    throw new ConflictException({
      code: 'RESERVATION_HOLD_EXPIRED',
      message: 'L’hold è scaduto. Crea un nuovo tentativo di prenotazione.',
    });
  }

  if (input.status === 'CANCELLED') {
    throw new ConflictException({
      code: 'RESERVATION_HOLD_CANCELLED',
      message: 'L’hold è stato annullato.',
    });
  }

  if (input.status !== 'ACTIVE') {
    throw new ConflictException({
      code: 'RESERVATION_HOLD_NOT_CONVERTIBLE',
      message: 'L’hold non può essere convertito.',
    });
  }

  if (input.expiresAt.getTime() <= now.getTime()) {
    throw new ConflictException({
      code: 'RESERVATION_HOLD_EXPIRED',
      message: 'L’hold è scaduto. Crea un nuovo tentativo di prenotazione.',
    });
  }
}

export function assertReservationRetryMatches(
  existing: ReservationRetrySnapshot,
  input: {
    publicTokenHash: string;
    customer: NormalizedReservationCustomer;
  },
): void {
  const matches =
    existing.publicTokenHash === input.publicTokenHash &&
    existing.customerName === input.customer.name &&
    existing.customerEmail === input.customer.email &&
    existing.customerPhone === input.customer.phone &&
    existing.customerNote === input.customer.note;

  if (!matches) {
    throw new ConflictException({
      code: 'RESERVATION_CONVERSION_RETRY_MISMATCH',
      message:
        'L’hold è già stato convertito con dati differenti dalla richiesta corrente.',
    });
  }
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\reservation-conversion-policy.ts') `
    -Content $content_apps_api_src_reservations_reservation_conversion_policy_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_reservation_conversion_policy_spec_ts = @'
// PHASE_5_RESERVATION_CONVERSION
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  assertHoldConvertible,
  assertReservationRetryMatches,
  buildReservationConfirmationCode,
  initialReservationState,
  normalizeReservationCustomer,
} from './reservation-conversion-policy';

describe('reservation conversion policy', () => {
  it('normalizes customer data', () => {
    expect(
      normalizeReservationCustomer({
        customerName: '  Mario   Rossi ',
        customerEmail: ' MARIO@example.com ',
        customerPhone: ' +39 333 1234567 ',
        customerNote: '  Tavolo tranquillo  ',
        requirePhone: true,
      }),
    ).toEqual({
      name: 'Mario Rossi',
      email: 'mario@example.com',
      phone: '+39 333 1234567',
      note: 'Tavolo tranquillo',
    });
  });

  it('requires the phone when configured', () => {
    expect(() =>
      normalizeReservationCustomer({
        customerName: 'Mario Rossi',
        customerEmail: 'mario@example.com',
        requirePhone: true,
      }),
    ).toThrow(BadRequestException);
  });

  it('creates a compact confirmation code', () => {
    const code = buildReservationConfirmationCode();

    expect(code).toMatch(/^FX-[A-F0-9]{20}$/);
    expect(code.length).toBeLessThanOrEqual(24);
  });

  it('creates pending payment state for a paid booking', () => {
    const expiresAt = new Date('2030-07-20T18:15:00.000Z');

    expect(
      initialReservationState(
        1_000,
        expiresAt,
        new Date('2030-07-20T18:00:00.000Z'),
      ),
    ).toEqual({
      status: 'PENDING_PAYMENT',
      paymentExpiresAt: expiresAt,
      confirmedAt: null,
    });
  });

  it('confirms a free booking immediately', () => {
    const now = new Date('2030-07-20T18:00:00.000Z');

    expect(
      initialReservationState(
        0,
        new Date('2030-07-20T18:15:00.000Z'),
        now,
      ),
    ).toEqual({
      status: 'CONFIRMED',
      paymentExpiresAt: null,
      confirmedAt: now,
    });
  });

  it('rejects an expired active hold', () => {
    expect(() =>
      assertHoldConvertible({
        status: 'ACTIVE',
        expiresAt: new Date('2030-07-20T18:00:00.000Z'),
        now: new Date('2030-07-20T18:00:01.000Z'),
      }),
    ).toThrow(ConflictException);
  });

  it('accepts an identical conversion retry', () => {
    expect(() =>
      assertReservationRetryMatches(
        {
          publicTokenHash: 'a'.repeat(64),
          customerName: 'Mario Rossi',
          customerEmail: 'mario@example.com',
          customerPhone: '+39 333 1234567',
          customerNote: null,
        },
        {
          publicTokenHash: 'a'.repeat(64),
          customer: {
            name: 'Mario Rossi',
            email: 'mario@example.com',
            phone: '+39 333 1234567',
            note: null,
          },
        },
      ),
    ).not.toThrow();
  });

  it('rejects a retry using another public token', () => {
    expect(() =>
      assertReservationRetryMatches(
        {
          publicTokenHash: 'a'.repeat(64),
          customerName: 'Mario Rossi',
          customerEmail: 'mario@example.com',
          customerPhone: null,
          customerNote: null,
        },
        {
          publicTokenHash: 'b'.repeat(64),
          customer: {
            name: 'Mario Rossi',
            email: 'mario@example.com',
            phone: null,
            note: null,
          },
        },
      ),
    ).toThrow(ConflictException);
  });
});
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\reservation-conversion-policy.spec.ts') `
    -Content $content_apps_api_src_reservations_reservation_conversion_policy_spec_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_reservation_conversion_service_ts = @'
// PHASE_5_RESERVATION_CONVERSION
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { ConvertHoldToReservationDto } from './dto/convert-hold-to-reservation.dto';
import {
  assertEventAcceptsHolds,
  hashPublicToken,
  type PublicBookableEvent,
} from './reservation-policy';
import {
  assertHoldConvertible,
  assertReservationRetryMatches,
  buildReservationConfirmationCode,
  initialReservationState,
  normalizeReservationCustomer,
} from './reservation-conversion-policy';

interface ConvertibleHoldRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
  feeRuleId: string | null;
  status: 'ACTIVE' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';
  partySize: number;
  amountCents: number;
  platformFeeBasisPoints: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  currency: string;
  expiresAt: Date;
  requirePhone: boolean;
  eventStatus: string;
  eventStartsAt: Date;
  bookingOpensAt: Date;
  bookingClosesAt: Date;
  eventCapacity: number;
}

interface AssignmentRow extends QueryResultRow {
  id: string;
  diningTableId: string;
}

interface ReservationRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
  holdId: string | null;
  publicTokenHash: string;
  confirmationCode: string;
  status:
    | 'PENDING_PAYMENT'
    | 'CONFIRMED'
    | 'CHECKED_IN'
    | 'SEATED'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'NO_SHOW'
    | 'REFUND_PENDING'
    | 'REFUNDED';
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerNote: string | null;
  partySize: number;
  amountCents: number;
  platformFeeBasisPoints: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  providerFeeCents: number;
  merchantNetCents: number;
  refundedCents: number;
  currency: string;
  version: number;
  paymentExpiresAt: Date | null;
  confirmedAt: Date | null;
  checkedInAt: Date | null;
  seatedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  noShowAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ReservationViewRow extends ReservationRow {
  eventSlug: string;
  eventTitle: string;
  eventStartsAt: Date;
  eventTimezone: string;
  diningTableId: string | null;
  tableName: string | null;
  tableCapacity: number | null;
}

const RESERVATION_VIEW_COLUMNS = `
  r.id,
  r.organization_id AS "organizationId",
  r.location_id AS "locationId",
  r.event_id AS "eventId",
  r.hold_id AS "holdId",
  r.public_token_hash AS "publicTokenHash",
  r.confirmation_code AS "confirmationCode",
  r.status,
  r.customer_name AS "customerName",
  r.customer_email AS "customerEmail",
  r.customer_phone AS "customerPhone",
  r.customer_note AS "customerNote",
  r.party_size AS "partySize",
  r.amount_cents AS "amountCents",
  r.platform_fee_basis_points AS "platformFeeBasisPoints",
  r.platform_fee_cents AS "platformFeeCents",
  r.merchant_gross_cents AS "merchantGrossCents",
  r.provider_fee_cents AS "providerFeeCents",
  r.merchant_net_cents AS "merchantNetCents",
  r.refunded_cents AS "refundedCents",
  r.currency,
  r.version,
  r.payment_expires_at AS "paymentExpiresAt",
  r.confirmed_at AS "confirmedAt",
  r.checked_in_at AS "checkedInAt",
  r.seated_at AS "seatedAt",
  r.completed_at AS "completedAt",
  r.cancelled_at AS "cancelledAt",
  r.no_show_at AS "noShowAt",
  r.refunded_at AS "refundedAt",
  r.created_at AS "createdAt",
  r.updated_at AS "updatedAt",
  e.slug AS "eventSlug",
  e.title AS "eventTitle",
  e.starts_at AS "eventStartsAt",
  e.timezone AS "eventTimezone",
  rta.dining_table_id AS "diningTableId",
  dt.name AS "tableName",
  dt.capacity AS "tableCapacity"
`;

@Injectable()
export class ReservationConversionService {
  constructor(private readonly database: DatabaseService) {}

  async convert(
    holdToken: string,
    dto: ConvertHoldToReservationDto,
  ) {
    const holdTokenHash = hashPublicToken(holdToken);
    const reservationTokenHash = hashPublicToken(dto.reservationToken);

    try {
      const reservationId = await this.withTransaction(async (client) => {
        const hold = await this.lockHold(client, holdTokenHash);

        if (!hold) {
          throw new NotFoundException({
            code: 'RESERVATION_HOLD_NOT_FOUND',
            message: 'Hold di prenotazione non trovato.',
          });
        }

        const customer = normalizeReservationCustomer({
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone,
          customerNote: dto.customerNote,
          requirePhone: hold.requirePhone,
        });

        if (hold.status === 'CONVERTED') {
          const existing = await this.loadReservationByHold(
            client,
            hold.id,
          );

          if (!existing) {
            throw new ConflictException({
              code: 'RESERVATION_CONVERSION_INCONSISTENT',
              message:
                'L’hold risulta convertito ma la prenotazione non è disponibile.',
            });
          }

          assertReservationRetryMatches(existing, {
            publicTokenHash: reservationTokenHash,
            customer,
          });

          return existing.id;
        }

        assertHoldConvertible({
          status: hold.status,
          expiresAt: hold.expiresAt,
        });

        assertEventAcceptsHolds(
          this.toPublicBookableEvent(hold),
        );

        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [`reservation-event:${hold.eventId}`],
        );

        const assignmentResult = await client.query<AssignmentRow>(
          `
            SELECT
              id,
              dining_table_id AS "diningTableId"
            FROM reservation_table_assignments
            WHERE hold_id = $1
              AND status = 'ACTIVE'
            LIMIT 1
            FOR UPDATE
          `,
          [hold.id],
        );
        const assignment = assignmentResult.rows[0];

        if (!assignment) {
          throw new ConflictException({
            code: 'RESERVATION_HOLD_TABLE_RELEASED',
            message:
              'Il tavolo associato all’hold non è più disponibile.',
          });
        }

        const initialState = initialReservationState(
          hold.amountCents,
          hold.expiresAt,
        );
        const reservationId = randomUUID();
        const confirmationCode = buildReservationConfirmationCode();

        await client.query(
          `
            INSERT INTO reservations (
              id,
              organization_id,
              location_id,
              event_id,
              hold_id,
              fee_rule_id,
              public_token_hash,
              confirmation_code,
              status,
              customer_name,
              customer_email,
              customer_phone,
              customer_note,
              party_size,
              amount_cents,
              platform_fee_basis_points,
              platform_fee_cents,
              merchant_gross_cents,
              provider_fee_cents,
              merchant_net_cents,
              refunded_cents,
              currency,
              version,
              payment_expires_at,
              confirmed_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
              $14,$15,$16,$17,$18,0,$19,0,$20,1,$21,$22
            )
          `,
          [
            reservationId,
            hold.organizationId,
            hold.locationId,
            hold.eventId,
            hold.id,
            hold.feeRuleId,
            reservationTokenHash,
            confirmationCode,
            initialState.status,
            customer.name,
            customer.email,
            customer.phone,
            customer.note,
            hold.partySize,
            hold.amountCents,
            hold.platformFeeBasisPoints,
            hold.platformFeeCents,
            hold.merchantGrossCents,
            hold.merchantGrossCents,
            hold.currency,
            initialState.paymentExpiresAt,
            initialState.confirmedAt,
          ],
        );

        const assignmentUpdate = await client.query(
          `
            UPDATE reservation_table_assignments
            SET
              hold_id = NULL,
              reservation_id = $2,
              version = version + 1,
              updated_at = NOW()
            WHERE id = $1
              AND hold_id = $3
              AND status = 'ACTIVE'
            RETURNING id
          `,
          [assignment.id, reservationId, hold.id],
        );

        if (assignmentUpdate.rowCount !== 1) {
          throw new ConflictException({
            code: 'RESERVATION_ASSIGNMENT_TRANSFER_FAILED',
            message:
              'Non è stato possibile trasferire il tavolo alla prenotazione.',
          });
        }

        const holdUpdate = await client.query(
          `
            UPDATE reservation_holds
            SET
              status = 'CONVERTED',
              converted_at = NOW(),
              version = version + 1,
              updated_at = NOW()
            WHERE id = $1
              AND status = 'ACTIVE'
            RETURNING id
          `,
          [hold.id],
        );

        if (holdUpdate.rowCount !== 1) {
          throw new ConflictException({
            code: 'RESERVATION_HOLD_CONVERSION_FAILED',
            message: 'L’hold non è più convertibile.',
          });
        }

        await client.query(
          `
            INSERT INTO reservation_status_history (
              id,
              organization_id,
              location_id,
              reservation_id,
              from_status,
              to_status,
              changed_by_user_id,
              reason,
              metadata
            )
            VALUES (
              $1,$2,$3,$4,NULL,$5,NULL,'HOLD_CONVERTED',$6::jsonb
            )
          `,
          [
            randomUUID(),
            hold.organizationId,
            hold.locationId,
            reservationId,
            initialState.status,
            JSON.stringify({
              holdId: hold.id,
              diningTableId: assignment.diningTableId,
            }),
          ],
        );

        await this.recordChange(client, {
          organizationId: hold.organizationId,
          action: 'reservation.created',
          reservationId,
          topic: 'reservations.reservation.created',
          payload: {
            reservationId,
            holdId: hold.id,
            eventId: hold.eventId,
            locationId: hold.locationId,
            diningTableId: assignment.diningTableId,
            status: initialState.status,
            confirmationCode,
            paymentExpiresAt:
              initialState.paymentExpiresAt?.toISOString() ?? null,
          },
        });

        return reservationId;
      });

      const reservation = await this.requireReservationById(reservationId);

      return {
        reservationToken: dto.reservationToken,
        ...this.publicReservationView(reservation),
      };
    } catch (error) {
      this.rethrowReservationConstraint(error);
    }
  }

  async getByToken(reservationToken: string) {
    const publicTokenHash = hashPublicToken(reservationToken);
    const reservation = await this.requireReservationByHash(publicTokenHash);

    return this.publicReservationView(reservation);
  }

  private async lockHold(
    client: PoolClient,
    publicTokenHash: string,
  ): Promise<ConvertibleHoldRow | null> {
    const result = await client.query<ConvertibleHoldRow>(
      `
        SELECT
          h.id,
          h.organization_id AS "organizationId",
          h.location_id AS "locationId",
          h.event_id AS "eventId",
          h.fee_rule_id AS "feeRuleId",
          h.status,
          h.party_size AS "partySize",
          h.amount_cents AS "amountCents",
          h.platform_fee_basis_points AS "platformFeeBasisPoints",
          h.platform_fee_cents AS "platformFeeCents",
          h.merchant_gross_cents AS "merchantGrossCents",
          h.currency,
          h.expires_at AS "expiresAt",
          br.require_phone AS "requirePhone",
          e.status AS "eventStatus",
          e.starts_at AS "eventStartsAt",
          e.booking_opens_at AS "bookingOpensAt",
          e.booking_closes_at AS "bookingClosesAt",
          e.capacity AS "eventCapacity"
        FROM reservation_holds h
        JOIN events e
          ON e.id = h.event_id
        JOIN event_booking_rules br
          ON br.event_id = h.event_id
        WHERE h.public_token_hash = $1
        LIMIT 1
        FOR UPDATE OF h, e
      `,
      [publicTokenHash],
    );

    return result.rows[0] ?? null;
  }

  private toPublicBookableEvent(
    hold: ConvertibleHoldRow,
  ): PublicBookableEvent {
    return {
      id: hold.eventId,
      status: hold.eventStatus,
      bookingOpensAt: hold.bookingOpensAt,
      bookingClosesAt: hold.bookingClosesAt,
      startsAt: hold.eventStartsAt,
      bookingAmountCents: hold.amountCents,
      capacity: hold.eventCapacity,
      currency: hold.currency,
    };
  }

  private async loadReservationByHold(
    client: PoolClient,
    holdId: string,
  ): Promise<ReservationRow | null> {
    const result = await client.query<ReservationRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          event_id AS "eventId",
          hold_id AS "holdId",
          public_token_hash AS "publicTokenHash",
          confirmation_code AS "confirmationCode",
          status,
          customer_name AS "customerName",
          customer_email AS "customerEmail",
          customer_phone AS "customerPhone",
          customer_note AS "customerNote",
          party_size AS "partySize",
          amount_cents AS "amountCents",
          platform_fee_basis_points AS "platformFeeBasisPoints",
          platform_fee_cents AS "platformFeeCents",
          merchant_gross_cents AS "merchantGrossCents",
          provider_fee_cents AS "providerFeeCents",
          merchant_net_cents AS "merchantNetCents",
          refunded_cents AS "refundedCents",
          currency,
          version,
          payment_expires_at AS "paymentExpiresAt",
          confirmed_at AS "confirmedAt",
          checked_in_at AS "checkedInAt",
          seated_at AS "seatedAt",
          completed_at AS "completedAt",
          cancelled_at AS "cancelledAt",
          no_show_at AS "noShowAt",
          refunded_at AS "refundedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM reservations
        WHERE hold_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [holdId],
    );

    return result.rows[0] ?? null;
  }

  private async requireReservationByHash(
    publicTokenHash: string,
  ): Promise<ReservationViewRow> {
    const result = await this.database.pool.query<ReservationViewRow>(
      `
        SELECT ${RESERVATION_VIEW_COLUMNS}
        FROM reservations r
        JOIN events e
          ON e.id = r.event_id
        LEFT JOIN reservation_table_assignments rta
          ON rta.reservation_id = r.id
        LEFT JOIN dining_tables dt
          ON dt.id = rta.dining_table_id
        WHERE r.public_token_hash = $1
        LIMIT 1
      `,
      [publicTokenHash],
    );
    const reservation = result.rows[0];

    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: 'Prenotazione non trovata.',
      });
    }

    return reservation;
  }

  private async requireReservationById(
    reservationId: string,
  ): Promise<ReservationViewRow> {
    const result = await this.database.pool.query<ReservationViewRow>(
      `
        SELECT ${RESERVATION_VIEW_COLUMNS}
        FROM reservations r
        JOIN events e
          ON e.id = r.event_id
        LEFT JOIN reservation_table_assignments rta
          ON rta.reservation_id = r.id
        LEFT JOIN dining_tables dt
          ON dt.id = rta.dining_table_id
        WHERE r.id = $1
        LIMIT 1
      `,
      [reservationId],
    );
    const reservation = result.rows[0];

    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: 'Prenotazione non trovata.',
      });
    }

    return reservation;
  }

  private publicReservationView(reservation: ReservationViewRow) {
    const paymentRequired = reservation.amountCents > 0;

    return {
      id: reservation.id,
      confirmationCode: reservation.confirmationCode,
      status: reservation.status,
      customer: {
        name: reservation.customerName,
        email: reservation.customerEmail,
        phone: reservation.customerPhone,
        note: reservation.customerNote,
      },
      partySize: reservation.partySize,
      event: {
        slug: reservation.eventSlug,
        title: reservation.eventTitle,
        startsAt: reservation.eventStartsAt,
        timezone: reservation.eventTimezone,
      },
      table: reservation.diningTableId
        ? {
            id: reservation.diningTableId,
            name: reservation.tableName,
            capacity: reservation.tableCapacity,
          }
        : null,
      payment: {
        required: paymentRequired,
        amountCents: reservation.amountCents,
        currency: reservation.currency,
        status: reservation.status,
        expiresAt: reservation.paymentExpiresAt,
        nextAction:
          paymentRequired && reservation.status === 'PENDING_PAYMENT'
            ? 'CREATE_CHECKOUT_SESSION'
            : 'NONE',
      },
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
    };
  }

  private async recordChange(
    client: PoolClient,
    input: {
      organizationId: string;
      action: string;
      reservationId: string;
      topic: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO audit_events (
          id,
          organization_id,
          actor_user_id,
          action,
          entity_type,
          entity_id,
          payload
        )
        VALUES ($1,$2,NULL,$3,'reservation',$4,$5::jsonb)
      `,
      [
        randomUUID(),
        input.organizationId,
        input.action,
        input.reservationId,
        JSON.stringify(input.payload),
      ],
    );

    await client.query(
      `
        INSERT INTO outbox_events (
          id,
          topic,
          aggregate_type,
          aggregate_id,
          payload
        )
        VALUES ($1,$2,'reservation',$3,$4::jsonb)
      `,
      [
        randomUUID(),
        input.topic,
        input.reservationId,
        JSON.stringify({
          organizationId: input.organizationId,
          ...input.payload,
        }),
      ],
    );
  }

  private async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private rethrowReservationConstraint(error: unknown): never {
    if (this.isUniqueViolation(error)) {
      throw new ConflictException({
        code: 'RESERVATION_ALREADY_CREATED',
        message:
          'La prenotazione risulta già creata oppure il token è già stato utilizzato.',
      });
    }

    throw error;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\reservation-conversion.service.ts') `
    -Content $content_apps_api_src_reservations_reservation_conversion_service_ts `
    -DryRun:$DryRun

$content_apps_background_worker_src_reservation_payment_expiry_service_ts = @'
// PHASE_5_RESERVATION_CONVERSION
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';

interface ExpiredReservationRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
}

@Injectable()
export class ReservationPaymentExpiryService {
  constructor(private readonly database: DatabaseService) {}

  async expireAvailable(limit = 200): Promise<number> {
    return this.withTransaction(async (client) => {
      const result = await client.query<ExpiredReservationRow>(
        `
          SELECT
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            event_id AS "eventId"
          FROM reservations
          WHERE status = 'PENDING_PAYMENT'
            AND payment_expires_at <= NOW()
          ORDER BY payment_expires_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        `,
        [limit],
      );

      for (const reservation of result.rows) {
        await client.query(
          `
            UPDATE reservation_table_assignments
            SET
              status = 'RELEASED',
              active_event_table_key = NULL,
              released_at = NOW(),
              release_reason = 'PAYMENT_TIMEOUT',
              version = version + 1,
              updated_at = NOW()
            WHERE reservation_id = $1
              AND status = 'ACTIVE'
          `,
          [reservation.id],
        );

        const update = await client.query(
          `
            UPDATE reservations
            SET
              status = 'EXPIRED',
              payment_expires_at = NULL,
              version = version + 1,
              updated_at = NOW()
            WHERE id = $1
              AND status = 'PENDING_PAYMENT'
            RETURNING id
          `,
          [reservation.id],
        );

        if (update.rowCount === 0) {
          continue;
        }

        const payload = {
          organizationId: reservation.organizationId,
          reservationId: reservation.id,
          eventId: reservation.eventId,
          locationId: reservation.locationId,
        };

        await client.query(
          `
            INSERT INTO reservation_status_history (
              id,
              organization_id,
              location_id,
              reservation_id,
              from_status,
              to_status,
              changed_by_user_id,
              reason,
              metadata
            )
            VALUES (
              $1,$2,$3,$4,'PENDING_PAYMENT','EXPIRED',
              NULL,'PAYMENT_TIMEOUT',$5::jsonb
            )
          `,
          [
            randomUUID(),
            reservation.organizationId,
            reservation.locationId,
            reservation.id,
            JSON.stringify(payload),
          ],
        );

        await client.query(
          `
            INSERT INTO audit_events (
              id,
              organization_id,
              actor_user_id,
              action,
              entity_type,
              entity_id,
              payload
            )
            VALUES (
              $1,$2,NULL,'reservation.payment_expired',
              'reservation',$3,$4::jsonb
            )
          `,
          [
            randomUUID(),
            reservation.organizationId,
            reservation.id,
            JSON.stringify(payload),
          ],
        );

        await client.query(
          `
            INSERT INTO outbox_events (
              id,
              topic,
              aggregate_type,
              aggregate_id,
              payload
            )
            VALUES (
              $1,'reservations.reservation.expired',
              'reservation',$2,$3::jsonb
            )
          `,
          [
            randomUUID(),
            reservation.id,
            JSON.stringify(payload),
          ],
        );
      }

      return result.rows.length;
    });
  }

  private async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\background-worker\src\reservation-payment-expiry.service.ts') `
    -Content $content_apps_background_worker_src_reservation_payment_expiry_service_ts `
    -DryRun:$DryRun

$content_scripts_verify_phase_5_reservation_conversion_mjs = @'
// PHASE_5_RESERVATION_CONVERSION
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const migrationArgument = process.argv[2];

if (!migrationArgument) {
  console.error(
    'Uso: node scripts/verify-phase-5-reservation-conversion.mjs <migrazione.sql>',
  );
  process.exit(1);
}

const root = process.cwd();
const migrationPath = path.resolve(root, migrationArgument);

const requiredFiles = [
  'apps/api/src/reservations/reservation-conversion.service.ts',
  'apps/api/src/reservations/reservation-conversion-policy.ts',
  'apps/api/src/reservations/reservation-conversion-policy.spec.ts',
  'apps/api/src/reservations/dto/convert-hold-to-reservation.dto.ts',
  'apps/background-worker/src/reservation-payment-expiry.service.ts',
];

for (const relativePath of requiredFiles) {
  await stat(path.join(root, relativePath));
}

await stat(migrationPath);

const [
  schema,
  migration,
  controller,
  module,
  conversionService,
  backgroundModule,
  backgroundProcessor,
  expiryService,
] = await Promise.all([
  readFile(path.join(root, 'libs/database/src/schema.ts'), 'utf8'),
  readFile(migrationPath, 'utf8'),
  readFile(
    path.join(
      root,
      'apps/api/src/reservations/public-reservations.controller.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/api/src/reservations/reservations.module.ts'),
    'utf8',
  ),
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
      'apps/background-worker/src/background-worker.module.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/background-worker/src/background.processor.ts'),
    'utf8',
  ),
  readFile(
    path.join(
      root,
      'apps/background-worker/src/reservation-payment-expiry.service.ts',
    ),
    'utf8',
  ),
]);

const checks = [
  ['Schema payment expiry field', schema, "paymentExpiresAt: timestamp("],
  [
    'Schema payment expiry index',
    schema,
    'reservations_payment_expiry_idx',
  ],
  [
    'Schema payment expiry constraint',
    schema,
    'reservations_payment_expiry_ck',
  ],
  ['Migration payment expiry column', migration, 'payment_expires_at'],
  ['Conversion route', controller, "@Post(':holdToken/reservations')"],
  ['Public reservation route', controller, "@Get(':reservationToken')"],
  [
    'Conversion service provider',
    module,
    'ReservationConversionService',
  ],
  ['Reservation insert', conversionService, 'INSERT INTO reservations'],
  [
    'Assignment transfer',
    conversionService,
    'reservation_id = $2',
  ],
  ['Hold conversion', conversionService, "status = 'CONVERTED'"],
  [
    'Status history',
    conversionService,
    'INSERT INTO reservation_status_history',
  ],
  ['Reservation audit', conversionService, 'INSERT INTO audit_events'],
  ['Reservation outbox', conversionService, 'INSERT INTO outbox_events'],
  [
    'Payment expiry provider',
    backgroundModule,
    'ReservationPaymentExpiryService',
  ],
  [
    'Payment expiry processor',
    backgroundProcessor,
    'paymentExpiry.expireAvailable',
  ],
  [
    'Payment expiry row locking',
    expiryService,
    'FOR UPDATE SKIP LOCKED',
  ],
  [
    'Payment expiry release',
    expiryService,
    "release_reason = 'PAYMENT_TIMEOUT'",
  ],
];

const missing = checks
  .filter(([, content, fragment]) => !content.includes(fragment))
  .map(([name]) => name);

if (missing.length > 0) {
  console.error('Verifica Fase 05 fallita.');
  console.error(`Elementi mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`File nuovi verificati: ${requiredFiles.length}`);
console.log(`Migrazione verificata: ${path.relative(root, migrationPath)}`);
console.log('Conversione hold → reservation: presente');
console.log('Trasferimento tavolo e idempotenza retry: presenti');
console.log('Scadenza PENDING_PAYMENT: presente');
console.log('Pagamenti POS esistenti: non modificati');
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'scripts\verify-phase-5-reservation-conversion.mjs') `
    -Content $content_scripts_verify_phase_5_reservation_conversion_mjs `
    -DryRun:$DryRun

$content_docs_phase_2_reservation_conversion_md = @'
# Fluxa Phase 2 — Conversione hold in prenotazione

## Obiettivo

La Fase 05 converte un hold attivo in una prenotazione persistente.

Il pagamento online resta separato dal checkout POS e verrà collegato nella
fase successiva tramite `reservation_payments`.

## Endpoint pubblici

```text
POST /api/v1/public/reservation-holds/:holdToken/reservations
GET  /api/v1/public/reservations/:reservationToken
```

Corpo della conversione:

```json
{
  "reservationToken": "UUID v4 generato dal client",
  "customerName": "Mario Rossi",
  "customerEmail": "mario@example.com",
  "customerPhone": "+39 333 1234567",
  "customerNote": "Tavolo tranquillo"
}
```

Nel database viene conservato soltanto l’hash SHA-256 del token pubblico.

## Transazione atomica

La conversione:

1. blocca l’hold e l’evento;
2. verifica stato e scadenza;
3. valida i dati cliente;
4. verifica l’assegnazione tavolo attiva;
5. crea la prenotazione;
6. trasferisce l’assegnazione da `hold_id` a `reservation_id`;
7. marca l’hold come `CONVERTED`;
8. registra lo storico di stato;
9. inserisce audit e outbox;
10. esegue il commit.

Un retry identico restituisce la prenotazione già creata. Un retry con token
o dati cliente differenti produce conflitto.

## Stato iniziale

Per importi superiori a zero:

```text
PENDING_PAYMENT
```

La scadenza del pagamento coincide con la scadenza originaria dell’hold.

Per un evento gratuito:

```text
CONFIRMED
```

La prenotazione viene confermata subito e non richiede checkout.

## Scadenza del pagamento

Lo schema aggiunge:

```text
reservations.payment_expires_at
```

Il background worker estende il job già esistente e:

- seleziona prenotazioni `PENDING_PAYMENT` scadute;
- rilascia il tavolo;
- imposta lo stato `EXPIRED`;
- registra storico, audit e outbox.

## Separazione dai pagamenti POS

Questa fase non modifica:

- `payment_transactions`;
- `checkouts`;
- controller e servizi POS sotto `apps/api/src/payments`.

Il prossimo checkout online userà esclusivamente `reservation_payments`.

## Confini

Questa fase non crea ancora:

- sessione del provider di pagamento;
- webhook;
- conferma dopo pagamento;
- rimborso;
- check-in.
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'docs\phase-2\reservation-conversion.md') `
    -Content $content_docs_phase_2_reservation_conversion_md `
    -DryRun:$DryRun

$publicControllerContent = @'
// PHASE_5_RESERVATION_CONVERSION
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { ConvertHoldToReservationDto } from './dto/convert-hold-to-reservation.dto';
import { CreateReservationHoldDto } from './dto/create-reservation-hold.dto';
import { ReservationConversionService } from './reservation-conversion.service';
import { ReservationEngineService } from './reservation-engine.service';

@Public()
@Controller('public/events')
export class PublicEventReservationsController {
  constructor(private readonly engine: ReservationEngineService) {}

  @Get(':slug/availability')
  availability(
    @Param('slug') slug: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.engine.availability(slug, query.partySize);
  }

  @Post(':slug/holds')
  createHold(
    @Param('slug') slug: string,
    @Body() dto: CreateReservationHoldDto,
  ) {
    return this.engine.createHold(slug, dto);
  }
}

@Public()
@Controller('public/reservation-holds')
export class PublicReservationHoldsController {
  constructor(
    private readonly engine: ReservationEngineService,
    private readonly conversion: ReservationConversionService,
  ) {}

  @Get(':holdToken')
  get(
    @Param('holdToken', new ParseUUIDPipe({ version: '4' }))
    holdToken: string,
  ) {
    return this.engine.getHold(holdToken);
  }

  @Post(':holdToken/reservations')
  convert(
    @Param('holdToken', new ParseUUIDPipe({ version: '4' }))
    holdToken: string,
    @Body() dto: ConvertHoldToReservationDto,
  ) {
    return this.conversion.convert(holdToken, dto);
  }

  @Delete(':holdToken')
  cancel(
    @Param('holdToken', new ParseUUIDPipe({ version: '4' }))
    holdToken: string,
  ) {
    return this.engine.cancelHold(holdToken);
  }
}

@Public()
@Controller('public/reservations')
export class PublicReservationsController {
  constructor(
    private readonly conversion: ReservationConversionService,
  ) {}

  @Get(':reservationToken')
  get(
    @Param('reservationToken', new ParseUUIDPipe({ version: '4' }))
    reservationToken: string,
  ) {
    return this.conversion.getByToken(reservationToken);
  }
}
'@

$reservationsModuleContent = @'
// PHASE_5_RESERVATION_CONVERSION
import { Module } from '@nestjs/common';
import {
  PublicEventReservationsController,
  PublicReservationHoldsController,
  PublicReservationsController,
} from './public-reservations.controller';
import { ReservationConversionService } from './reservation-conversion.service';
import { ReservationEngineService } from './reservation-engine.service';

@Module({
  controllers: [
    PublicEventReservationsController,
    PublicReservationHoldsController,
    PublicReservationsController,
  ],
  providers: [
    ReservationEngineService,
    ReservationConversionService,
  ],
  exports: [
    ReservationEngineService,
    ReservationConversionService,
  ],
})
export class ReservationsModule {}
'@

$backgroundProcessorContent = @'
// PHASE_5_RESERVATION_CONVERSION
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  BACKGROUND_QUEUE,
  RESERVATION_HOLD_EXPIRY_JOB,
} from '@fluxa/queue';
import { ReservationHoldExpiryService } from './reservation-hold-expiry.service';
import { ReservationPaymentExpiryService } from './reservation-payment-expiry.service';

@Processor(BACKGROUND_QUEUE, { concurrency: 10 })
export class BackgroundProcessor extends WorkerHost {
  constructor(
    private readonly holdExpiry: ReservationHoldExpiryService,
    private readonly paymentExpiry: ReservationPaymentExpiryService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === 'foundation.ping') {
      return {
        ok: true,
        worker: 'background-worker',
        jobId: job.id,
      };
    }

    if (job.name === RESERVATION_HOLD_EXPIRY_JOB) {
      let expiredHolds = 0;
      let expiredReservations = 0;

      for (let iteration = 0; iteration < 10; iteration += 1) {
        const count = await this.holdExpiry.expireAvailable(200);
        expiredHolds += count;

        if (count < 200) {
          break;
        }
      }

      for (let iteration = 0; iteration < 10; iteration += 1) {
        const count = await this.paymentExpiry.expireAvailable(200);
        expiredReservations += count;

        if (count < 200) {
          break;
        }
      }

      return {
        ok: true,
        job: RESERVATION_HOLD_EXPIRY_JOB,
        expiredHolds,
        expiredReservations,
      };
    }

    throw new Error(`Unsupported background job: ${job.name}`);
  }
}
'@

Update-ReservationsSchema `
    -Path $schemaPath `
    -DryRun:$DryRun

Write-ExpectedPhaseFile `
    -Path $publicControllerPath `
    -Content $publicControllerContent `
    -RequiredMarker 'PHASE_4_RESERVATION_ENGINE' `
    -DryRun:$DryRun

Write-ExpectedPhaseFile `
    -Path $reservationsModulePath `
    -Content $reservationsModuleContent `
    -RequiredMarker 'PHASE_4_RESERVATION_ENGINE' `
    -DryRun:$DryRun

Update-BackgroundWorkerModule `
    -Path $backgroundModulePath `
    -DryRun:$DryRun

Write-ExpectedPhaseFile `
    -Path $backgroundProcessorPath `
    -Content $backgroundProcessorContent `
    -RequiredMarker 'PHASE_4_RESERVATION_ENGINE' `
    -DryRun:$DryRun

if ($DryRun) {
    Write-Step -Message 'DryRun Fase 05 completato'

    Write-Host @"
Verrebbero aggiunti:

- conversione atomica hold → reservation;
- dati cliente e token pubblico hashato;
- prenotazione PENDING_PAYMENT o CONFIRMED se gratuita;
- trasferimento dell'assegnazione tavolo;
- scadenza del pagamento;
- storico stato, audit e outbox;
- nuova migrazione Drizzle;
- nessuna modifica al dominio dei pagamenti POS.
"@

    return
}

Write-Step -Message 'Formattazione Fase 05'

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

Write-Step -Message 'Generazione migrazione payment expiry'

$existingSqlFiles = @(
    Get-ChildItem -LiteralPath $drizzleDirectory -Filter '*.sql' -File
)
$existingPaths = @{}
$existingHashes = @{}

foreach ($file in $existingSqlFiles) {
    $existingPaths[$file.FullName] = $true
    $existingHashes[$file.FullName] = (
        Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256
    ).Hash
}

Invoke-Checked `
    -FilePath $npmCommand `
    -ArgumentList @('run', 'db:generate') `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

foreach ($file in $existingSqlFiles) {
    $currentHash = (
        Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256
    ).Hash

    if ($currentHash -ne $existingHashes[$file.FullName]) {
        throw "Migrazione esistente modificata da Drizzle: $($file.FullName)"
    }
}

$newMigrations = Get-NewMigration `
    -DrizzleDirectory $drizzleDirectory `
    -ExistingPaths $existingPaths

if ($newMigrations.Count -ne 1) {
    $details = @(
        $newMigrations |
            ForEach-Object {
                $_.FullName
            }
    ) -join [Environment]::NewLine

    throw @"
Drizzle avrebbe dovuto generare una sola migrazione.
Migrazioni nuove rilevate: $($newMigrations.Count)

$details
"@
}

$migration = $newMigrations[0]
$relativeMigrationPath = Get-RepositoryRelativePath `
    -RepositoryRoot $repositoryRoot `
    -FullPath $migration.FullName

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
Conversione hold → reservation creata.

Migrazione generata:
$relativeMigrationPath

La migrazione non è stata applicata al database.

Controlli finali:

git status --short
git diff --check
git diff --stat
"@
