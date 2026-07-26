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

Completa il commit della Fase 03 oppure usa git stash.
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

        if (-not $existing.Contains('PHASE_4_RESERVATION_ENGINE')) {
            throw @"
Il file esiste ma non appartiene alla Fase 04:

$Path

Lo script si ferma per evitare una sovrascrittura.
"@
        }
    }

    Write-Utf8File -Path $Path -Content $Content -DryRun:$DryRun
}

function Add-ReservationsModuleToApp {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [switch] $DryRun
    )

    $content = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
    $importLine = "import { ReservationsModule } from './reservations/reservations.module';"

    if (-not $content.Contains($importLine)) {
        $anchor = "import { PrintingModule } from './printing/printing.module';"

        if (-not $content.Contains($anchor)) {
            throw 'Anchor PrintingModule non trovato in app.module.ts.'
        }

        $content = $content.Replace(
            $anchor,
            "$anchor`n$importLine"
        )
    }

    if (-not $content.Contains("    ReservationsModule,`n")) {
        $anchor = "    PrintingModule,`n"

        if (-not $content.Contains($anchor)) {
            throw "Anchor PrintingModule non trovato nell'array imports."
        }

        $content = $content.Replace(
            $anchor,
            "$anchor    ReservationsModule,`n"
        )
    }

    Write-Utf8File -Path $Path -Content $content -DryRun:$DryRun
}

function Add-ReservationQueueConstants {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [switch] $DryRun
    )

    $content = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
    $marker = 'PHASE_4_RESERVATION_ENGINE_QUEUE'

    if (-not $content.Contains($marker)) {
        $block = @'

// PHASE_4_RESERVATION_ENGINE_QUEUE
export const RESERVATION_HOLD_EXPIRY_JOB =
  'reservations.holds.expire';
export const RESERVATION_HOLD_EXPIRY_SCHEDULER =
  'reservations-holds-expiry';
'@

        $content = $content.TrimEnd() + "`n" + $block.TrimStart()
    }

    Write-Utf8File -Path $Path -Content $content -DryRun:$DryRun
}

function Update-BackgroundWorkerModule {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [switch] $DryRun
    )

    $content = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
    $expiryImport = "import { ReservationHoldExpiryService } from './reservation-hold-expiry.service';"
    $schedulerImport = "import { ReservationHoldSchedulerService } from './reservation-hold-scheduler.service';"

    if (-not $content.Contains($expiryImport)) {
        $anchor = "import { BackgroundProcessor } from './background.processor';"

        if (-not $content.Contains($anchor)) {
            throw 'Anchor BackgroundProcessor non trovato.'
        }

        $content = $content.Replace(
            $anchor,
            "$anchor`n$expiryImport`n$schedulerImport"
        )
    }

    $oldProviders = '  providers: [BackgroundProcessor],'
    $newProviders = @'
  providers: [
    BackgroundProcessor,
    ReservationHoldExpiryService,
    ReservationHoldSchedulerService,
  ],
'@
    $newProviders = $newProviders.TrimEnd()

    if ($content.Contains($oldProviders)) {
        $content = $content.Replace($oldProviders, $newProviders)
    }
    elseif (-not $content.Contains('ReservationHoldSchedulerService,')) {
        throw 'Array providers del background worker non riconosciuto.'
    }

    Write-Utf8File -Path $Path -Content $content -DryRun:$DryRun
}

function Update-BackgroundProcessor {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Content,

        [switch] $DryRun
    )

    $existing = [System.IO.File]::ReadAllText($Path)

    if (
        -not $existing.Contains('PHASE_4_RESERVATION_ENGINE') -and
        (
            -not $existing.Contains("job.name === 'foundation.ping'") -or
            -not $existing.Contains('Unsupported background job')
        )
    ) {
        throw @"
background.processor.ts non coincide con la versione attesa.

Lo script non lo sovrascrive automaticamente.
"@
    }

    Write-Utf8File -Path $Path -Content $Content -DryRun:$DryRun
}

$repositoryRoot = Get-RepositoryRoot
$appModulePath = Join-Path -Path $repositoryRoot -ChildPath 'apps/api/src/app.module.ts'
$backgroundModulePath = Join-Path -Path $repositoryRoot -ChildPath 'apps/background-worker/src/background-worker.module.ts'
$backgroundProcessorPath = Join-Path -Path $repositoryRoot -ChildPath 'apps/background-worker/src/background.processor.ts'
$queueConstantsPath = Join-Path -Path $repositoryRoot -ChildPath 'libs/queue/src/queue.constants.ts'
$phaseThreeModule = Join-Path -Path $repositoryRoot -ChildPath 'apps/api/src/events/events.module.ts'
$phaseTwoMigration = Join-Path -Path $repositoryRoot -ChildPath 'drizzle/0009_conscious_baron_strucker.sql'

Write-Step -Message 'Preflight Fase 04'

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
    throw 'La Fase 04 non può essere eseguita direttamente su main.'
}

if (-not (Test-Path -LiteralPath $phaseThreeModule)) {
    throw "Modulo Events della Fase 03 non trovato: $phaseThreeModule"
}

if (-not (Test-Path -LiteralPath $phaseTwoMigration)) {
    throw "Migrazione Fase 02 non trovata: $phaseTwoMigration"
}

Write-Step -Message 'Creazione del reservation engine'

$content_apps_api_src_reservations_reservation_constants_ts = @'
// PHASE_4_RESERVATION_ENGINE
export const RESERVATION_BLOCKING_STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'SEATED',
] as const;

export const RESERVATION_HOLD_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\reservation.constants.ts') `
    -Content $content_apps_api_src_reservations_reservation_constants_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_dto_availability_query_dto_ts = @'
// PHASE_4_RESERVATION_ENGINE
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class AvailabilityQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  partySize!: number;
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\dto\availability-query.dto.ts') `
    -Content $content_apps_api_src_reservations_dto_availability_query_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_dto_create_reservation_hold_dto_ts = @'
// PHASE_4_RESERVATION_ENGINE
import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateReservationHoldDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  partySize!: number;

  @IsUUID('4')
  holdToken!: string;

  @IsString()
  @Length(8, 200)
  idempotencyKey!: string;
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\dto\create-reservation-hold.dto.ts') `
    -Content $content_apps_api_src_reservations_dto_create_reservation_hold_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_reservation_policy_ts = @'
// PHASE_4_RESERVATION_ENGINE
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export interface PublicBookableEvent {
  id: string;
  status: string;
  bookingOpensAt: Date;
  bookingClosesAt: Date;
  startsAt: Date;
  bookingAmountCents: number;
  capacity: number;
  currency: string;
}

export interface PublicBookingRules {
  minPartySize: number;
  maxPartySize: number;
  holdMinutes: number;
}

export function hashPublicToken(token: string): string {
  return createHash('sha256').update(token.trim().toLowerCase()).digest('hex');
}

export function buildReservationHoldRequestHash(input: {
  eventId: string;
  partySize: number;
  publicTokenHash: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        eventId: input.eventId,
        partySize: input.partySize,
        publicTokenHash: input.publicTokenHash,
      }),
    )
    .digest('hex');
}

export function calculatePlatformFee(
  amountCents: number,
  basisPoints: number,
): {
  platformFeeCents: number;
  merchantGrossCents: number;
} {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new BadRequestException({
      code: 'RESERVATION_AMOUNT_INVALID',
      message: 'L’importo della prenotazione non è valido.',
    });
  }

  if (
    !Number.isInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10_000
  ) {
    throw new BadRequestException({
      code: 'PLATFORM_FEE_INVALID',
      message: 'La commissione Fluxa non è valida.',
    });
  }

  const platformFeeCents = Math.floor(
    (amountCents * basisPoints + 5_000) / 10_000,
  );

  return {
    platformFeeCents,
    merchantGrossCents: amountCents - platformFeeCents,
  };
}

export function assertEventAcceptsHolds(
  event: PublicBookableEvent | null,
  now = new Date(),
): asserts event is PublicBookableEvent {
  if (!event) {
    throw new NotFoundException({
      code: 'PUBLIC_EVENT_NOT_FOUND',
      message: 'Evento pubblico non trovato.',
    });
  }

  if (event.status !== 'PUBLISHED') {
    throw new ConflictException({
      code: 'EVENT_NOT_BOOKABLE',
      message: 'L’evento non accetta nuove prenotazioni.',
    });
  }

  if (now.getTime() < event.bookingOpensAt.getTime()) {
    throw new ConflictException({
      code: 'EVENT_BOOKING_NOT_OPEN',
      message: 'Le prenotazioni per questo evento non sono ancora aperte.',
    });
  }

  if (now.getTime() >= event.bookingClosesAt.getTime()) {
    throw new ConflictException({
      code: 'EVENT_BOOKING_CLOSED',
      message: 'Le prenotazioni per questo evento sono chiuse.',
    });
  }

  if (now.getTime() >= event.startsAt.getTime()) {
    throw new ConflictException({
      code: 'EVENT_ALREADY_STARTED',
      message: 'L’evento è già iniziato.',
    });
  }
}

export function assertPartySizeAllowed(
  partySize: number,
  rules: PublicBookingRules | null,
): asserts rules is PublicBookingRules {
  if (!rules) {
    throw new ConflictException({
      code: 'EVENT_BOOKING_RULES_MISSING',
      message: 'Le regole di prenotazione non sono configurate.',
    });
  }

  if (
    !Number.isInteger(partySize) ||
    partySize < rules.minPartySize ||
    partySize > rules.maxPartySize
  ) {
    throw new BadRequestException({
      code: 'PARTY_SIZE_NOT_ALLOWED',
      message: `I coperti devono essere compresi tra ${rules.minPartySize} e ${rules.maxPartySize}.`,
    });
  }
}

export function remainingEventCapacity(
  eventCapacity: number,
  occupiedCapacity: number,
): number {
  return Math.max(0, eventCapacity - occupiedCapacity);
}

export function assertEventCapacityAvailable(
  eventCapacity: number,
  occupiedCapacity: number,
  requestedPartySize: number,
): void {
  if (
    remainingEventCapacity(eventCapacity, occupiedCapacity) <
    requestedPartySize
  ) {
    throw new ConflictException({
      code: 'EVENT_CAPACITY_EXHAUSTED',
      message: 'Non ci sono abbastanza posti disponibili per questo gruppo.',
    });
  }
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\reservation-policy.ts') `
    -Content $content_apps_api_src_reservations_reservation_policy_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_reservation_policy_spec_ts = @'
// PHASE_4_RESERVATION_ENGINE
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  assertEventAcceptsHolds,
  assertEventCapacityAvailable,
  assertPartySizeAllowed,
  buildReservationHoldRequestHash,
  calculatePlatformFee,
  hashPublicToken,
  remainingEventCapacity,
} from './reservation-policy';

describe('reservation policy', () => {
  it('hashes public hold tokens without storing the raw token', () => {
    expect(
      hashPublicToken('550e8400-e29b-41d4-a716-446655440000'),
    ).toHaveLength(64);
  });

  it('builds a stable request hash', () => {
    const input = {
      eventId: '2ad31d8e-3df7-4cc6-9ce1-51698f6a3bb9',
      partySize: 4,
      publicTokenHash: 'a'.repeat(64),
    };

    expect(buildReservationHoldRequestHash(input)).toBe(
      buildReservationHoldRequestHash(input),
    );
    expect(
      buildReservationHoldRequestHash({
        ...input,
        partySize: 5,
      }),
    ).not.toBe(buildReservationHoldRequestHash(input));
  });

  it('calculates the platform fee in integer cents', () => {
    expect(calculatePlatformFee(1_000, 750)).toEqual({
      platformFeeCents: 75,
      merchantGrossCents: 925,
    });
  });

  it('accepts a published event inside its booking window', () => {
    expect(() =>
      assertEventAcceptsHolds(
        {
          id: 'event',
          status: 'PUBLISHED',
          bookingOpensAt: new Date('2030-06-01T00:00:00.000Z'),
          bookingClosesAt: new Date('2030-07-01T00:00:00.000Z'),
          startsAt: new Date('2030-07-01T20:00:00.000Z'),
          bookingAmountCents: 1_000,
          capacity: 100,
          currency: 'EUR',
        },
        new Date('2030-06-15T00:00:00.000Z'),
      ),
    ).not.toThrow();
  });

  it('rejects a closed booking window', () => {
    expect(() =>
      assertEventAcceptsHolds(
        {
          id: 'event',
          status: 'PUBLISHED',
          bookingOpensAt: new Date('2030-06-01T00:00:00.000Z'),
          bookingClosesAt: new Date('2030-07-01T00:00:00.000Z'),
          startsAt: new Date('2030-07-01T20:00:00.000Z'),
          bookingAmountCents: 1_000,
          capacity: 100,
          currency: 'EUR',
        },
        new Date('2030-07-01T00:00:00.000Z'),
      ),
    ).toThrow(ConflictException);
  });

  it('enforces the configured party-size range', () => {
    expect(() =>
      assertPartySizeAllowed(8, {
        minPartySize: 1,
        maxPartySize: 8,
        holdMinutes: 15,
      }),
    ).not.toThrow();

    expect(() =>
      assertPartySizeAllowed(9, {
        minPartySize: 1,
        maxPartySize: 8,
        holdMinutes: 15,
      }),
    ).toThrow(BadRequestException);
  });

  it('calculates remaining capacity and blocks overbooking', () => {
    expect(remainingEventCapacity(100, 88)).toBe(12);
    expect(() => assertEventCapacityAvailable(100, 88, 12)).not.toThrow();
    expect(() => assertEventCapacityAvailable(100, 88, 13)).toThrow(
      ConflictException,
    );
  });
});
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\reservation-policy.spec.ts') `
    -Content $content_apps_api_src_reservations_reservation_policy_spec_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_public_reservations_controller_ts = @'
// PHASE_4_RESERVATION_ENGINE
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
import { CreateReservationHoldDto } from './dto/create-reservation-hold.dto';
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
  constructor(private readonly engine: ReservationEngineService) {}

  @Get(':holdToken')
  get(
    @Param('holdToken', new ParseUUIDPipe({ version: '4' }))
    holdToken: string,
  ) {
    return this.engine.getHold(holdToken);
  }

  @Delete(':holdToken')
  cancel(
    @Param('holdToken', new ParseUUIDPipe({ version: '4' }))
    holdToken: string,
  ) {
    return this.engine.cancelHold(holdToken);
  }
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\public-reservations.controller.ts') `
    -Content $content_apps_api_src_reservations_public_reservations_controller_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_reservations_module_ts = @'
// PHASE_4_RESERVATION_ENGINE
import { Module } from '@nestjs/common';
import {
  PublicEventReservationsController,
  PublicReservationHoldsController,
} from './public-reservations.controller';
import { ReservationEngineService } from './reservation-engine.service';

@Module({
  controllers: [
    PublicEventReservationsController,
    PublicReservationHoldsController,
  ],
  providers: [ReservationEngineService],
  exports: [ReservationEngineService],
})
export class ReservationsModule {}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\reservations.module.ts') `
    -Content $content_apps_api_src_reservations_reservations_module_ts `
    -DryRun:$DryRun

$content_apps_api_src_reservations_reservation_engine_service_ts = @'
// PHASE_4_RESERVATION_ENGINE
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { CreateReservationHoldDto } from './dto/create-reservation-hold.dto';
import {
  assertEventAcceptsHolds,
  assertEventCapacityAvailable,
  assertPartySizeAllowed,
  buildReservationHoldRequestHash,
  calculatePlatformFee,
  hashPublicToken,
  remainingEventCapacity,
  type PublicBookableEvent,
  type PublicBookingRules,
} from './reservation-policy';

interface EventRow extends QueryResultRow, PublicBookableEvent {
  organizationId: string;
  locationId: string;
  title: string;
  slug: string;
  timezone: string;
}

interface BookingRulesRow extends QueryResultRow, PublicBookingRules {
  requirePhone: boolean;
}

interface FeeRuleRow extends QueryResultRow {
  id: string;
  basisPoints: number;
}

interface OccupancyRow extends QueryResultRow {
  occupiedCapacity: number;
}

interface AvailabilityRow extends QueryResultRow {
  availableTableCount: number;
  smallestTableCapacity: number | null;
}

interface CandidateTableRow extends QueryResultRow {
  diningTableId: string;
  capacitySnapshot: number;
}

interface HoldRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
  feeRuleId: string | null;
  publicTokenHash: string;
  idempotencyKey: string;
  requestHash: string;
  status: 'ACTIVE' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';
  partySize: number;
  amountCents: number;
  platformFeeBasisPoints: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  currency: string;
  version: number;
  expiresAt: Date;
  convertedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface HoldViewRow extends HoldRow {
  eventSlug: string;
  eventTitle: string;
  eventStartsAt: Date;
  diningTableId: string | null;
  tableName: string | null;
  tableCapacity: number | null;
}

interface ExpiredHoldRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
}

const HOLD_VIEW_COLUMNS = `
  h.id,
  h.organization_id AS "organizationId",
  h.location_id AS "locationId",
  h.event_id AS "eventId",
  h.fee_rule_id AS "feeRuleId",
  h.public_token_hash AS "publicTokenHash",
  h.idempotency_key AS "idempotencyKey",
  h.request_hash AS "requestHash",
  h.status,
  h.party_size AS "partySize",
  h.amount_cents AS "amountCents",
  h.platform_fee_basis_points AS "platformFeeBasisPoints",
  h.platform_fee_cents AS "platformFeeCents",
  h.merchant_gross_cents AS "merchantGrossCents",
  h.currency,
  h.version,
  h.expires_at AS "expiresAt",
  h.converted_at AS "convertedAt",
  h.cancelled_at AS "cancelledAt",
  h.created_at AS "createdAt",
  h.updated_at AS "updatedAt",
  e.slug AS "eventSlug",
  e.title AS "eventTitle",
  e.starts_at AS "eventStartsAt",
  rta.dining_table_id AS "diningTableId",
  dt.name AS "tableName",
  dt.capacity AS "tableCapacity"
`;

@Injectable()
export class ReservationEngineService {
  constructor(private readonly database: DatabaseService) {}

  async availability(slugInput: string, partySize: number) {
    const slug = slugInput.trim().toLowerCase();
    const event = await this.loadPublicEvent(this.database.pool, slug);
    assertEventAcceptsHolds(event);

    const rules = await this.loadBookingRules(
      this.database.pool,
      event.organizationId,
      event.id,
    );
    assertPartySizeAllowed(partySize, rules);

    const [occupancy, availability] = await Promise.all([
      this.occupiedCapacity(this.database.pool, event.id),
      this.database.pool.query<AvailabilityRow>(
        `
          SELECT
            COUNT(*)::int AS "availableTableCount",
            MIN(eti.capacity_snapshot)::int AS "smallestTableCapacity"
          FROM event_table_inventory eti
          JOIN dining_tables dt
            ON dt.id = eti.dining_table_id
          WHERE eti.event_id = $1
            AND eti.organization_id = $2
            AND eti.enabled = TRUE
            AND dt.status = 'ACTIVE'
            AND eti.capacity_snapshot >= $3
            AND NOT EXISTS (
              SELECT 1
              FROM reservation_table_assignments rta
              LEFT JOIN reservation_holds h
                ON h.id = rta.hold_id
              LEFT JOIN reservations r
                ON r.id = rta.reservation_id
              WHERE rta.event_id = eti.event_id
                AND rta.dining_table_id = eti.dining_table_id
                AND rta.status = 'ACTIVE'
                AND (
                  (
                    rta.hold_id IS NOT NULL
                    AND h.status = 'ACTIVE'
                    AND h.expires_at > NOW()
                  )
                  OR
                  (
                    rta.reservation_id IS NOT NULL
                    AND r.status IN (
                      'PENDING_PAYMENT',
                      'CONFIRMED',
                      'CHECKED_IN',
                      'SEATED'
                    )
                  )
                )
            )
        `,
        [event.id, event.organizationId, partySize],
      ),
    ]);

    const occupiedCapacity = occupancy.occupiedCapacity;
    const remainingCapacity = remainingEventCapacity(
      event.capacity,
      occupiedCapacity,
    );
    const availableTableCount =
      availability.rows[0]?.availableTableCount ?? 0;
    const smallestTableCapacity =
      availability.rows[0]?.smallestTableCapacity ?? null;

    return {
      event: {
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt,
        timezone: event.timezone,
        bookingAmountCents: event.bookingAmountCents,
        currency: event.currency,
      },
      partySize,
      available:
        availableTableCount > 0 && remainingCapacity >= partySize,
      availableTableCount,
      smallestTableCapacity,
      remainingCapacity,
      holdMinutes: rules.holdMinutes,
    };
  }

  async createHold(slugInput: string, dto: CreateReservationHoldDto) {
    const slug = slugInput.trim().toLowerCase();
    const publicTokenHash = hashPublicToken(dto.holdToken);
    const idempotencyKey = dto.idempotencyKey.trim();

    try {
      const holdId = await this.withTransaction(async (client) => {
        const event = await this.loadAndLockPublicEvent(client, slug);
        assertEventAcceptsHolds(event);

        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [`reservation-event:${event.id}`],
        );

        await this.expireEventHolds(
          client,
          event.organizationId,
          event.id,
        );

        const rules = await this.loadBookingRules(
          client,
          event.organizationId,
          event.id,
        );
        assertPartySizeAllowed(dto.partySize, rules);

        const requestHash = buildReservationHoldRequestHash({
          eventId: event.id,
          partySize: dto.partySize,
          publicTokenHash,
        });

        const duplicate = await client.query<HoldRow>(
          `
            SELECT
              id,
              organization_id AS "organizationId",
              location_id AS "locationId",
              event_id AS "eventId",
              fee_rule_id AS "feeRuleId",
              public_token_hash AS "publicTokenHash",
              idempotency_key AS "idempotencyKey",
              request_hash AS "requestHash",
              status,
              party_size AS "partySize",
              amount_cents AS "amountCents",
              platform_fee_basis_points AS "platformFeeBasisPoints",
              platform_fee_cents AS "platformFeeCents",
              merchant_gross_cents AS "merchantGrossCents",
              currency,
              version,
              expires_at AS "expiresAt",
              converted_at AS "convertedAt",
              cancelled_at AS "cancelledAt",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
            FROM reservation_holds
            WHERE organization_id = $1
              AND event_id = $2
              AND idempotency_key = $3
            LIMIT 1
            FOR UPDATE
          `,
          [event.organizationId, event.id, idempotencyKey],
        );
        const existing = duplicate.rows[0];

        if (existing) {
          if (
            existing.requestHash !== requestHash ||
            existing.publicTokenHash !== publicTokenHash
          ) {
            throw new ConflictException({
              code: 'RESERVATION_IDEMPOTENCY_KEY_REUSED',
              message:
                'La chiave di idempotenza è già stata utilizzata con dati differenti.',
            });
          }

          return existing.id;
        }

        const occupancy = await this.occupiedCapacity(client, event.id);
        assertEventCapacityAvailable(
          event.capacity,
          occupancy.occupiedCapacity,
          dto.partySize,
        );

        const tableResult = await client.query<CandidateTableRow>(
          `
            SELECT
              eti.dining_table_id AS "diningTableId",
              eti.capacity_snapshot AS "capacitySnapshot"
            FROM event_table_inventory eti
            JOIN dining_tables dt
              ON dt.id = eti.dining_table_id
            WHERE eti.organization_id = $1
              AND eti.location_id = $2
              AND eti.event_id = $3
              AND eti.enabled = TRUE
              AND dt.status = 'ACTIVE'
              AND eti.capacity_snapshot >= $4
              AND NOT EXISTS (
                SELECT 1
                FROM reservation_table_assignments rta
                WHERE rta.organization_id = eti.organization_id
                  AND rta.event_id = eti.event_id
                  AND rta.dining_table_id = eti.dining_table_id
                  AND rta.status = 'ACTIVE'
              )
            ORDER BY
              eti.capacity_snapshot ASC,
              dt.sort_order ASC,
              dt.id ASC
            LIMIT 1
            FOR UPDATE OF eti, dt SKIP LOCKED
          `,
          [
            event.organizationId,
            event.locationId,
            event.id,
            dto.partySize,
          ],
        );
        const table = tableResult.rows[0];

        if (!table) {
          throw new ConflictException({
            code: 'RESERVATION_TABLE_UNAVAILABLE',
            message:
              'Non è disponibile un tavolo adatto al numero di coperti indicato.',
          });
        }

        const feeRule = await this.resolveFeeRule(
          client,
          event.organizationId,
          event.id,
        );
        const basisPoints = feeRule?.basisPoints ?? 0;
        const amounts = calculatePlatformFee(
          event.bookingAmountCents,
          basisPoints,
        );
        const holdId = randomUUID();
        const expiresAt = new Date(
          Date.now() + rules.holdMinutes * 60_000,
        );

        await client.query(
          `
            INSERT INTO reservation_holds (
              id,
              organization_id,
              location_id,
              event_id,
              fee_rule_id,
              public_token_hash,
              idempotency_key,
              request_hash,
              status,
              party_size,
              amount_cents,
              platform_fee_basis_points,
              platform_fee_cents,
              merchant_gross_cents,
              currency,
              version,
              expires_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9,$10,$11,$12,$13,$14,1,$15
            )
          `,
          [
            holdId,
            event.organizationId,
            event.locationId,
            event.id,
            feeRule?.id ?? null,
            publicTokenHash,
            idempotencyKey,
            requestHash,
            dto.partySize,
            event.bookingAmountCents,
            basisPoints,
            amounts.platformFeeCents,
            amounts.merchantGrossCents,
            event.currency,
            expiresAt,
          ],
        );

        await client.query(
          `
            INSERT INTO reservation_table_assignments (
              id,
              organization_id,
              location_id,
              event_id,
              dining_table_id,
              hold_id,
              status,
              active_event_table_key,
              version
            )
            VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,1)
          `,
          [
            randomUUID(),
            event.organizationId,
            event.locationId,
            event.id,
            table.diningTableId,
            holdId,
            `${event.id}:${table.diningTableId}`,
          ],
        );

        await this.recordChange(client, {
          organizationId: event.organizationId,
          action: 'reservation_hold.created',
          entityType: 'reservation_hold',
          entityId: holdId,
          topic: 'reservations.hold.created',
          aggregateType: 'reservation_hold',
          aggregateId: holdId,
          payload: {
            holdId,
            eventId: event.id,
            locationId: event.locationId,
            partySize: dto.partySize,
            diningTableId: table.diningTableId,
            expiresAt: expiresAt.toISOString(),
          },
        });

        return holdId;
      });

      const hold = await this.requireHoldById(holdId);

      return {
        holdToken: dto.holdToken,
        ...this.publicHoldView(hold),
      };
    } catch (error) {
      this.rethrowReservationConstraint(error);
    }
  }

  async getHold(holdToken: string) {
    const publicTokenHash = hashPublicToken(holdToken);

    await this.withTransaction(async (client) => {
      await this.expireHoldByHash(client, publicTokenHash);
    });

    const hold = await this.requireHoldByHash(publicTokenHash);
    return this.publicHoldView(hold);
  }

  async cancelHold(holdToken: string) {
    const publicTokenHash = hashPublicToken(holdToken);
    const holdId = await this.withTransaction(async (client) => {
      const result = await client.query<HoldRow>(
        `
          SELECT
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            event_id AS "eventId",
            fee_rule_id AS "feeRuleId",
            public_token_hash AS "publicTokenHash",
            idempotency_key AS "idempotencyKey",
            request_hash AS "requestHash",
            status,
            party_size AS "partySize",
            amount_cents AS "amountCents",
            platform_fee_basis_points AS "platformFeeBasisPoints",
            platform_fee_cents AS "platformFeeCents",
            merchant_gross_cents AS "merchantGrossCents",
            currency,
            version,
            expires_at AS "expiresAt",
            converted_at AS "convertedAt",
            cancelled_at AS "cancelledAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM reservation_holds
          WHERE public_token_hash = $1
          LIMIT 1
          FOR UPDATE
        `,
        [publicTokenHash],
      );
      const hold = result.rows[0];

      if (!hold) {
        throw new NotFoundException({
          code: 'RESERVATION_HOLD_NOT_FOUND',
          message: 'Hold di prenotazione non trovato.',
        });
      }

      if (
        hold.status === 'ACTIVE' &&
        hold.expiresAt.getTime() <= Date.now()
      ) {
        await this.expireLockedHold(client, hold);
        return hold.id;
      }

      if (hold.status === 'CONVERTED') {
        throw new ConflictException({
          code: 'RESERVATION_HOLD_ALREADY_CONVERTED',
          message: 'L’hold è già stato convertito in prenotazione.',
        });
      }

      if (hold.status !== 'ACTIVE') {
        return hold.id;
      }

      await client.query(
        `
          UPDATE reservation_table_assignments
          SET
            status = 'RELEASED',
            active_event_table_key = NULL,
            released_at = NOW(),
            release_reason = 'CUSTOMER_CANCELLED',
            version = version + 1,
            updated_at = NOW()
          WHERE hold_id = $1
            AND status = 'ACTIVE'
        `,
        [hold.id],
      );

      await client.query(
        `
          UPDATE reservation_holds
          SET
            status = 'CANCELLED',
            cancelled_at = NOW(),
            version = version + 1,
            updated_at = NOW()
          WHERE id = $1
        `,
        [hold.id],
      );

      await this.recordChange(client, {
        organizationId: hold.organizationId,
        action: 'reservation_hold.cancelled',
        entityType: 'reservation_hold',
        entityId: hold.id,
        topic: 'reservations.hold.cancelled',
        aggregateType: 'reservation_hold',
        aggregateId: hold.id,
        payload: {
          holdId: hold.id,
          eventId: hold.eventId,
          locationId: hold.locationId,
        },
      });

      return hold.id;
    });

    const hold = await this.requireHoldById(holdId);
    return this.publicHoldView(hold);
  }

  private async loadPublicEvent(
    executor: Pick<PoolClient, 'query'>,
    slug: string,
  ): Promise<EventRow | null> {
    const result = await executor.query<EventRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          title,
          slug,
          timezone,
          status,
          starts_at AS "startsAt",
          booking_opens_at AS "bookingOpensAt",
          booking_closes_at AS "bookingClosesAt",
          booking_amount_cents AS "bookingAmountCents",
          capacity,
          currency
        FROM events
        WHERE slug = $1
          AND status IN ('PUBLISHED', 'SOLD_OUT')
        LIMIT 1
      `,
      [slug],
    );

    return result.rows[0] ?? null;
  }

  private async loadAndLockPublicEvent(
    client: PoolClient,
    slug: string,
  ): Promise<EventRow | null> {
    const result = await client.query<EventRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          title,
          slug,
          timezone,
          status,
          starts_at AS "startsAt",
          booking_opens_at AS "bookingOpensAt",
          booking_closes_at AS "bookingClosesAt",
          booking_amount_cents AS "bookingAmountCents",
          capacity,
          currency
        FROM events
        WHERE slug = $1
          AND status IN ('PUBLISHED', 'SOLD_OUT')
        LIMIT 1
        FOR UPDATE
      `,
      [slug],
    );

    return result.rows[0] ?? null;
  }

  private async loadBookingRules(
    executor: Pick<PoolClient, 'query'>,
    organizationId: string,
    eventId: string,
  ): Promise<BookingRulesRow | null> {
    const result = await executor.query<BookingRulesRow>(
      `
        SELECT
          min_party_size AS "minPartySize",
          max_party_size AS "maxPartySize",
          hold_minutes AS "holdMinutes",
          require_phone AS "requirePhone"
        FROM event_booking_rules
        WHERE organization_id = $1
          AND event_id = $2
        LIMIT 1
      `,
      [organizationId, eventId],
    );

    return result.rows[0] ?? null;
  }

  private async occupiedCapacity(
    executor: Pick<PoolClient, 'query'>,
    eventId: string,
  ): Promise<OccupancyRow> {
    const result = await executor.query<OccupancyRow>(
      `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN rta.hold_id IS NOT NULL
                  AND h.status = 'ACTIVE'
                  AND h.expires_at > NOW()
                  THEN h.party_size
                WHEN rta.reservation_id IS NOT NULL
                  AND r.status IN (
                    'PENDING_PAYMENT',
                    'CONFIRMED',
                    'CHECKED_IN',
                    'SEATED'
                  )
                  THEN r.party_size
                ELSE 0
              END
            ),
            0
          )::int AS "occupiedCapacity"
        FROM reservation_table_assignments rta
        LEFT JOIN reservation_holds h
          ON h.id = rta.hold_id
        LEFT JOIN reservations r
          ON r.id = rta.reservation_id
        WHERE rta.event_id = $1
          AND rta.status = 'ACTIVE'
      `,
      [eventId],
    );

    return result.rows[0] ?? { occupiedCapacity: 0 };
  }

  private async resolveFeeRule(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<FeeRuleRow | null> {
    const result = await client.query<FeeRuleRow>(
      `
        SELECT
          id,
          basis_points AS "basisPoints"
        FROM platform_fee_rules
        WHERE active = TRUE
          AND effective_from <= NOW()
          AND (effective_to IS NULL OR effective_to > NOW())
          AND (
            (
              scope = 'EVENT'
              AND organization_id = $1
              AND event_id = $2
            )
            OR
            (
              scope = 'ORGANIZATION'
              AND organization_id = $1
              AND event_id IS NULL
            )
            OR
            (
              scope = 'GLOBAL'
              AND organization_id IS NULL
              AND event_id IS NULL
            )
          )
        ORDER BY
          CASE scope
            WHEN 'EVENT' THEN 1
            WHEN 'ORGANIZATION' THEN 2
            ELSE 3
          END,
          effective_from DESC,
          created_at DESC
        LIMIT 1
      `,
      [organizationId, eventId],
    );

    return result.rows[0] ?? null;
  }

  private async expireEventHolds(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<void> {
    const result = await client.query<ExpiredHoldRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          event_id AS "eventId"
        FROM reservation_holds
        WHERE organization_id = $1
          AND event_id = $2
          AND status = 'ACTIVE'
          AND expires_at <= NOW()
        FOR UPDATE
      `,
      [organizationId, eventId],
    );

    for (const hold of result.rows) {
      await this.expireLockedHold(client, hold);
    }
  }

  private async expireHoldByHash(
    client: PoolClient,
    publicTokenHash: string,
  ): Promise<void> {
    const result = await client.query<HoldRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          event_id AS "eventId",
          fee_rule_id AS "feeRuleId",
          public_token_hash AS "publicTokenHash",
          idempotency_key AS "idempotencyKey",
          request_hash AS "requestHash",
          status,
          party_size AS "partySize",
          amount_cents AS "amountCents",
          platform_fee_basis_points AS "platformFeeBasisPoints",
          platform_fee_cents AS "platformFeeCents",
          merchant_gross_cents AS "merchantGrossCents",
          currency,
          version,
          expires_at AS "expiresAt",
          converted_at AS "convertedAt",
          cancelled_at AS "cancelledAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM reservation_holds
        WHERE public_token_hash = $1
        LIMIT 1
        FOR UPDATE
      `,
      [publicTokenHash],
    );
    const hold = result.rows[0];

    if (
      hold &&
      hold.status === 'ACTIVE' &&
      hold.expiresAt.getTime() <= Date.now()
    ) {
      await this.expireLockedHold(client, hold);
    }
  }

  private async expireLockedHold(
    client: PoolClient,
    hold: {
      id: string;
      organizationId: string;
      locationId: string;
      eventId: string;
    },
  ): Promise<void> {
    await client.query(
      `
        UPDATE reservation_table_assignments
        SET
          status = 'RELEASED',
          active_event_table_key = NULL,
          released_at = NOW(),
          release_reason = 'HOLD_EXPIRED',
          version = version + 1,
          updated_at = NOW()
        WHERE hold_id = $1
          AND status = 'ACTIVE'
      `,
      [hold.id],
    );

    const update = await client.query(
      `
        UPDATE reservation_holds
        SET
          status = 'EXPIRED',
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1
          AND status = 'ACTIVE'
        RETURNING id
      `,
      [hold.id],
    );

    if (update.rowCount === 0) {
      return;
    }

    await this.recordChange(client, {
      organizationId: hold.organizationId,
      action: 'reservation_hold.expired',
      entityType: 'reservation_hold',
      entityId: hold.id,
      topic: 'reservations.hold.expired',
      aggregateType: 'reservation_hold',
      aggregateId: hold.id,
      payload: {
        holdId: hold.id,
        eventId: hold.eventId,
        locationId: hold.locationId,
      },
    });
  }

  private async requireHoldByHash(
    publicTokenHash: string,
  ): Promise<HoldViewRow> {
    const result = await this.database.pool.query<HoldViewRow>(
      `
        SELECT ${HOLD_VIEW_COLUMNS}
        FROM reservation_holds h
        JOIN events e
          ON e.id = h.event_id
        LEFT JOIN reservation_table_assignments rta
          ON rta.hold_id = h.id
        LEFT JOIN dining_tables dt
          ON dt.id = rta.dining_table_id
        WHERE h.public_token_hash = $1
        LIMIT 1
      `,
      [publicTokenHash],
    );
    const hold = result.rows[0];

    if (!hold) {
      throw new NotFoundException({
        code: 'RESERVATION_HOLD_NOT_FOUND',
        message: 'Hold di prenotazione non trovato.',
      });
    }

    return hold;
  }

  private async requireHoldById(holdId: string): Promise<HoldViewRow> {
    const result = await this.database.pool.query<HoldViewRow>(
      `
        SELECT ${HOLD_VIEW_COLUMNS}
        FROM reservation_holds h
        JOIN events e
          ON e.id = h.event_id
        LEFT JOIN reservation_table_assignments rta
          ON rta.hold_id = h.id
        LEFT JOIN dining_tables dt
          ON dt.id = rta.dining_table_id
        WHERE h.id = $1
        LIMIT 1
      `,
      [holdId],
    );
    const hold = result.rows[0];

    if (!hold) {
      throw new NotFoundException({
        code: 'RESERVATION_HOLD_NOT_FOUND',
        message: 'Hold di prenotazione non trovato.',
      });
    }

    return hold;
  }

  private publicHoldView(hold: HoldViewRow) {
    return {
      id: hold.id,
      status: hold.status,
      partySize: hold.partySize,
      amountCents: hold.amountCents,
      platformFeeCents: hold.platformFeeCents,
      merchantGrossCents: hold.merchantGrossCents,
      currency: hold.currency,
      expiresAt: hold.expiresAt,
      event: {
        slug: hold.eventSlug,
        title: hold.eventTitle,
        startsAt: hold.eventStartsAt,
      },
      table: hold.diningTableId
        ? {
            id: hold.diningTableId,
            name: hold.tableName,
            capacity: hold.tableCapacity,
          }
        : null,
    };
  }

  private async recordChange(
    client: PoolClient,
    input: {
      organizationId: string;
      action: string;
      entityType: string;
      entityId: string;
      topic: string;
      aggregateType: string;
      aggregateId: string;
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
        VALUES ($1,$2,NULL,$3,$4,$5,$6::jsonb)
      `,
      [
        randomUUID(),
        input.organizationId,
        input.action,
        input.entityType,
        input.entityId,
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
        VALUES ($1,$2,$3,$4,$5::jsonb)
      `,
      [
        randomUUID(),
        input.topic,
        input.aggregateType,
        input.aggregateId,
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
        code: 'RESERVATION_TABLE_ALREADY_HELD',
        message:
          'Il tavolo è stato appena occupato da un’altra prenotazione. Riprova.',
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
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\reservations\reservation-engine.service.ts') `
    -Content $content_apps_api_src_reservations_reservation_engine_service_ts `
    -DryRun:$DryRun

$content_apps_background_worker_src_reservation_hold_expiry_service_ts = @'
// PHASE_4_RESERVATION_ENGINE
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';

interface ExpiredHoldRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
}

@Injectable()
export class ReservationHoldExpiryService {
  constructor(private readonly database: DatabaseService) {}

  async expireAvailable(limit = 200): Promise<number> {
    return this.withTransaction(async (client) => {
      const result = await client.query<ExpiredHoldRow>(
        `
          SELECT
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            event_id AS "eventId"
          FROM reservation_holds
          WHERE status = 'ACTIVE'
            AND expires_at <= NOW()
          ORDER BY expires_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        `,
        [limit],
      );

      for (const hold of result.rows) {
        await client.query(
          `
            UPDATE reservation_table_assignments
            SET
              status = 'RELEASED',
              active_event_table_key = NULL,
              released_at = NOW(),
              release_reason = 'HOLD_EXPIRED',
              version = version + 1,
              updated_at = NOW()
            WHERE hold_id = $1
              AND status = 'ACTIVE'
          `,
          [hold.id],
        );

        const update = await client.query(
          `
            UPDATE reservation_holds
            SET
              status = 'EXPIRED',
              version = version + 1,
              updated_at = NOW()
            WHERE id = $1
              AND status = 'ACTIVE'
            RETURNING id
          `,
          [hold.id],
        );

        if (update.rowCount === 0) {
          continue;
        }

        const payload = {
          organizationId: hold.organizationId,
          holdId: hold.id,
          eventId: hold.eventId,
          locationId: hold.locationId,
        };

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
              $1,$2,NULL,'reservation_hold.expired',
              'reservation_hold',$3,$4::jsonb
            )
          `,
          [
            randomUUID(),
            hold.organizationId,
            hold.id,
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
              $1,'reservations.hold.expired',
              'reservation_hold',$2,$3::jsonb
            )
          `,
          [randomUUID(), hold.id, JSON.stringify(payload)],
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
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\background-worker\src\reservation-hold-expiry.service.ts') `
    -Content $content_apps_background_worker_src_reservation_hold_expiry_service_ts `
    -DryRun:$DryRun

$content_apps_background_worker_src_reservation_hold_scheduler_service_ts = @'
// PHASE_4_RESERVATION_ENGINE
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  BACKGROUND_QUEUE,
  RESERVATION_HOLD_EXPIRY_JOB,
  RESERVATION_HOLD_EXPIRY_SCHEDULER,
} from '@fluxa/queue';

@Injectable()
export class ReservationHoldSchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue(BACKGROUND_QUEUE)
    private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      RESERVATION_HOLD_EXPIRY_SCHEDULER,
      {
        every: 30_000,
      },
      {
        name: RESERVATION_HOLD_EXPIRY_JOB,
        data: {},
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5_000,
          },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
    );
  }
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\background-worker\src\reservation-hold-scheduler.service.ts') `
    -Content $content_apps_background_worker_src_reservation_hold_scheduler_service_ts `
    -DryRun:$DryRun

$content_scripts_verify_phase_4_reservation_engine_mjs = @'
// PHASE_4_RESERVATION_ENGINE
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredFiles = [
  'apps/api/src/reservations/reservations.module.ts',
  'apps/api/src/reservations/public-reservations.controller.ts',
  'apps/api/src/reservations/reservation-engine.service.ts',
  'apps/api/src/reservations/reservation-policy.ts',
  'apps/api/src/reservations/reservation-policy.spec.ts',
  'apps/api/src/reservations/dto/availability-query.dto.ts',
  'apps/api/src/reservations/dto/create-reservation-hold.dto.ts',
  'apps/background-worker/src/reservation-hold-expiry.service.ts',
  'apps/background-worker/src/reservation-hold-scheduler.service.ts',
];

for (const relativePath of requiredFiles) {
  await stat(path.join(root, relativePath));
}

const [
  appModule,
  controller,
  engine,
  backgroundModule,
  backgroundProcessor,
  scheduler,
  queueConstants,
] = await Promise.all([
  readFile(path.join(root, 'apps/api/src/app.module.ts'), 'utf8'),
  readFile(
    path.join(
      root,
      'apps/api/src/reservations/public-reservations.controller.ts',
    ),
    'utf8',
  ),
  readFile(
    path.join(root, 'apps/api/src/reservations/reservation-engine.service.ts'),
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
      'apps/background-worker/src/reservation-hold-scheduler.service.ts',
    ),
    'utf8',
  ),
  readFile(path.join(root, 'libs/queue/src/queue.constants.ts'), 'utf8'),
]);

const requiredFragments = [
  ["ReservationsModule import", appModule, "import { ReservationsModule }"],
  ['ReservationsModule registration', appModule, 'ReservationsModule,'],
  ['Public decorator', controller, '@Public()'],
  ['Availability route', controller, "@Get(':slug/availability')"],
  ['Hold route', controller, "@Post(':slug/holds')"],
  ['Hold status route', controller, "@Get(':holdToken')"],
  ['Hold cancellation route', controller, "@Delete(':holdToken')"],
  ['Advisory lock', engine, 'pg_advisory_xact_lock'],
  ['Smallest table ordering', engine, 'capacity_snapshot ASC'],
  ['Row skipping', engine, 'SKIP LOCKED'],
  ['Request idempotency', engine, 'idempotency_key'],
  ['Token hashing', engine, 'hashPublicToken'],
  ['Capacity enforcement', engine, 'assertEventCapacityAvailable'],
  ['Assignment unique key', engine, 'active_event_table_key'],
  ['Audit insert', engine, 'INSERT INTO audit_events'],
  ['Outbox insert', engine, 'INSERT INTO outbox_events'],
  [
    'Expiry service registration',
    backgroundModule,
    'ReservationHoldExpiryService',
  ],
  [
    'Expiry scheduler registration',
    backgroundModule,
    'ReservationHoldSchedulerService',
  ],
  ['Expiry processor dispatch', backgroundProcessor, 'expireAvailable'],
  ['Scheduler API', scheduler, 'upsertJobScheduler'],
  [
    'Expiry job constant',
    queueConstants,
    'RESERVATION_HOLD_EXPIRY_JOB',
  ],
];

const missing = requiredFragments
  .filter(([, content, fragment]) => !content.includes(fragment))
  .map(([name]) => name);

if (missing.length > 0) {
  console.error('Verifica Fase 04 fallita.');
  console.error(`Elementi mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`File verificati: ${requiredFiles.length}`);
console.log('Disponibilità e hold pubblici: presenti');
console.log('Lock evento, SKIP LOCKED e idempotenza: presenti');
console.log('Scadenza automatica BullMQ: presente');
console.log('Audit e outbox transazionali: presenti');
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'scripts\verify-phase-4-reservation-engine.mjs') `
    -Content $content_scripts_verify_phase_4_reservation_engine_mjs `
    -DryRun:$DryRun

$content_docs_phase_2_reservation_engine_md = @'
# Fluxa Phase 2 — Reservation engine

## Obiettivo

La Fase 04 introduce il motore pubblico di disponibilità e hold temporanei.

Non crea ancora una prenotazione definitiva e non esegue ancora il pagamento.

## Endpoint pubblici

```text
GET    /api/v1/public/events/:slug/availability?partySize=4
POST   /api/v1/public/events/:slug/holds
GET    /api/v1/public/reservation-holds/:holdToken
DELETE /api/v1/public/reservation-holds/:holdToken
```

Creazione hold:

```json
{
  "partySize": 4,
  "holdToken": "UUID v4 generato dal client",
  "idempotencyKey": "chiave stabile del tentativo"
}
```

Il token pubblico viene restituito al client ma nel database ne viene salvato
soltanto l’hash SHA-256.

## Protezione dall’overbooking

La creazione di un hold:

1. apre una transazione PostgreSQL;
2. blocca la riga dell’evento;
3. acquisisce un advisory lock per evento;
4. libera gli hold già scaduti;
5. verifica la capacità totale residua;
6. sceglie il tavolo attivo più piccolo compatibile;
7. inserisce hold e assegnazione tavolo;
8. inserisce audit e outbox;
9. esegue il commit.

L’indice univoco su `active_event_table_key` resta l’ultima protezione contro
due assegnazioni attive sullo stesso tavolo.

## Idempotenza

La chiave di idempotenza è unica per organizzazione ed evento.

Un retry con la stessa chiave, lo stesso token e gli stessi coperti restituisce
lo stesso hold. Il riuso con dati differenti produce conflitto.

## Commissione

Al momento della creazione dell’hold viene risolta la regola più specifica:

1. evento;
2. organizzazione;
3. globale.

Basis point e importi vengono salvati come snapshot nell’hold.

## Scadenza

Il background worker registra un Job Scheduler BullMQ ogni 30 secondi.

Il job:

- seleziona hold scaduti con `FOR UPDATE SKIP LOCKED`;
- rilascia l’assegnazione tavolo;
- imposta lo stato `EXPIRED`;
- registra audit e outbox.

## Confini

Questa fase non aggiunge:

- dati anagrafici del cliente;
- checkout del provider;
- conversione hold → reservation;
- rimborsi;
- check-in;
- websocket o SSE.
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'docs\phase-2\reservation-engine.md') `
    -Content $content_docs_phase_2_reservation_engine_md `
    -DryRun:$DryRun

$backgroundProcessorContent = @'
// PHASE_4_RESERVATION_ENGINE
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  BACKGROUND_QUEUE,
  RESERVATION_HOLD_EXPIRY_JOB,
} from '@fluxa/queue';
import { ReservationHoldExpiryService } from './reservation-hold-expiry.service';

@Processor(BACKGROUND_QUEUE, { concurrency: 10 })
export class BackgroundProcessor extends WorkerHost {
  constructor(
    private readonly reservationHoldExpiry: ReservationHoldExpiryService,
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
      let expired = 0;

      for (let iteration = 0; iteration < 10; iteration += 1) {
        const count = await this.reservationHoldExpiry.expireAvailable(200);
        expired += count;

        if (count < 200) {
          break;
        }
      }

      return {
        ok: true,
        job: RESERVATION_HOLD_EXPIRY_JOB,
        expired,
      };
    }

    throw new Error(`Unsupported background job: ${job.name}`);
  }
}
'@

Add-ReservationsModuleToApp `
    -Path $appModulePath `
    -DryRun:$DryRun

Add-ReservationQueueConstants `
    -Path $queueConstantsPath `
    -DryRun:$DryRun

Update-BackgroundWorkerModule `
    -Path $backgroundModulePath `
    -DryRun:$DryRun

Update-BackgroundProcessor `
    -Path $backgroundProcessorPath `
    -Content $backgroundProcessorContent `
    -DryRun:$DryRun

if ($DryRun) {
    Write-Step -Message 'DryRun Fase 04 completato'

    Write-Host @"
Verrebbero aggiunti:

- disponibilità pubblica per evento;
- hold temporanei idempotenti;
- scelta atomica del tavolo più piccolo;
- protezione capacità evento e tavolo;
- token pubblici salvati solo come hash;
- commissione Fluxa come snapshot;
- cancellazione e scadenza hold;
- Job Scheduler BullMQ nel background worker;
- audit e outbox transazionali.
"@

    return
}

Write-Step -Message 'Formattazione Fase 04'

Invoke-Checked `
    -FilePath $npxCommand `
    -ArgumentList @(
        'prettier',
        '--write',
        'apps/api/src/app.module.ts',
        'apps/api/src/reservations/**/*.ts',
        'apps/background-worker/src/background-worker.module.ts',
        'apps/background-worker/src/background.processor.ts',
        'apps/background-worker/src/reservation-hold-expiry.service.ts',
        'apps/background-worker/src/reservation-hold-scheduler.service.ts',
        'libs/queue/src/queue.constants.ts',
        'scripts/verify-phase-4-reservation-engine.mjs',
        'docs/phase-2/reservation-engine.md'
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Verifica strutturale Fase 04'

Invoke-Checked `
    -FilePath 'node' `
    -ArgumentList @('scripts/verify-phase-4-reservation-engine.mjs') `
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

    Write-Step -Message 'Test policy reservation engine'

    Invoke-Checked `
        -FilePath $npxCommand `
        -ArgumentList @(
            'jest',
            '--runInBand',
            '--runTestsByPath',
            'apps/api/src/reservations/reservation-policy.spec.ts',
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

Write-Step -Message 'Fase 04 completata'

Write-Host @"
Reservation engine creato.

La migrazione 0009 non è stata applicata al database.

Controlli finali:

git status --short
git diff --check
git diff --stat
"@
