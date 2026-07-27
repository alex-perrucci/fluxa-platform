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

Completa il commit della Fase 02 oppure usa git stash.
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

        if (-not $existing.Contains('PHASE_3_EVENTS_MODULE')) {
            throw @"
Il file esiste ma non è stato generato dalla Fase 03:

$Path

Lo script si ferma per evitare una sovrascrittura.
"@
        }
    }

    Write-Utf8File -Path $Path -Content $Content -DryRun:$DryRun
}

function Add-EventsModuleToApp {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [switch] $DryRun
    )

    $content = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
    $importLine = "import { EventsModule } from './events/events.module';"

    if (-not $content.Contains($importLine)) {
        $anchor = "import { FiscalModule } from './fiscal/fiscal.module';"

        if (-not $content.Contains($anchor)) {
            throw "Anchor import FiscalModule non trovato in app.module.ts."
        }

        $content = $content.Replace(
            $anchor,
            "$importLine`n$anchor"
        )
    }

    if (-not $content.Contains("    EventsModule,`n")) {
        $anchor = "    FiscalModule,`n"

        if (-not $content.Contains($anchor)) {
            throw "Anchor FiscalModule non trovato nell'array imports."
        }

        $content = $content.Replace(
            $anchor,
            "    EventsModule,`n$anchor"
        )
    }

    Write-Utf8File -Path $Path -Content $content -DryRun:$DryRun
}

$repositoryRoot = Get-RepositoryRoot
$appModulePath = Join-Path -Path $repositoryRoot -ChildPath 'apps/api/src/app.module.ts'
$schemaPath = Join-Path -Path $repositoryRoot -ChildPath 'libs/database/src/schema.ts'
$migrationPath = Join-Path -Path $repositoryRoot -ChildPath 'drizzle/0009_conscious_baron_strucker.sql'

Write-Step -Message 'Preflight Fase 03'

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
    throw 'La Fase 03 non può essere eseguita direttamente su main.'
}

if (-not (Test-Path -LiteralPath $migrationPath)) {
    throw "Migrazione Fase 02 non trovata: $migrationPath"
}

$schema = [System.IO.File]::ReadAllText($schemaPath)

if (-not $schema.Contains('PHASE_2_EVENTS_RESERVATIONS_TABLES_START')) {
    throw 'Schema Events/Reservations della Fase 02 non trovato.'
}

Write-Step -Message 'Creazione del modulo Events'

$content_apps_api_src_events_event_constants_ts = @'
// PHASE_3_EVENTS_MODULE
export const EVENT_STATUSES = [
  'DRAFT',
  'PUBLISHED',
  'SOLD_OUT',
  'CANCELLED',
  'COMPLETED',
  'ARCHIVED',
] as const;

export const EVENT_WRITE_ROLES = ['OWNER', 'ADMIN', 'MANAGER'] as const;
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\event.constants.ts') `
    -Content $content_apps_api_src_events_event_constants_ts `
    -DryRun:$DryRun

$content_apps_api_src_events_dto_event_booking_rules_dto_ts = @'
// PHASE_3_EVENTS_MODULE
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class EventBookingRulesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minPartySize?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxPartySize!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  holdMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bookingCutoffMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cancellationCutoffMinutes?: number;

  @IsOptional()
  @IsBoolean()
  autoAssignSmallestTable?: boolean;

  @IsOptional()
  @IsBoolean()
  allowManualAssignment?: boolean;

  @IsOptional()
  @IsBoolean()
  requirePhone?: boolean;
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\dto\event-booking-rules.dto.ts') `
    -Content $content_apps_api_src_events_dto_event_booking_rules_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_events_dto_create_event_dto_ts = @'
// PHASE_3_EVENTS_MODULE
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EventBookingRulesDto } from './event-booking-rules.dto';

export class CreateEventDto {
  @IsUUID()
  locationId!: string;

  @IsString()
  @Length(3, 220)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(3, 180)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i)
  slug?: string;

  @IsString()
  @Length(1, 20_000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  coverImageUrl?: string;

  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsISO8601({ strict: true })
  endsAt!: string;

  @IsISO8601({ strict: true })
  bookingOpensAt!: string;

  @IsISO8601({ strict: true })
  bookingClosesAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  bookingAmountCents!: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/i)
  currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  cancellationPolicy?: string;

  @ValidateNested()
  @Type(() => EventBookingRulesDto)
  bookingRules!: EventBookingRulesDto;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  tableIds?: string[];
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\dto\create-event.dto.ts') `
    -Content $content_apps_api_src_events_dto_create_event_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_events_dto_update_event_dto_ts = @'
// PHASE_3_EVENTS_MODULE
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @Length(3, 220)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(3, 180)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i)
  slug?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20_000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  coverImageUrl?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  bookingOpensAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  bookingClosesAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bookingAmountCents?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/i)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  cancellationPolicy?: string | null;
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\dto\update-event.dto.ts') `
    -Content $content_apps_api_src_events_dto_update_event_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_events_dto_event_list_query_dto_ts = @'
// PHASE_3_EVENTS_MODULE
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EVENT_STATUSES } from '../event.constants';

export class EventListQueryDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsIn(EVENT_STATUSES)
  status?: (typeof EVENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\dto\event-list-query.dto.ts') `
    -Content $content_apps_api_src_events_dto_event_list_query_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_events_dto_replace_event_tables_dto_ts = @'
// PHASE_3_EVENTS_MODULE
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

export class ReplaceEventTablesDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  tableIds!: string[];
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\dto\replace-event-tables.dto.ts') `
    -Content $content_apps_api_src_events_dto_replace_event_tables_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_events_dto_cancel_event_dto_ts = @'
// PHASE_3_EVENTS_MODULE
import { IsString, Length } from 'class-validator';

export class CancelEventDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\dto\cancel-event.dto.ts') `
    -Content $content_apps_api_src_events_dto_cancel_event_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_events_event_policy_ts = @'
// PHASE_3_EVENTS_MODULE
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { EventStatus } from '@fluxa/database';

export interface EventScheduleInput {
  startsAt: Date;
  endsAt: Date;
  bookingOpensAt: Date;
  bookingClosesAt: Date;
  bookingAmountCents: number;
  capacity: number;
  timezone: string;
  currency: string;
}

export interface BookingRulesInput {
  minPartySize?: number;
  maxPartySize: number;
  holdMinutes?: number;
  bookingCutoffMinutes?: number;
  cancellationCutoffMinutes?: number;
  autoAssignSmallestTable?: boolean;
  allowManualAssignment?: boolean;
  requirePhone?: boolean;
}

export interface NormalizedBookingRules {
  minPartySize: number;
  maxPartySize: number;
  holdMinutes: number;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  autoAssignSmallestTable: boolean;
  allowManualAssignment: boolean;
  requirePhone: boolean;
}

export interface InventoryMetrics {
  tableCount: number;
  activeTableCount: number;
  inventoryCapacity: number;
  maxTableCapacity: number;
}

export interface PublishableEvent {
  status: EventStatus;
  startsAt: Date;
  bookingClosesAt: Date;
  capacity: number;
}

export function normalizeEventSlug(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);

  if (slug.length < 3) {
    throw new BadRequestException({
      code: 'EVENT_SLUG_INVALID',
      message: 'Lo slug dell’evento deve contenere almeno tre caratteri.',
    });
  }

  return slug;
}

export function validateEventSchedule(input: EventScheduleInput): void {
  assertValidDate(input.startsAt, 'startsAt');
  assertValidDate(input.endsAt, 'endsAt');
  assertValidDate(input.bookingOpensAt, 'bookingOpensAt');
  assertValidDate(input.bookingClosesAt, 'bookingClosesAt');

  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new BadRequestException({
      code: 'EVENT_END_BEFORE_START',
      message: 'La fine dell’evento deve essere successiva all’inizio.',
    });
  }

  if (input.bookingClosesAt.getTime() <= input.bookingOpensAt.getTime()) {
    throw new BadRequestException({
      code: 'EVENT_BOOKING_WINDOW_INVALID',
      message: 'La chiusura prenotazioni deve seguire l’apertura.',
    });
  }

  if (input.bookingClosesAt.getTime() > input.startsAt.getTime()) {
    throw new BadRequestException({
      code: 'EVENT_BOOKING_CLOSES_AFTER_START',
      message: 'Le prenotazioni devono chiudersi entro l’inizio dell’evento.',
    });
  }

  if (!Number.isInteger(input.bookingAmountCents) || input.bookingAmountCents < 0) {
    throw new BadRequestException({
      code: 'EVENT_BOOKING_AMOUNT_INVALID',
      message: 'L’importo di prenotazione non è valido.',
    });
  }

  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    throw new BadRequestException({
      code: 'EVENT_CAPACITY_INVALID',
      message: 'La capacità dell’evento deve essere positiva.',
    });
  }

  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new BadRequestException({
      code: 'EVENT_CURRENCY_INVALID',
      message: 'La valuta deve essere un codice ISO di tre lettere.',
    });
  }

  try {
    new Intl.DateTimeFormat('it-IT', {
      timeZone: input.timezone,
    }).format(input.startsAt);
  } catch {
    throw new BadRequestException({
      code: 'EVENT_TIMEZONE_INVALID',
      message: 'Il fuso orario dell’evento non è valido.',
    });
  }
}

export function normalizeBookingRules(
  input: BookingRulesInput,
): NormalizedBookingRules {
  const rules: NormalizedBookingRules = {
    minPartySize: input.minPartySize ?? 1,
    maxPartySize: input.maxPartySize,
    holdMinutes: input.holdMinutes ?? 15,
    bookingCutoffMinutes: input.bookingCutoffMinutes ?? 0,
    cancellationCutoffMinutes: input.cancellationCutoffMinutes ?? 0,
    autoAssignSmallestTable: input.autoAssignSmallestTable ?? true,
    allowManualAssignment: input.allowManualAssignment ?? true,
    requirePhone: input.requirePhone ?? true,
  };

  if (
    !Number.isInteger(rules.minPartySize) ||
    !Number.isInteger(rules.maxPartySize) ||
    rules.minPartySize < 1 ||
    rules.maxPartySize < rules.minPartySize
  ) {
    throw new BadRequestException({
      code: 'EVENT_PARTY_SIZE_RANGE_INVALID',
      message: 'L’intervallo dei coperti prenotabili non è valido.',
    });
  }

  if (
    !Number.isInteger(rules.holdMinutes) ||
    rules.holdMinutes < 1 ||
    rules.holdMinutes > 120
  ) {
    throw new BadRequestException({
      code: 'EVENT_HOLD_MINUTES_INVALID',
      message: 'La durata dell’hold deve essere compresa tra 1 e 120 minuti.',
    });
  }

  if (
    !Number.isInteger(rules.bookingCutoffMinutes) ||
    rules.bookingCutoffMinutes < 0 ||
    !Number.isInteger(rules.cancellationCutoffMinutes) ||
    rules.cancellationCutoffMinutes < 0
  ) {
    throw new BadRequestException({
      code: 'EVENT_CUTOFF_INVALID',
      message: 'I tempi limite non possono essere negativi.',
    });
  }

  return rules;
}

export function assertRulesFitCapacity(
  rules: NormalizedBookingRules,
  eventCapacity: number,
  maxTableCapacity?: number,
): void {
  if (rules.maxPartySize > eventCapacity) {
    throw new BadRequestException({
      code: 'EVENT_PARTY_SIZE_EXCEEDS_CAPACITY',
      message: 'Il numero massimo di coperti supera la capacità dell’evento.',
    });
  }

  if (
    maxTableCapacity !== undefined &&
    maxTableCapacity > 0 &&
    rules.maxPartySize > maxTableCapacity
  ) {
    throw new BadRequestException({
      code: 'EVENT_PARTY_SIZE_EXCEEDS_TABLE',
      message:
        'Il numero massimo di coperti supera la capacità del tavolo più grande.',
    });
  }
}

export function assertInventoryFitsEvent(
  eventCapacity: number,
  metrics: InventoryMetrics,
  allowEmpty: boolean,
): void {
  if (metrics.tableCount === 0) {
    if (allowEmpty) return;

    throw new ConflictException({
      code: 'EVENT_TABLE_INVENTORY_EMPTY',
      message: 'Seleziona almeno un tavolo prima di pubblicare l’evento.',
    });
  }

  if (metrics.activeTableCount !== metrics.tableCount) {
    throw new ConflictException({
      code: 'EVENT_TABLE_INVENTORY_INACTIVE',
      message: 'Uno o più tavoli selezionati non sono attivi.',
    });
  }

  if (metrics.inventoryCapacity < eventCapacity) {
    throw new ConflictException({
      code: 'EVENT_TABLE_CAPACITY_INSUFFICIENT',
      message: 'La capacità dei tavoli selezionati è insufficiente.',
    });
  }
}

export function assertEventEditable(status: EventStatus): void {
  if (status !== 'DRAFT') {
    throw new ConflictException({
      code: 'EVENT_NOT_EDITABLE',
      message: 'Solo un evento in bozza può essere modificato.',
    });
  }
}

export function assertEventPublishable(
  event: PublishableEvent,
  metrics: InventoryMetrics,
  rules: NormalizedBookingRules | null,
  now = new Date(),
): void {
  assertEventEditable(event.status);

  if (event.startsAt.getTime() <= now.getTime()) {
    throw new ConflictException({
      code: 'EVENT_START_NOT_IN_FUTURE',
      message: 'L’evento deve iniziare nel futuro.',
    });
  }

  if (event.bookingClosesAt.getTime() <= now.getTime()) {
    throw new ConflictException({
      code: 'EVENT_BOOKING_ALREADY_CLOSED',
      message: 'La chiusura prenotazioni deve essere nel futuro.',
    });
  }

  assertInventoryFitsEvent(event.capacity, metrics, false);

  if (!rules) {
    throw new ConflictException({
      code: 'EVENT_BOOKING_RULES_MISSING',
      message: 'Configura le regole di prenotazione prima della pubblicazione.',
    });
  }

  assertRulesFitCapacity(rules, event.capacity, metrics.maxTableCapacity);
}

export function assertEventCancellable(status: EventStatus): void {
  if (status !== 'PUBLISHED' && status !== 'SOLD_OUT') {
    throw new ConflictException({
      code: 'EVENT_NOT_CANCELLABLE',
      message: 'Solo un evento pubblicato può essere annullato.',
    });
  }
}

export function assertEventArchivable(status: EventStatus): void {
  if (!['DRAFT', 'CANCELLED', 'COMPLETED'].includes(status)) {
    throw new ConflictException({
      code: 'EVENT_NOT_ARCHIVABLE',
      message:
        'Un evento pubblicato o sold out deve essere annullato prima di archiviarlo.',
    });
  }
}

export function normalizeEventPagination(input: {
  page?: number;
  pageSize?: number;
}) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 25;

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function assertValidDate(value: Date, field: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new BadRequestException({
      code: 'EVENT_DATE_INVALID',
      message: `La data ${field} non è valida.`,
    });
  }
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\event-policy.ts') `
    -Content $content_apps_api_src_events_event_policy_ts `
    -DryRun:$DryRun

$content_apps_api_src_events_event_policy_spec_ts = @'
// PHASE_3_EVENTS_MODULE
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  assertEventArchivable,
  assertEventCancellable,
  assertEventPublishable,
  assertInventoryFitsEvent,
  assertRulesFitCapacity,
  normalizeBookingRules,
  normalizeEventSlug,
  validateEventSchedule,
} from './event-policy';

describe('event policy', () => {
  const schedule = {
    startsAt: new Date('2030-07-20T20:00:00.000Z'),
    endsAt: new Date('2030-07-21T02:00:00.000Z'),
    bookingOpensAt: new Date('2030-06-01T08:00:00.000Z'),
    bookingClosesAt: new Date('2030-07-20T18:00:00.000Z'),
    bookingAmountCents: 1000,
    capacity: 120,
    timezone: 'Europe/Rome',
    currency: 'EUR',
  };

  it('normalizes an event slug', () => {
    expect(normalizeEventSlug('  Serata d’Estate 2026  ')).toBe(
      'serata-d-estate-2026',
    );
  });

  it('accepts a valid event schedule', () => {
    expect(() => validateEventSchedule(schedule)).not.toThrow();
  });

  it('rejects booking closure after event start', () => {
    expect(() =>
      validateEventSchedule({
        ...schedule,
        bookingClosesAt: new Date('2030-07-20T21:00:00.000Z'),
      }),
    ).toThrow(BadRequestException);
  });

  it('applies booking-rule defaults', () => {
    expect(
      normalizeBookingRules({
        maxPartySize: 8,
      }),
    ).toEqual({
      minPartySize: 1,
      maxPartySize: 8,
      holdMinutes: 15,
      bookingCutoffMinutes: 0,
      cancellationCutoffMinutes: 0,
      autoAssignSmallestTable: true,
      allowManualAssignment: true,
      requirePhone: true,
    });
  });

  it('rejects a party size larger than the biggest table', () => {
    expect(() =>
      assertRulesFitCapacity(
        normalizeBookingRules({ maxPartySize: 10 }),
        100,
        8,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects insufficient table inventory', () => {
    expect(() =>
      assertInventoryFitsEvent(
        100,
        {
          tableCount: 10,
          activeTableCount: 10,
          inventoryCapacity: 80,
          maxTableCapacity: 8,
        },
        false,
      ),
    ).toThrow(ConflictException);
  });

  it('accepts a publishable event', () => {
    expect(() =>
      assertEventPublishable(
        {
          status: 'DRAFT',
          startsAt: schedule.startsAt,
          bookingClosesAt: schedule.bookingClosesAt,
          capacity: 100,
        },
        {
          tableCount: 15,
          activeTableCount: 15,
          inventoryCapacity: 120,
          maxTableCapacity: 8,
        },
        normalizeBookingRules({ maxPartySize: 8 }),
        new Date('2030-05-01T00:00:00.000Z'),
      ),
    ).not.toThrow();
  });

  it('allows cancellation only for a public event', () => {
    expect(() => assertEventCancellable('PUBLISHED')).not.toThrow();
    expect(() => assertEventCancellable('DRAFT')).toThrow(ConflictException);
  });

  it('prevents direct archival of a public event', () => {
    expect(() => assertEventArchivable('CANCELLED')).not.toThrow();
    expect(() => assertEventArchivable('PUBLISHED')).toThrow(ConflictException);
  });
});
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\event-policy.spec.ts') `
    -Content $content_apps_api_src_events_event_policy_spec_ts `
    -DryRun:$DryRun

$content_apps_api_src_events_events_access_service_ts = @'
// PHASE_3_EVENTS_MODULE
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';

interface EventLocationRow extends QueryResultRow {
  id: string;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
  assignmentId: string | null;
  assignmentLocationId: string | null;
}

@Injectable()
export class EventsAccessService {
  constructor(private readonly database: DatabaseService) {}

  async assertLocation(auth: AuthContext, locationId: string) {
    const organizationId = assertOrganizationScope(auth);
    const result = await this.database.pool.query<EventLocationRow>(
      `
        SELECT
          l.id,
          l.timezone,
          l.status,
          da.id AS "assignmentId",
          da.location_id AS "assignmentLocationId"
        FROM locations l
        LEFT JOIN device_assignments da
          ON da.organization_id = l.organization_id
         AND da.device_id = $3
         AND da.active = TRUE
        WHERE l.id = $1
          AND l.organization_id = $2
        LIMIT 1
      `,
      [locationId, organizationId, auth.deviceId],
    );

    const location = result.rows[0];

    if (!location || location.status !== 'ACTIVE') {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Punto vendita attivo non trovato.',
      });
    }

    if (!location.assignmentId) {
      throw new ForbiddenException({
        code: 'DEVICE_NOT_ASSIGNED',
        message: "Il dispositivo non è assegnato all'organizzazione corrente.",
      });
    }

    if (
      location.assignmentLocationId &&
      location.assignmentLocationId !== locationId
    ) {
      throw new ForbiddenException({
        code: 'DEVICE_LOCATION_ACCESS_DENIED',
        message: 'Il dispositivo è assegnato a un altro punto vendita.',
      });
    }

    return {
      organizationId,
      locationId,
      timezone: location.timezone,
    };
  }
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\events-access.service.ts') `
    -Content $content_apps_api_src_events_events_access_service_ts `
    -DryRun:$DryRun

$content_apps_api_src_events_events_controller_ts = @'
// PHASE_3_EVENTS_MODULE
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CancelEventDto } from './dto/cancel-event.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { EventBookingRulesDto } from './dto/event-booking-rules.dto';
import { EventListQueryDto } from './dto/event-list-query.dto';
import { ReplaceEventTablesDto } from './dto/replace-event-tables.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: EventListQueryDto) {
    return this.eventsService.list(auth, query);
  }

  @Get(':eventId')
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.eventsService.get(auth, eventId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateEventDto) {
    return this.eventsService.create(auth, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Patch(':eventId')
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(auth, eventId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Put(':eventId/tables')
  replaceTables(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ReplaceEventTablesDto,
  ) {
    return this.eventsService.replaceTables(auth, eventId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Put(':eventId/booking-rules')
  updateBookingRules(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: EventBookingRulesDto,
  ) {
    return this.eventsService.updateBookingRules(auth, eventId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post(':eventId/publish')
  publish(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.eventsService.publish(auth, eventId);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Post(':eventId/cancel')
  cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CancelEventDto,
  ) {
    return this.eventsService.cancel(auth, eventId, dto);
  }

  @Roles('OWNER', 'ADMIN', 'MANAGER')
  @Delete(':eventId')
  archive(
    @CurrentAuth() auth: AuthContext,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.eventsService.archive(auth, eventId);
  }
}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\events.controller.ts') `
    -Content $content_apps_api_src_events_events_controller_ts `
    -DryRun:$DryRun

$content_apps_api_src_events_events_module_ts = @'
// PHASE_3_EVENTS_MODULE
import { Module } from '@nestjs/common';
import { EventsAccessService } from './events-access.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsAccessService, EventsService],
  exports: [EventsService],
})
export class EventsModule {}
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\events.module.ts') `
    -Content $content_apps_api_src_events_events_module_ts `
    -DryRun:$DryRun

$content_apps_api_src_events_events_service_ts = @'
// PHASE_3_EVENTS_MODULE
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { EventStatus } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { CancelEventDto } from './dto/cancel-event.dto';
import type { CreateEventDto } from './dto/create-event.dto';
import type { EventBookingRulesDto } from './dto/event-booking-rules.dto';
import type { EventListQueryDto } from './dto/event-list-query.dto';
import type { ReplaceEventTablesDto } from './dto/replace-event-tables.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import {
  assertEventArchivable,
  assertEventCancellable,
  assertEventEditable,
  assertEventPublishable,
  assertInventoryFitsEvent,
  assertRulesFitCapacity,
  normalizeBookingRules,
  normalizeEventPagination,
  normalizeEventSlug,
  validateEventSchedule,
  type InventoryMetrics,
  type NormalizedBookingRules,
} from './event-policy';
import { EventsAccessService } from './events-access.service';

interface EventRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  createdByUserId: string;
  title: string;
  slug: string;
  description: string;
  timezone: string;
  status: EventStatus;
  coverImageUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  bookingOpensAt: Date;
  bookingClosesAt: Date;
  bookingAmountCents: number;
  currency: string;
  capacity: number;
  cancellationPolicy: string | null;
  version: number;
  publishedAt: Date | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface EventMediaRow extends QueryResultRow {
  id: string;
  objectKey: string;
  publicUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  widthPx: number | null;
  heightPx: number | null;
  altText: string | null;
  isCover: boolean;
  sortOrder: number;
}

interface EventTableRow extends QueryResultRow {
  inventoryId: string;
  diningTableId: string;
  capacitySnapshot: number;
  enabled: boolean;
  tableCode: string;
  tableName: string;
  tableCapacity: number;
  tableStatus: 'ACTIVE' | 'INACTIVE';
  areaId: string;
  areaCode: string;
  areaName: string;
}

interface DiningTableRow extends QueryResultRow {
  id: string;
  capacity: number;
  status: 'ACTIVE' | 'INACTIVE';
}

interface BookingRulesRow extends QueryResultRow {
  id: string;
  minPartySize: number;
  maxPartySize: number;
  holdMinutes: number;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  autoAssignSmallestTable: boolean;
  allowManualAssignment: boolean;
  requirePhone: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface InventoryMetricsRow extends QueryResultRow {
  tableCount: number;
  activeTableCount: number;
  inventoryCapacity: number;
  maxTableCapacity: number;
}

const EVENT_COLUMNS = `
  e.id,
  e.organization_id AS "organizationId",
  e.location_id AS "locationId",
  e.created_by_user_id AS "createdByUserId",
  e.title,
  e.slug,
  e.description,
  e.timezone,
  e.status,
  e.cover_image_url AS "coverImageUrl",
  e.starts_at AS "startsAt",
  e.ends_at AS "endsAt",
  e.booking_opens_at AS "bookingOpensAt",
  e.booking_closes_at AS "bookingClosesAt",
  e.booking_amount_cents AS "bookingAmountCents",
  e.currency,
  e.capacity,
  e.cancellation_policy AS "cancellationPolicy",
  e.version,
  e.published_at AS "publishedAt",
  e.cancelled_at AS "cancelledAt",
  e.completed_at AS "completedAt",
  e.archived_at AS "archivedAt",
  e.created_at AS "createdAt",
  e.updated_at AS "updatedAt"
`;

@Injectable()
export class EventsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: EventsAccessService,
  ) {}

  async list(auth: AuthContext, query: EventListQueryDto) {
    const access = await this.access.assertLocation(auth, query.locationId);
    const pagination = normalizeEventPagination(query);
    const search = query.q?.trim() || null;

    const [itemsResult, countResult] = await Promise.all([
      this.database.pool.query<EventRow>(
        `
          SELECT ${EVENT_COLUMNS}
          FROM events e
          WHERE e.organization_id = $1
            AND e.location_id = $2
            AND ($3::event_status IS NULL OR e.status = $3)
            AND (
              $4::text IS NULL
              OR e.title ILIKE '%' || $4 || '%'
              OR e.slug ILIKE '%' || $4 || '%'
            )
          ORDER BY e.starts_at DESC, e.created_at DESC
          LIMIT $5 OFFSET $6
        `,
        [
          access.organizationId,
          query.locationId,
          query.status ?? null,
          search,
          pagination.pageSize,
          pagination.offset,
        ],
      ),
      this.database.pool.query<CountRow>(
        `
          SELECT COUNT(*)::int AS count
          FROM events e
          WHERE e.organization_id = $1
            AND e.location_id = $2
            AND ($3::event_status IS NULL OR e.status = $3)
            AND (
              $4::text IS NULL
              OR e.title ILIKE '%' || $4 || '%'
              OR e.slug ILIKE '%' || $4 || '%'
            )
        `,
        [
          access.organizationId,
          query.locationId,
          query.status ?? null,
          search,
        ],
      ),
    ]);

    return {
      items: itemsResult.rows,
      total: countResult.rows[0]?.count ?? 0,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async get(auth: AuthContext, eventId: string) {
    const organizationId = assertOrganizationScope(auth);
    const event = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, event.locationId);

    const [mediaResult, tablesResult, rulesResult] = await Promise.all([
      this.database.pool.query<EventMediaRow>(
        `
          SELECT
            id,
            object_key AS "objectKey",
            public_url AS "publicUrl",
            mime_type AS "mimeType",
            size_bytes AS "sizeBytes",
            width_px AS "widthPx",
            height_px AS "heightPx",
            alt_text AS "altText",
            is_cover AS "isCover",
            sort_order AS "sortOrder"
          FROM event_media
          WHERE organization_id = $1
            AND event_id = $2
          ORDER BY is_cover DESC, sort_order, created_at
        `,
        [organizationId, eventId],
      ),
      this.database.pool.query<EventTableRow>(
        `
          SELECT
            eti.id AS "inventoryId",
            eti.dining_table_id AS "diningTableId",
            eti.capacity_snapshot AS "capacitySnapshot",
            eti.enabled,
            t.code AS "tableCode",
            t.name AS "tableName",
            t.capacity AS "tableCapacity",
            t.status AS "tableStatus",
            a.id AS "areaId",
            a.code AS "areaCode",
            a.name AS "areaName"
          FROM event_table_inventory eti
          JOIN dining_tables t ON t.id = eti.dining_table_id
          JOIN dining_areas a ON a.id = t.area_id
          WHERE eti.organization_id = $1
            AND eti.event_id = $2
          ORDER BY a.sort_order, t.sort_order, t.name
        `,
        [organizationId, eventId],
      ),
      this.database.pool.query<BookingRulesRow>(
        `
          SELECT
            id,
            min_party_size AS "minPartySize",
            max_party_size AS "maxPartySize",
            hold_minutes AS "holdMinutes",
            booking_cutoff_minutes AS "bookingCutoffMinutes",
            cancellation_cutoff_minutes AS "cancellationCutoffMinutes",
            auto_assign_smallest_table AS "autoAssignSmallestTable",
            allow_manual_assignment AS "allowManualAssignment",
            require_phone AS "requirePhone",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM event_booking_rules
          WHERE organization_id = $1
            AND event_id = $2
          LIMIT 1
        `,
        [organizationId, eventId],
      ),
    ]);

    return {
      ...event,
      media: mediaResult.rows,
      tables: tablesResult.rows,
      bookingRules: rulesResult.rows[0] ?? null,
    };
  }

  async create(auth: AuthContext, dto: CreateEventDto) {
    const access = await this.access.assertLocation(auth, dto.locationId);
    const timezone = dto.timezone?.trim() || access.timezone;
    const currency = (dto.currency ?? 'EUR').trim().toUpperCase();
    const slug = normalizeEventSlug(dto.slug ?? dto.title);
    const schedule = {
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      bookingOpensAt: new Date(dto.bookingOpensAt),
      bookingClosesAt: new Date(dto.bookingClosesAt),
      bookingAmountCents: dto.bookingAmountCents,
      capacity: dto.capacity,
      timezone,
      currency,
    };
    const rules = normalizeBookingRules(dto.bookingRules);

    validateEventSchedule(schedule);
    assertRulesFitCapacity(rules, dto.capacity);

    try {
      const eventId = await this.withTransaction(async (client) => {
        const tables = await this.loadTables(
          client,
          access.organizationId,
          dto.locationId,
          dto.tableIds ?? [],
        );

        if (tables.length > 0) {
          const metrics = this.metricsFromTables(tables);
          assertInventoryFitsEvent(dto.capacity, metrics, false);
          assertRulesFitCapacity(
            rules,
            dto.capacity,
            metrics.maxTableCapacity,
          );
        }

        const inserted = await client.query<EventRow>(
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
              cover_image_url,
              starts_at,
              ends_at,
              booking_opens_at,
              booking_closes_at,
              booking_amount_cents,
              currency,
              capacity,
              cancellation_policy
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
            )
            RETURNING
              id,
              organization_id AS "organizationId",
              location_id AS "locationId",
              created_by_user_id AS "createdByUserId",
              title,
              slug,
              description,
              timezone,
              status,
              cover_image_url AS "coverImageUrl",
              starts_at AS "startsAt",
              ends_at AS "endsAt",
              booking_opens_at AS "bookingOpensAt",
              booking_closes_at AS "bookingClosesAt",
              booking_amount_cents AS "bookingAmountCents",
              currency,
              capacity,
              cancellation_policy AS "cancellationPolicy",
              version,
              published_at AS "publishedAt",
              cancelled_at AS "cancelledAt",
              completed_at AS "completedAt",
              archived_at AS "archivedAt",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
          `,
          [
            randomUUID(),
            access.organizationId,
            dto.locationId,
            auth.userId,
            dto.title.trim(),
            slug,
            dto.description.trim(),
            timezone,
            dto.coverImageUrl?.trim() || null,
            schedule.startsAt,
            schedule.endsAt,
            schedule.bookingOpensAt,
            schedule.bookingClosesAt,
            dto.bookingAmountCents,
            currency,
            dto.capacity,
            dto.cancellationPolicy?.trim() || null,
          ],
        );

        const event = inserted.rows[0];

        if (!event) {
          throw new Error('Event insert returned no row.');
        }

        await this.insertBookingRules(
          client,
          access.organizationId,
          dto.locationId,
          event.id,
          rules,
        );
        await this.replaceTableRows(
          client,
          access.organizationId,
          dto.locationId,
          event.id,
          tables,
        );
        await this.recordChange(
          client,
          {
            organizationId: access.organizationId,
            actorUserId: auth.userId,
            action: 'event.created',
            eventId: event.id,
            topic: 'events.event.created',
            payload: {
              eventId: event.id,
              locationId: dto.locationId,
              status: event.status,
              version: event.version,
            },
          },
        );

        return event.id;
      });

      return this.get(auth, eventId);
    } catch (error) {
      this.rethrowEventConstraint(error);
    }
  }

  async update(auth: AuthContext, eventId: string, dto: UpdateEventDto) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, current.locationId);

    try {
      await this.withTransaction(async (client) => {
        const event = await this.lockEvent(client, organizationId, eventId);
        assertEventEditable(event.status);

        const effective = {
          title: dto.title?.trim() ?? event.title,
          slug:
            dto.slug !== undefined
              ? normalizeEventSlug(dto.slug)
              : event.slug,
          description: dto.description?.trim() ?? event.description,
          timezone: dto.timezone?.trim() ?? event.timezone,
          coverImageUrl:
            dto.coverImageUrl !== undefined
              ? dto.coverImageUrl?.trim() || null
              : event.coverImageUrl,
          startsAt:
            dto.startsAt !== undefined
              ? new Date(dto.startsAt)
              : event.startsAt,
          endsAt:
            dto.endsAt !== undefined ? new Date(dto.endsAt) : event.endsAt,
          bookingOpensAt:
            dto.bookingOpensAt !== undefined
              ? new Date(dto.bookingOpensAt)
              : event.bookingOpensAt,
          bookingClosesAt:
            dto.bookingClosesAt !== undefined
              ? new Date(dto.bookingClosesAt)
              : event.bookingClosesAt,
          bookingAmountCents:
            dto.bookingAmountCents ?? event.bookingAmountCents,
          currency: (dto.currency ?? event.currency).trim().toUpperCase(),
          capacity: dto.capacity ?? event.capacity,
          cancellationPolicy:
            dto.cancellationPolicy !== undefined
              ? dto.cancellationPolicy?.trim() || null
              : event.cancellationPolicy,
        };

        validateEventSchedule(effective);

        const [metrics, rules] = await Promise.all([
          this.inventoryMetrics(client, organizationId, eventId),
          this.loadBookingRules(client, organizationId, eventId),
        ]);

        assertInventoryFitsEvent(effective.capacity, metrics, true);

        if (rules) {
          assertRulesFitCapacity(
            rules,
            effective.capacity,
            metrics.tableCount > 0 ? metrics.maxTableCapacity : undefined,
          );
        }

        const result = await client.query<EventRow>(
          `
            UPDATE events
            SET
              title = $3,
              slug = $4,
              description = $5,
              timezone = $6,
              cover_image_url = $7,
              starts_at = $8,
              ends_at = $9,
              booking_opens_at = $10,
              booking_closes_at = $11,
              booking_amount_cents = $12,
              currency = $13,
              capacity = $14,
              cancellation_policy = $15,
              version = version + 1,
              updated_at = NOW()
            WHERE id = $1
              AND organization_id = $2
            RETURNING
              id,
              organization_id AS "organizationId",
              location_id AS "locationId",
              created_by_user_id AS "createdByUserId",
              title,
              slug,
              description,
              timezone,
              status,
              cover_image_url AS "coverImageUrl",
              starts_at AS "startsAt",
              ends_at AS "endsAt",
              booking_opens_at AS "bookingOpensAt",
              booking_closes_at AS "bookingClosesAt",
              booking_amount_cents AS "bookingAmountCents",
              currency,
              capacity,
              cancellation_policy AS "cancellationPolicy",
              version,
              published_at AS "publishedAt",
              cancelled_at AS "cancelledAt",
              completed_at AS "completedAt",
              archived_at AS "archivedAt",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
          `,
          [
            eventId,
            organizationId,
            effective.title,
            effective.slug,
            effective.description,
            effective.timezone,
            effective.coverImageUrl,
            effective.startsAt,
            effective.endsAt,
            effective.bookingOpensAt,
            effective.bookingClosesAt,
            effective.bookingAmountCents,
            effective.currency,
            effective.capacity,
            effective.cancellationPolicy,
          ],
        );

        const updated = result.rows[0];

        if (!updated) {
          throw new Error('Event update returned no row.');
        }

        await this.recordChange(client, {
          organizationId,
          actorUserId: auth.userId,
          action: 'event.updated',
          eventId,
          topic: 'events.event.updated',
          payload: {
            eventId,
            locationId: event.locationId,
            status: updated.status,
            version: updated.version,
          },
        });
      });

      return this.get(auth, eventId);
    } catch (error) {
      this.rethrowEventConstraint(error);
    }
  }

  async replaceTables(
    auth: AuthContext,
    eventId: string,
    dto: ReplaceEventTablesDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, current.locationId);

    await this.withTransaction(async (client) => {
      const event = await this.lockEvent(client, organizationId, eventId);
      assertEventEditable(event.status);

      const tables = await this.loadTables(
        client,
        organizationId,
        event.locationId,
        dto.tableIds,
      );
      const rules = await this.loadBookingRules(
        client,
        organizationId,
        eventId,
      );

      if (tables.length > 0) {
        const metrics = this.metricsFromTables(tables);
        assertInventoryFitsEvent(event.capacity, metrics, false);

        if (rules) {
          assertRulesFitCapacity(
            rules,
            event.capacity,
            metrics.maxTableCapacity,
          );
        }
      }

      await this.replaceTableRows(
        client,
        organizationId,
        event.locationId,
        eventId,
        tables,
      );

      const versionResult = await client.query<{ version: number }>(
        `
          UPDATE events
          SET version = version + 1, updated_at = NOW()
          WHERE id = $1 AND organization_id = $2
          RETURNING version
        `,
        [eventId, organizationId],
      );
      const version = versionResult.rows[0]?.version;

      if (!version) {
        throw new Error('Event table update returned no version.');
      }

      await this.recordChange(client, {
        organizationId,
        actorUserId: auth.userId,
        action: 'event.tables_replaced',
        eventId,
        topic: 'events.event.tables_replaced',
        payload: {
          eventId,
          locationId: event.locationId,
          tableIds: tables.map((table) => table.id),
          version,
        },
      });
    });

    return this.get(auth, eventId);
  }

  async updateBookingRules(
    auth: AuthContext,
    eventId: string,
    dto: EventBookingRulesDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, current.locationId);
    const rules = normalizeBookingRules(dto);

    await this.withTransaction(async (client) => {
      const event = await this.lockEvent(client, organizationId, eventId);
      assertEventEditable(event.status);
      const metrics = await this.inventoryMetrics(
        client,
        organizationId,
        eventId,
      );

      assertRulesFitCapacity(
        rules,
        event.capacity,
        metrics.tableCount > 0 ? metrics.maxTableCapacity : undefined,
      );

      await this.insertBookingRules(
        client,
        organizationId,
        event.locationId,
        eventId,
        rules,
      );

      const versionResult = await client.query<{ version: number }>(
        `
          UPDATE events
          SET version = version + 1, updated_at = NOW()
          WHERE id = $1 AND organization_id = $2
          RETURNING version
        `,
        [eventId, organizationId],
      );
      const version = versionResult.rows[0]?.version;

      if (!version) {
        throw new Error('Event rules update returned no version.');
      }

      await this.recordChange(client, {
        organizationId,
        actorUserId: auth.userId,
        action: 'event.booking_rules_updated',
        eventId,
        topic: 'events.event.booking_rules_updated',
        payload: {
          eventId,
          locationId: event.locationId,
          version,
        },
      });
    });

    return this.get(auth, eventId);
  }

  async publish(auth: AuthContext, eventId: string) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, current.locationId);

    await this.withTransaction(async (client) => {
      const event = await this.lockEvent(client, organizationId, eventId);
      const [metrics, rules] = await Promise.all([
        this.inventoryMetrics(client, organizationId, eventId),
        this.loadBookingRules(client, organizationId, eventId),
      ]);

      assertEventPublishable(event, metrics, rules);

      const result = await client.query<EventRow>(
        `
          UPDATE events
          SET
            status = 'PUBLISHED',
            published_at = NOW(),
            version = version + 1,
            updated_at = NOW()
          WHERE id = $1
            AND organization_id = $2
          RETURNING
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            created_by_user_id AS "createdByUserId",
            title,
            slug,
            description,
            timezone,
            status,
            cover_image_url AS "coverImageUrl",
            starts_at AS "startsAt",
            ends_at AS "endsAt",
            booking_opens_at AS "bookingOpensAt",
            booking_closes_at AS "bookingClosesAt",
            booking_amount_cents AS "bookingAmountCents",
            currency,
            capacity,
            cancellation_policy AS "cancellationPolicy",
            version,
            published_at AS "publishedAt",
            cancelled_at AS "cancelledAt",
            completed_at AS "completedAt",
            archived_at AS "archivedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [eventId, organizationId],
      );
      const published = result.rows[0];

      if (!published) {
        throw new Error('Event publish returned no row.');
      }

      await this.recordChange(client, {
        organizationId,
        actorUserId: auth.userId,
        action: 'event.published',
        eventId,
        topic: 'events.event.published',
        payload: {
          eventId,
          locationId: event.locationId,
          slug: published.slug,
          status: published.status,
          version: published.version,
        },
      });
    });

    return this.get(auth, eventId);
  }

  async cancel(auth: AuthContext, eventId: string, dto: CancelEventDto) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, current.locationId);

    await this.withTransaction(async (client) => {
      const event = await this.lockEvent(client, organizationId, eventId);
      assertEventCancellable(event.status);

      const result = await client.query<EventRow>(
        `
          UPDATE events
          SET
            status = 'CANCELLED',
            cancelled_at = NOW(),
            version = version + 1,
            updated_at = NOW()
          WHERE id = $1
            AND organization_id = $2
          RETURNING
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            created_by_user_id AS "createdByUserId",
            title,
            slug,
            description,
            timezone,
            status,
            cover_image_url AS "coverImageUrl",
            starts_at AS "startsAt",
            ends_at AS "endsAt",
            booking_opens_at AS "bookingOpensAt",
            booking_closes_at AS "bookingClosesAt",
            booking_amount_cents AS "bookingAmountCents",
            currency,
            capacity,
            cancellation_policy AS "cancellationPolicy",
            version,
            published_at AS "publishedAt",
            cancelled_at AS "cancelledAt",
            completed_at AS "completedAt",
            archived_at AS "archivedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [eventId, organizationId],
      );
      const cancelled = result.rows[0];

      if (!cancelled) {
        throw new Error('Event cancellation returned no row.');
      }

      await this.recordChange(client, {
        organizationId,
        actorUserId: auth.userId,
        action: 'event.cancelled',
        eventId,
        topic: 'events.event.cancelled',
        payload: {
          eventId,
          locationId: event.locationId,
          reason: dto.reason.trim(),
          status: cancelled.status,
          version: cancelled.version,
        },
      });
    });

    return this.get(auth, eventId);
  }

  async archive(auth: AuthContext, eventId: string) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, current.locationId);

    await this.withTransaction(async (client) => {
      const event = await this.lockEvent(client, organizationId, eventId);
      assertEventArchivable(event.status);

      const result = await client.query<EventRow>(
        `
          UPDATE events
          SET
            status = 'ARCHIVED',
            archived_at = NOW(),
            version = version + 1,
            updated_at = NOW()
          WHERE id = $1
            AND organization_id = $2
          RETURNING
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            created_by_user_id AS "createdByUserId",
            title,
            slug,
            description,
            timezone,
            status,
            cover_image_url AS "coverImageUrl",
            starts_at AS "startsAt",
            ends_at AS "endsAt",
            booking_opens_at AS "bookingOpensAt",
            booking_closes_at AS "bookingClosesAt",
            booking_amount_cents AS "bookingAmountCents",
            currency,
            capacity,
            cancellation_policy AS "cancellationPolicy",
            version,
            published_at AS "publishedAt",
            cancelled_at AS "cancelledAt",
            completed_at AS "completedAt",
            archived_at AS "archivedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [eventId, organizationId],
      );
      const archived = result.rows[0];

      if (!archived) {
        throw new Error('Event archival returned no row.');
      }

      await this.recordChange(client, {
        organizationId,
        actorUserId: auth.userId,
        action: 'event.archived',
        eventId,
        topic: 'events.event.archived',
        payload: {
          eventId,
          locationId: event.locationId,
          status: archived.status,
          version: archived.version,
        },
      });
    });

    return this.get(auth, eventId);
  }

  private async requireEvent(
    organizationId: string,
    eventId: string,
  ): Promise<EventRow> {
    const result = await this.database.pool.query<EventRow>(
      `
        SELECT ${EVENT_COLUMNS}
        FROM events e
        WHERE e.id = $1
          AND e.organization_id = $2
        LIMIT 1
      `,
      [eventId, organizationId],
    );
    const event = result.rows[0];

    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Evento non trovato.',
      });
    }

    return event;
  }

  private async lockEvent(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<EventRow> {
    const result = await client.query<EventRow>(
      `
        SELECT ${EVENT_COLUMNS}
        FROM events e
        WHERE e.id = $1
          AND e.organization_id = $2
        FOR UPDATE
      `,
      [eventId, organizationId],
    );
    const event = result.rows[0];

    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Evento non trovato.',
      });
    }

    return event;
  }

  private async loadTables(
    client: PoolClient,
    organizationId: string,
    locationId: string,
    tableIds: string[],
  ): Promise<DiningTableRow[]> {
    if (tableIds.length === 0) {
      return [];
    }

    const uniqueIds = Array.from(new Set(tableIds));
    const result = await client.query<DiningTableRow>(
      `
        SELECT id, capacity, status
        FROM dining_tables
        WHERE organization_id = $1
          AND location_id = $2
          AND id = ANY($3::uuid[])
        FOR SHARE
      `,
      [organizationId, locationId, uniqueIds],
    );

    if (result.rows.length !== uniqueIds.length) {
      throw new NotFoundException({
        code: 'EVENT_TABLE_NOT_FOUND',
        message:
          'Uno o più tavoli non appartengono al punto vendita selezionato.',
      });
    }

    const inactive = result.rows.find((table) => table.status !== 'ACTIVE');

    if (inactive) {
      throw new ConflictException({
        code: 'EVENT_TABLE_INACTIVE',
        message: 'Uno o più tavoli selezionati non sono attivi.',
      });
    }

    return result.rows;
  }

  private metricsFromTables(tables: DiningTableRow[]): InventoryMetrics {
    return {
      tableCount: tables.length,
      activeTableCount: tables.filter((table) => table.status === 'ACTIVE')
        .length,
      inventoryCapacity: tables.reduce(
        (total, table) => total + table.capacity,
        0,
      ),
      maxTableCapacity: tables.reduce(
        (maximum, table) => Math.max(maximum, table.capacity),
        0,
      ),
    };
  }

  private async inventoryMetrics(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<InventoryMetrics> {
    const result = await client.query<InventoryMetricsRow>(
      `
        SELECT
          COUNT(*)::int AS "tableCount",
          COUNT(*) FILTER (WHERE t.status = 'ACTIVE')::int AS "activeTableCount",
          COALESCE(SUM(eti.capacity_snapshot), 0)::int AS "inventoryCapacity",
          COALESCE(MAX(eti.capacity_snapshot), 0)::int AS "maxTableCapacity"
        FROM event_table_inventory eti
        JOIN dining_tables t ON t.id = eti.dining_table_id
        WHERE eti.organization_id = $1
          AND eti.event_id = $2
          AND eti.enabled = TRUE
      `,
      [organizationId, eventId],
    );

    return (
      result.rows[0] ?? {
        tableCount: 0,
        activeTableCount: 0,
        inventoryCapacity: 0,
        maxTableCapacity: 0,
      }
    );
  }

  private async replaceTableRows(
    client: PoolClient,
    organizationId: string,
    locationId: string,
    eventId: string,
    tables: DiningTableRow[],
  ): Promise<void> {
    await client.query(
      `
        DELETE FROM event_table_inventory
        WHERE organization_id = $1
          AND event_id = $2
      `,
      [organizationId, eventId],
    );

    for (const table of tables) {
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
          VALUES ($1,$2,$3,$4,$5,$6,TRUE)
        `,
        [
          randomUUID(),
          organizationId,
          locationId,
          eventId,
          table.id,
          table.capacity,
        ],
      );
    }
  }

  private async insertBookingRules(
    client: PoolClient,
    organizationId: string,
    locationId: string,
    eventId: string,
    rules: NormalizedBookingRules,
  ): Promise<void> {
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
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (event_id)
        DO UPDATE SET
          min_party_size = EXCLUDED.min_party_size,
          max_party_size = EXCLUDED.max_party_size,
          hold_minutes = EXCLUDED.hold_minutes,
          booking_cutoff_minutes = EXCLUDED.booking_cutoff_minutes,
          cancellation_cutoff_minutes = EXCLUDED.cancellation_cutoff_minutes,
          auto_assign_smallest_table = EXCLUDED.auto_assign_smallest_table,
          allow_manual_assignment = EXCLUDED.allow_manual_assignment,
          require_phone = EXCLUDED.require_phone,
          updated_at = NOW()
      `,
      [
        randomUUID(),
        organizationId,
        locationId,
        eventId,
        rules.minPartySize,
        rules.maxPartySize,
        rules.holdMinutes,
        rules.bookingCutoffMinutes,
        rules.cancellationCutoffMinutes,
        rules.autoAssignSmallestTable,
        rules.allowManualAssignment,
        rules.requirePhone,
      ],
    );
  }

  private async loadBookingRules(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<NormalizedBookingRules | null> {
    const result = await client.query<BookingRulesRow>(
      `
        SELECT
          id,
          min_party_size AS "minPartySize",
          max_party_size AS "maxPartySize",
          hold_minutes AS "holdMinutes",
          booking_cutoff_minutes AS "bookingCutoffMinutes",
          cancellation_cutoff_minutes AS "cancellationCutoffMinutes",
          auto_assign_smallest_table AS "autoAssignSmallestTable",
          allow_manual_assignment AS "allowManualAssignment",
          require_phone AS "requirePhone",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM event_booking_rules
        WHERE organization_id = $1
          AND event_id = $2
        LIMIT 1
      `,
      [organizationId, eventId],
    );
    const row = result.rows[0];

    if (!row) return null;

    return {
      minPartySize: row.minPartySize,
      maxPartySize: row.maxPartySize,
      holdMinutes: row.holdMinutes,
      bookingCutoffMinutes: row.bookingCutoffMinutes,
      cancellationCutoffMinutes: row.cancellationCutoffMinutes,
      autoAssignSmallestTable: row.autoAssignSmallestTable,
      allowManualAssignment: row.allowManualAssignment,
      requirePhone: row.requirePhone,
    };
  }

  private async recordChange(
    client: PoolClient,
    input: {
      organizationId: string;
      actorUserId: string;
      action: string;
      eventId: string;
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
        VALUES ($1,$2,$3,$4,'event',$5,$6::jsonb)
      `,
      [
        randomUUID(),
        input.organizationId,
        input.actorUserId,
        input.action,
        input.eventId,
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
        VALUES ($1,$2,'event',$3,$4::jsonb)
      `,
      [
        randomUUID(),
        input.topic,
        input.eventId,
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

  private rethrowEventConstraint(error: unknown): never {
    if (this.isUniqueViolation(error)) {
      throw new ConflictException({
        code: 'EVENT_SLUG_ALREADY_EXISTS',
        message: 'Lo slug dell’evento è già utilizzato.',
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
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\events\events.service.ts') `
    -Content $content_apps_api_src_events_events_service_ts `
    -DryRun:$DryRun

$content_scripts_verify_phase_3_events_mjs = @'
// PHASE_3_EVENTS_MODULE
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const requiredFiles = [
  'apps/api/src/events/events.module.ts',
  'apps/api/src/events/events.controller.ts',
  'apps/api/src/events/events.service.ts',
  'apps/api/src/events/events-access.service.ts',
  'apps/api/src/events/event-policy.ts',
  'apps/api/src/events/event-policy.spec.ts',
  'apps/api/src/events/dto/create-event.dto.ts',
  'apps/api/src/events/dto/update-event.dto.ts',
  'apps/api/src/events/dto/event-booking-rules.dto.ts',
  'apps/api/src/events/dto/event-list-query.dto.ts',
  'apps/api/src/events/dto/replace-event-tables.dto.ts',
  'apps/api/src/events/dto/cancel-event.dto.ts',
];

for (const relativePath of requiredFiles) {
  await stat(path.join(root, relativePath));
}

const [appModule, controller, service, schema] = await Promise.all([
  readFile(path.join(root, 'apps/api/src/app.module.ts'), 'utf8'),
  readFile(path.join(root, 'apps/api/src/events/events.controller.ts'), 'utf8'),
  readFile(path.join(root, 'apps/api/src/events/events.service.ts'), 'utf8'),
  readFile(path.join(root, 'libs/database/src/schema.ts'), 'utf8'),
]);

const requiredAppModuleFragments = [
  "import { EventsModule } from './events/events.module';",
  'EventsModule,',
];

const requiredRoutes = [
  "@Controller('events')",
  "@Post(':eventId/publish')",
  "@Post(':eventId/cancel')",
  "@Put(':eventId/tables')",
  "@Put(':eventId/booking-rules')",
  "@Delete(':eventId')",
];

const requiredTopics = [
  'events.event.created',
  'events.event.updated',
  'events.event.tables_replaced',
  'events.event.booking_rules_updated',
  'events.event.published',
  'events.event.cancelled',
  'events.event.archived',
];

const missing = [
  ...requiredAppModuleFragments.filter((value) => !appModule.includes(value)),
  ...requiredRoutes.filter((value) => !controller.includes(value)),
  ...requiredTopics.filter((value) => !service.includes(value)),
];

const schemaMarkers = [
  'PHASE_2_EVENTS_RESERVATIONS_ENUMS_START',
  'PHASE_2_EVENTS_RESERVATIONS_TABLES_START',
  'PHASE_2_EVENTS_RESERVATIONS_TYPES_START',
];

missing.push(...schemaMarkers.filter((value) => !schema.includes(value)));

if (!service.includes('INSERT INTO audit_events')) {
  missing.push('audit_events insert');
}

if (!service.includes('INSERT INTO outbox_events')) {
  missing.push('outbox_events insert');
}

if (!service.includes('FOR UPDATE')) {
  missing.push('event row locking');
}

if (missing.length > 0) {
  console.error('Verifica Fase 03 fallita.');
  console.error(`Elementi mancanti: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`File verificati: ${requiredFiles.length}`);
console.log(`Route di gestione verificate: ${requiredRoutes.length}`);
console.log(`Topic outbox verificati: ${requiredTopics.length}`);
console.log('Audit e locking transazionale: presenti');
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'scripts\verify-phase-3-events.mjs') `
    -Content $content_scripts_verify_phase_3_events_mjs `
    -DryRun:$DryRun

$content_docs_phase_2_events_backend_md = @'
# Fluxa Phase 2 — Backend Events

## Modulo

La Fase 03 aggiunge `EventsModule` all’API NestJS esistente.

Il modulo utilizza:

- lo stesso `DatabaseService`;
- lo stesso PostgreSQL;
- lo stesso sistema JWT e tenant context;
- gli stessi utenti, organizzazioni, sedi e tavoli;
- `audit_events` e `outbox_events` già presenti.

## Endpoint autenticati

```text
GET    /api/v1/events
GET    /api/v1/events/:eventId
POST   /api/v1/events
PATCH  /api/v1/events/:eventId
PUT    /api/v1/events/:eventId/tables
PUT    /api/v1/events/:eventId/booking-rules
POST   /api/v1/events/:eventId/publish
POST   /api/v1/events/:eventId/cancel
DELETE /api/v1/events/:eventId
```

Le mutazioni richiedono ruolo `OWNER`, `ADMIN` o `MANAGER`.

## Regole di dominio

Un evento nasce in `DRAFT`.

Soltanto una bozza può cambiare:

- informazioni;
- date;
- prezzo di prenotazione;
- capacità;
- tavoli;
- regole di prenotazione.

La pubblicazione richiede:

- inizio e chiusura prenotazioni nel futuro;
- almeno un tavolo attivo;
- capacità totale dei tavoli sufficiente;
- regole di prenotazione configurate;
- numero massimo di coperti compatibile con il tavolo più grande.

## Concorrenza

Le transizioni di stato e le configurazioni vengono eseguite dentro una
transazione PostgreSQL.

La riga dell’evento viene acquisita con `FOR UPDATE`, evitando due mutazioni
concorrenti sullo stesso aggregato.

## Audit e outbox

Ogni mutazione inserisce, nella stessa transazione:

- un record in `audit_events`;
- un record in `outbox_events`.

La pubblicazione dell’outbox verso web e POS verrà implementata nella fase
realtime.

## Confini

Questa fase non aggiunge:

- endpoint pubblici anonimi;
- creazione delle prenotazioni;
- pagamento online;
- upload binario delle immagini;
- websocket o SSE;
- applicazione automatica della migrazione.
'@
Write-GeneratedFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'docs\phase-2\events-backend.md') `
    -Content $content_docs_phase_2_events_backend_md `
    -DryRun:$DryRun

Add-EventsModuleToApp `
    -Path $appModulePath `
    -DryRun:$DryRun

if ($DryRun) {
    Write-Step -Message 'DryRun Fase 03 completato'

    Write-Host @"
Verrebbero aggiunti:

- EventsModule;
- CRUD autenticato;
- configurazione tavoli e regole;
- pubblicazione, annullamento e archiviazione;
- audit e outbox transazionali;
- test delle policy;
- documentazione e verifica strutturale.
"@

    return
}

Write-Step -Message 'Formattazione Fase 03'

Invoke-Checked `
    -FilePath $npxCommand `
    -ArgumentList @(
        'prettier',
        '--write',
        'apps/api/src/app.module.ts',
        'apps/api/src/events/**/*.ts',
        'scripts/verify-phase-3-events.mjs',
        'docs/phase-2/events-backend.md'
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Verifica strutturale Fase 03'

Invoke-Checked `
    -FilePath 'node' `
    -ArgumentList @('scripts/verify-phase-3-events.mjs') `
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

    Write-Step -Message 'Test policy Events'

    Invoke-Checked `
        -FilePath $npxCommand `
        -ArgumentList @(
            'jest',
            '--runInBand',
            '--runTestsByPath',
            'apps/api/src/events/event-policy.spec.ts',
            '--roots',
            'apps/api/src/events'
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

Write-Step -Message 'Fase 03 completata'

Write-Host @"
Modulo backend Events creato.

La migrazione 0009 non è stata applicata al database.

Controlli finali:

git status --short
git diff --check
git diff --stat
"@
