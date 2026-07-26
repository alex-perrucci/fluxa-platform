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

    $trackedChanges = @(
        Invoke-Checked `
            -FilePath 'git' `
            -ArgumentList @('status', '--short', '--untracked-files=no') `
            -WorkingDirectory $RepositoryRoot
    )

    if ($trackedChanges.Count -gt 0) {
        $details = $trackedChanges -join [Environment]::NewLine

        throw @"
Sono presenti modifiche tracciate non salvate:

$details

Esegui commit o stash prima della Fase 02.
"@
    }
}

function Insert-BeforeAnchor {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Source,

        [Parameter(Mandatory)]
        [string] $Anchor,

        [Parameter(Mandatory)]
        [string] $Block,

        [Parameter(Mandatory)]
        [string] $Marker
    )

    if ($Source.Contains($Marker)) {
        return $Source
    }

    $index = $Source.IndexOf($Anchor, [StringComparison]::Ordinal)

    if ($index -lt 0) {
        throw "Anchor non trovato nello schema: $Anchor"
    }

    return $Source.Insert($index, $Block.TrimEnd() + "`n`n")
}

function Get-PhaseMigration {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $DrizzleDirectory
    )

    $matches = @(
        Get-ChildItem -LiteralPath $DrizzleDirectory -Filter '*.sql' -File |
            Where-Object {
                $content = [System.IO.File]::ReadAllText($_.FullName)

                return (
                    $content.Contains('CREATE TABLE "events"') -and
                    $content.Contains('CREATE TABLE "platform_fee_ledger"') -and
                    $content.Contains('CREATE TABLE "reservation_status_history"')
                )
            }
    )

    if ($matches.Count -gt 1) {
        $details = @($matches | ForEach-Object { $_.FullName }) -join [Environment]::NewLine
        throw "Più migrazioni Phase 2 rilevate:`n$details"
    }

    if ($matches.Count -eq 1) {
        return $matches[0]
    }

    return $null
}

$repositoryRoot = Get-RepositoryRoot
$schemaPath = Join-Path -Path $repositoryRoot -ChildPath 'libs/database/src/schema.ts'
$testPath = Join-Path -Path $repositoryRoot -ChildPath 'libs/database/src/schema.phase-2.spec.ts'
$verifyScriptPath = Join-Path -Path $repositoryRoot -ChildPath 'scripts/verify-phase-2-schema.mjs'
$documentationPath = Join-Path -Path $repositoryRoot -ChildPath 'docs/phase-2/reservations-schema.md'
$phaseOneMarker = Join-Path -Path $repositoryRoot -ChildPath 'apps/web/.fluxa-phase-2-scaffold'
$drizzleDirectory = Join-Path -Path $repositoryRoot -ChildPath 'drizzle'

Write-Step -Message 'Preflight Fase 02'

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
    throw @"
La Fase 02 non può essere eseguita direttamente su main.

Passa al branch della Fase 2 prima di proseguire.
"@
}

if (-not (Test-Path -LiteralPath $phaseOneMarker)) {
    throw "Marker Fase 01 non trovato: $phaseOneMarker"
}

Write-Step -Message 'Aggiornamento dello schema Drizzle'

$schema = [System.IO.File]::ReadAllText($schemaPath).Replace("`r`n", "`n")

if (-not $schema.Contains("import { sql } from 'drizzle-orm';")) {
    $importAnchor = "import {`n  type AnyPgColumn,"

    if (-not $schema.Contains($importAnchor)) {
        throw 'Import Drizzle principale non riconosciuto.'
    }

    $schema = $schema.Replace(
        $importAnchor,
        "import { sql } from 'drizzle-orm';`n$importAnchor"
    )
}

if (-not $schema.Contains("  check,`n")) {
    $booleanImport = "  boolean,`n"

    if (-not $schema.Contains($booleanImport)) {
        throw 'Import boolean di drizzle-orm/pg-core non riconosciuto.'
    }

    $schema = $schema.Replace(
        $booleanImport,
        "  boolean,`n  check,`n"
    )
}

$enumBlock = @'
// PHASE_2_EVENTS_RESERVATIONS_ENUMS_START
export const eventStatus = pgEnum('event_status', [
  'DRAFT',
  'PUBLISHED',
  'SOLD_OUT',
  'CANCELLED',
  'COMPLETED',
  'ARCHIVED',
]);

export const reservationStatus = pgEnum('reservation_status', [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_SHOW',
  'REFUND_PENDING',
  'REFUNDED',
]);

export const reservationHoldStatus = pgEnum('reservation_hold_status', [
  'ACTIVE',
  'CONVERTED',
  'EXPIRED',
  'CANCELLED',
]);

export const reservationAssignmentStatus = pgEnum(
  'reservation_assignment_status',
  ['ACTIVE', 'RELEASED'],
);

export const reservationPaymentStatus = pgEnum(
  'reservation_payment_status',
  [
    'CREATED',
    'REQUIRES_ACTION',
    'PAID',
    'FAILED',
    'CANCELLED',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
  ],
);

export const platformFeeRuleScope = pgEnum('platform_fee_rule_scope', [
  'GLOBAL',
  'ORGANIZATION',
  'EVENT',
]);

export const platformFeeLedgerEntryType = pgEnum(
  'platform_fee_ledger_entry_type',
  ['CHARGE', 'REFUND', 'ADJUSTMENT'],
);
// PHASE_2_EVENTS_RESERVATIONS_ENUMS_END
'@

$tablesBlock = @'
// PHASE_2_EVENTS_RESERVATIONS_TABLES_START
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 220 }).notNull(),
    slug: varchar('slug', { length: 180 }).notNull(),
    description: text('description').notNull(),
    timezone: varchar('timezone', { length: 80 })
      .notNull()
      .default('Europe/Rome'),
    status: eventStatus('status').notNull().default('DRAFT'),
    coverImageUrl: varchar('cover_image_url', { length: 1000 }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    bookingOpensAt: timestamp('booking_opens_at', {
      withTimezone: true,
    }).notNull(),
    bookingClosesAt: timestamp('booking_closes_at', {
      withTimezone: true,
    }).notNull(),
    bookingAmountCents: integer('booking_amount_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    capacity: integer('capacity').notNull(),
    cancellationPolicy: text('cancellation_policy'),
    version: integer('version').notNull().default(1),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('events_slug_uq').on(table.slug),
    index('events_org_location_status_start_idx').on(
      table.organizationId,
      table.locationId,
      table.status,
      table.startsAt,
    ),
    index('events_public_status_booking_idx').on(
      table.status,
      table.bookingOpensAt,
      table.bookingClosesAt,
    ),
    check('events_time_window_ck', sql`${table.endsAt} > ${table.startsAt}`),
    check(
      'events_booking_window_ck',
      sql`${table.bookingOpensAt} < ${table.bookingClosesAt}`,
    ),
    check(
      'events_booking_before_start_ck',
      sql`${table.bookingClosesAt} <= ${table.startsAt}`,
    ),
    check(
      'events_booking_amount_nonnegative_ck',
      sql`${table.bookingAmountCents} >= 0`,
    ),
    check('events_capacity_positive_ck', sql`${table.capacity} > 0`),
    check('events_version_positive_ck', sql`${table.version} > 0`),
  ],
);

export const eventMedia = pgTable(
  'event_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    objectKey: varchar('object_key', { length: 1000 }).notNull(),
    publicUrl: varchar('public_url', { length: 1000 }),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    widthPx: integer('width_px'),
    heightPx: integer('height_px'),
    altText: varchar('alt_text', { length: 300 }),
    isCover: boolean('is_cover').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('event_media_event_object_key_uq').on(
      table.eventId,
      table.objectKey,
    ),
    index('event_media_event_cover_sort_idx').on(
      table.eventId,
      table.isCover,
      table.sortOrder,
    ),
    check('event_media_size_positive_ck', sql`${table.sizeBytes} > 0`),
    check('event_media_sort_nonnegative_ck', sql`${table.sortOrder} >= 0`),
    check(
      'event_media_width_positive_ck',
      sql`${table.widthPx} is null or ${table.widthPx} > 0`,
    ),
    check(
      'event_media_height_positive_ck',
      sql`${table.heightPx} is null or ${table.heightPx} > 0`,
    ),
  ],
);

export const eventTableInventory = pgTable(
  'event_table_inventory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    diningTableId: uuid('dining_table_id')
      .notNull()
      .references(() => diningTables.id, { onDelete: 'restrict' }),
    capacitySnapshot: integer('capacity_snapshot').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('event_table_inventory_event_table_uq').on(
      table.eventId,
      table.diningTableId,
    ),
    index('event_table_inventory_event_enabled_capacity_idx').on(
      table.eventId,
      table.enabled,
      table.capacitySnapshot,
    ),
    index('event_table_inventory_org_location_idx').on(
      table.organizationId,
      table.locationId,
    ),
    check(
      'event_table_inventory_capacity_positive_ck',
      sql`${table.capacitySnapshot} > 0`,
    ),
  ],
);

export const eventBookingRules = pgTable(
  'event_booking_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    minPartySize: integer('min_party_size').notNull().default(1),
    maxPartySize: integer('max_party_size').notNull(),
    holdMinutes: integer('hold_minutes').notNull().default(15),
    bookingCutoffMinutes: integer('booking_cutoff_minutes')
      .notNull()
      .default(0),
    cancellationCutoffMinutes: integer('cancellation_cutoff_minutes')
      .notNull()
      .default(0),
    autoAssignSmallestTable: boolean('auto_assign_smallest_table')
      .notNull()
      .default(true),
    allowManualAssignment: boolean('allow_manual_assignment')
      .notNull()
      .default(true),
    requirePhone: boolean('require_phone').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('event_booking_rules_event_uq').on(table.eventId),
    index('event_booking_rules_org_location_idx').on(
      table.organizationId,
      table.locationId,
    ),
    check(
      'event_booking_rules_party_range_ck',
      sql`${table.minPartySize} > 0 and ${table.maxPartySize} >= ${table.minPartySize}`,
    ),
    check(
      'event_booking_rules_hold_minutes_ck',
      sql`${table.holdMinutes} between 1 and 120`,
    ),
    check(
      'event_booking_rules_booking_cutoff_ck',
      sql`${table.bookingCutoffMinutes} >= 0`,
    ),
    check(
      'event_booking_rules_cancellation_cutoff_ck',
      sql`${table.cancellationCutoffMinutes} >= 0`,
    ),
  ],
);

export const platformFeeRules = pgTable(
  'platform_fee_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: platformFeeRuleScope('scope').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    eventId: uuid('event_id').references(() => events.id, {
      onDelete: 'cascade',
    }),
    basisPoints: integer('basis_points').notNull(),
    active: boolean('active').notNull().default(true),
    effectiveFrom: timestamp('effective_from', { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('platform_fee_rules_resolution_idx').on(
      table.scope,
      table.organizationId,
      table.eventId,
      table.active,
      table.effectiveFrom,
    ),
    check(
      'platform_fee_rules_basis_points_ck',
      sql`${table.basisPoints} between 0 and 10000`,
    ),
    check(
      'platform_fee_rules_effective_window_ck',
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    check(
      'platform_fee_rules_scope_ck',
      sql`(
        (${table.scope} = 'GLOBAL' and ${table.organizationId} is null and ${table.eventId} is null)
        or
        (${table.scope} = 'ORGANIZATION' and ${table.organizationId} is not null and ${table.eventId} is null)
        or
        (${table.scope} = 'EVENT' and ${table.organizationId} is not null and ${table.eventId} is not null)
      )`,
    ),
  ],
);

export const reservationHolds = pgTable(
  'reservation_holds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    feeRuleId: uuid('fee_rule_id').references(() => platformFeeRules.id, {
      onDelete: 'set null',
    }),
    publicTokenHash: char('public_token_hash', { length: 64 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    status: reservationHoldStatus('status').notNull().default('ACTIVE'),
    partySize: integer('party_size').notNull(),
    amountCents: integer('amount_cents').notNull(),
    platformFeeBasisPoints: integer('platform_fee_basis_points').notNull(),
    platformFeeCents: integer('platform_fee_cents').notNull(),
    merchantGrossCents: integer('merchant_gross_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    version: integer('version').notNull().default(1),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('reservation_holds_public_token_hash_uq').on(
      table.publicTokenHash,
    ),
    uniqueIndex('reservation_holds_event_idempotency_uq').on(
      table.organizationId,
      table.eventId,
      table.idempotencyKey,
    ),
    index('reservation_holds_expiry_idx').on(table.status, table.expiresAt),
    index('reservation_holds_org_location_event_idx').on(
      table.organizationId,
      table.locationId,
      table.eventId,
      table.createdAt,
    ),
    check('reservation_holds_party_positive_ck', sql`${table.partySize} > 0`),
    check(
      'reservation_holds_amount_nonnegative_ck',
      sql`${table.amountCents} >= 0`,
    ),
    check(
      'reservation_holds_fee_basis_points_ck',
      sql`${table.platformFeeBasisPoints} between 0 and 10000`,
    ),
    check(
      'reservation_holds_fee_nonnegative_ck',
      sql`${table.platformFeeCents} >= 0`,
    ),
    check(
      'reservation_holds_merchant_gross_ck',
      sql`${table.merchantGrossCents} = ${table.amountCents} - ${table.platformFeeCents}`,
    ),
    check(
      'reservation_holds_expiry_after_creation_ck',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check('reservation_holds_version_positive_ck', sql`${table.version} > 0`),
  ],
);

export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    holdId: uuid('hold_id').references(() => reservationHolds.id, {
      onDelete: 'set null',
    }),
    feeRuleId: uuid('fee_rule_id').references(() => platformFeeRules.id, {
      onDelete: 'set null',
    }),
    tableSessionId: uuid('table_session_id').references(() => tableSessions.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    publicTokenHash: char('public_token_hash', { length: 64 }).notNull(),
    confirmationCode: varchar('confirmation_code', { length: 24 }).notNull(),
    status: reservationStatus('status').notNull().default('PENDING_PAYMENT'),
    customerName: varchar('customer_name', { length: 180 }).notNull(),
    customerEmail: varchar('customer_email', { length: 320 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 40 }),
    customerNote: varchar('customer_note', { length: 1000 }),
    partySize: integer('party_size').notNull(),
    amountCents: integer('amount_cents').notNull(),
    platformFeeBasisPoints: integer('platform_fee_basis_points').notNull(),
    platformFeeCents: integer('platform_fee_cents').notNull(),
    merchantGrossCents: integer('merchant_gross_cents').notNull(),
    providerFeeCents: integer('provider_fee_cents').notNull().default(0),
    merchantNetCents: integer('merchant_net_cents').notNull(),
    refundedCents: integer('refunded_cents').notNull().default(0),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    version: integer('version').notNull().default(1),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    seatedAt: timestamp('seated_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    noShowAt: timestamp('no_show_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('reservations_hold_uq').on(table.holdId),
    uniqueIndex('reservations_public_token_hash_uq').on(table.publicTokenHash),
    uniqueIndex('reservations_confirmation_code_uq').on(
      table.confirmationCode,
    ),
    uniqueIndex('reservations_table_session_uq').on(table.tableSessionId),
    index('reservations_org_location_event_status_idx').on(
      table.organizationId,
      table.locationId,
      table.eventId,
      table.status,
      table.createdAt,
    ),
    index('reservations_customer_email_idx').on(
      table.organizationId,
      table.customerEmail,
      table.createdAt,
    ),
    check('reservations_party_positive_ck', sql`${table.partySize} > 0`),
    check(
      'reservations_amount_nonnegative_ck',
      sql`${table.amountCents} >= 0`,
    ),
    check(
      'reservations_fee_basis_points_ck',
      sql`${table.platformFeeBasisPoints} between 0 and 10000`,
    ),
    check(
      'reservations_fee_nonnegative_ck',
      sql`${table.platformFeeCents} >= 0`,
    ),
    check(
      'reservations_merchant_gross_ck',
      sql`${table.merchantGrossCents} = ${table.amountCents} - ${table.platformFeeCents}`,
    ),
    check(
      'reservations_provider_fee_nonnegative_ck',
      sql`${table.providerFeeCents} >= 0`,
    ),
    check(
      'reservations_merchant_net_ck',
      sql`${table.merchantNetCents} = ${table.merchantGrossCents} - ${table.providerFeeCents}`,
    ),
    check(
      'reservations_refunded_range_ck',
      sql`${table.refundedCents} between 0 and ${table.amountCents}`,
    ),
    check('reservations_version_positive_ck', sql`${table.version} > 0`),
  ],
);

export const reservationTableAssignments = pgTable(
  'reservation_table_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    diningTableId: uuid('dining_table_id')
      .notNull()
      .references(() => diningTables.id, { onDelete: 'restrict' }),
    holdId: uuid('hold_id').references(() => reservationHolds.id, {
      onDelete: 'cascade',
    }),
    reservationId: uuid('reservation_id').references(() => reservations.id, {
      onDelete: 'cascade',
    }),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: reservationAssignmentStatus('status').notNull().default('ACTIVE'),
    activeEventTableKey: varchar('active_event_table_key', { length: 200 }),
    version: integer('version').notNull().default(1),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releaseReason: varchar('release_reason', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('reservation_table_assignments_hold_uq').on(table.holdId),
    uniqueIndex('reservation_table_assignments_reservation_uq').on(
      table.reservationId,
    ),
    uniqueIndex('reservation_table_assignments_active_table_uq').on(
      table.organizationId,
      table.activeEventTableKey,
    ),
    index('reservation_table_assignments_event_status_idx').on(
      table.eventId,
      table.status,
      table.assignedAt,
    ),
    index('reservation_table_assignments_table_idx').on(
      table.diningTableId,
      table.status,
    ),
    check(
      'reservation_table_assignments_owner_ck',
      sql`(
        (${table.holdId} is not null and ${table.reservationId} is null)
        or
        (${table.holdId} is null and ${table.reservationId} is not null)
      )`,
    ),
    check(
      'reservation_table_assignments_active_state_ck',
      sql`(
        (${table.status} = 'ACTIVE' and ${table.activeEventTableKey} is not null and ${table.releasedAt} is null)
        or
        (${table.status} = 'RELEASED' and ${table.activeEventTableKey} is null and ${table.releasedAt} is not null)
      )`,
    ),
    check(
      'reservation_table_assignments_version_positive_ck',
      sql`${table.version} > 0`,
    ),
  ],
);

export const reservationPayments = pgTable(
  'reservation_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    status: reservationPaymentStatus('status').notNull().default('CREATED'),
    provider: varchar('provider', { length: 80 }).notNull(),
    providerPaymentId: varchar('provider_payment_id', { length: 240 }),
    providerSessionId: varchar('provider_session_id', { length: 240 }),
    providerEventId: varchar('provider_event_id', { length: 240 }),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    platformFeeCents: integer('platform_fee_cents').notNull(),
    merchantGrossCents: integer('merchant_gross_cents').notNull(),
    providerFeeCents: integer('provider_fee_cents').notNull().default(0),
    merchantNetCents: integer('merchant_net_cents').notNull(),
    refundedCents: integer('refunded_cents').notNull().default(0),
    currency: char('currency', { length: 3 }).notNull(),
    failureCode: varchar('failure_code', { length: 100 }),
    failureMessage: varchar('failure_message', { length: 1000 }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('reservation_payments_reservation_idempotency_uq').on(
      table.reservationId,
      table.idempotencyKey,
    ),
    uniqueIndex('reservation_payments_provider_payment_uq').on(
      table.provider,
      table.providerPaymentId,
    ),
    uniqueIndex('reservation_payments_provider_event_uq').on(
      table.provider,
      table.providerEventId,
    ),
    index('reservation_payments_reservation_status_idx').on(
      table.reservationId,
      table.status,
      table.createdAt,
    ),
    index('reservation_payments_org_location_created_idx').on(
      table.organizationId,
      table.locationId,
      table.createdAt,
    ),
    check(
      'reservation_payments_amount_positive_ck',
      sql`${table.amountCents} > 0`,
    ),
    check(
      'reservation_payments_platform_fee_nonnegative_ck',
      sql`${table.platformFeeCents} >= 0`,
    ),
    check(
      'reservation_payments_merchant_gross_ck',
      sql`${table.merchantGrossCents} = ${table.amountCents} - ${table.platformFeeCents}`,
    ),
    check(
      'reservation_payments_provider_fee_nonnegative_ck',
      sql`${table.providerFeeCents} >= 0`,
    ),
    check(
      'reservation_payments_merchant_net_ck',
      sql`${table.merchantNetCents} = ${table.merchantGrossCents} - ${table.providerFeeCents}`,
    ),
    check(
      'reservation_payments_refunded_range_ck',
      sql`${table.refundedCents} between 0 and ${table.amountCents}`,
    ),
  ],
);

export const platformFeeLedger = pgTable(
  'platform_fee_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'restrict' }),
    reservationPaymentId: uuid('reservation_payment_id').references(
      () => reservationPayments.id,
      { onDelete: 'restrict' },
    ),
    entryType: platformFeeLedgerEntryType('entry_type').notNull(),
    sourceKey: varchar('source_key', { length: 240 }).notNull(),
    customerAmountCents: integer('customer_amount_cents').notNull(),
    platformFeeCents: integer('platform_fee_cents').notNull(),
    providerFeeCents: integer('provider_fee_cents').notNull(),
    merchantNetCents: integer('merchant_net_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    description: varchar('description', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('platform_fee_ledger_source_key_uq').on(table.sourceKey),
    index('platform_fee_ledger_org_event_created_idx').on(
      table.organizationId,
      table.eventId,
      table.createdAt,
    ),
    index('platform_fee_ledger_reservation_idx').on(
      table.reservationId,
      table.createdAt,
    ),
    check(
      'platform_fee_ledger_balance_ck',
      sql`${table.customerAmountCents} = ${table.platformFeeCents} + ${table.providerFeeCents} + ${table.merchantNetCents}`,
    ),
  ],
);

export const reservationStatusHistory = pgTable(
  'reservation_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    fromStatus: reservationStatus('from_status'),
    toStatus: reservationStatus('to_status').notNull(),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: varchar('reason', { length: 500 }),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('reservation_status_history_reservation_created_idx').on(
      table.reservationId,
      table.createdAt,
    ),
    index('reservation_status_history_org_location_created_idx').on(
      table.organizationId,
      table.locationId,
      table.createdAt,
    ),
  ],
);
// PHASE_2_EVENTS_RESERVATIONS_TABLES_END
'@

$typesBlock = @'
// PHASE_2_EVENTS_RESERVATIONS_TYPES_START
export type EventStatus = (typeof eventStatus.enumValues)[number];
export type ReservationStatus = (typeof reservationStatus.enumValues)[number];
export type ReservationHoldStatus =
  (typeof reservationHoldStatus.enumValues)[number];
export type ReservationAssignmentStatus =
  (typeof reservationAssignmentStatus.enumValues)[number];
export type ReservationPaymentStatus =
  (typeof reservationPaymentStatus.enumValues)[number];
export type PlatformFeeRuleScope =
  (typeof platformFeeRuleScope.enumValues)[number];
export type PlatformFeeLedgerEntryType =
  (typeof platformFeeLedgerEntryType.enumValues)[number];
// PHASE_2_EVENTS_RESERVATIONS_TYPES_END
'@

$schema = Insert-BeforeAnchor `
    -Source $schema `
    -Anchor "export const outboxStatus = pgEnum" `
    -Block $enumBlock `
    -Marker 'PHASE_2_EVENTS_RESERVATIONS_ENUMS_START'

$schema = Insert-BeforeAnchor `
    -Source $schema `
    -Anchor 'export const auditEvents = pgTable' `
    -Block $tablesBlock `
    -Marker 'PHASE_2_EVENTS_RESERVATIONS_TABLES_START'

$schema = Insert-BeforeAnchor `
    -Source $schema `
    -Anchor 'export type FiscalProvider =' `
    -Block $typesBlock `
    -Marker 'PHASE_2_EVENTS_RESERVATIONS_TYPES_START'

Write-Utf8File `
    -Path $schemaPath `
    -Content $schema `
    -DryRun:$DryRun

$testContent = @'
import {
  eventBookingRules,
  eventMedia,
  eventStatus,
  eventTableInventory,
  events,
  platformFeeLedger,
  platformFeeLedgerEntryType,
  platformFeeRuleScope,
  platformFeeRules,
  reservationAssignmentStatus,
  reservationHoldStatus,
  reservationHolds,
  reservationPaymentStatus,
  reservationPayments,
  reservations,
  reservationStatus,
  reservationStatusHistory,
  reservationTableAssignments,
} from './schema';

describe('Phase 2 events and reservations schema', () => {
  it('exports every Phase 2 table', () => {
    expect([
      events,
      eventMedia,
      eventTableInventory,
      eventBookingRules,
      platformFeeRules,
      reservationHolds,
      reservations,
      reservationTableAssignments,
      reservationPayments,
      platformFeeLedger,
      reservationStatusHistory,
    ]).not.toContain(undefined);
  });

  it('keeps the event lifecycle explicit', () => {
    expect(eventStatus.enumValues).toEqual([
      'DRAFT',
      'PUBLISHED',
      'SOLD_OUT',
      'CANCELLED',
      'COMPLETED',
      'ARCHIVED',
    ]);
  });

  it('keeps reservation, hold and payment states separate', () => {
    expect(reservationStatus.enumValues).toEqual([
      'PENDING_PAYMENT',
      'CONFIRMED',
      'CHECKED_IN',
      'SEATED',
      'COMPLETED',
      'CANCELLED',
      'EXPIRED',
      'NO_SHOW',
      'REFUND_PENDING',
      'REFUNDED',
    ]);

    expect(reservationHoldStatus.enumValues).toEqual([
      'ACTIVE',
      'CONVERTED',
      'EXPIRED',
      'CANCELLED',
    ]);

    expect(reservationAssignmentStatus.enumValues).toEqual([
      'ACTIVE',
      'RELEASED',
    ]);

    expect(reservationPaymentStatus.enumValues).toEqual([
      'CREATED',
      'REQUIRES_ACTION',
      'PAID',
      'FAILED',
      'CANCELLED',
      'PARTIALLY_REFUNDED',
      'REFUNDED',
    ]);
  });

  it('supports fee precedence and an immutable ledger', () => {
    expect(platformFeeRuleScope.enumValues).toEqual([
      'GLOBAL',
      'ORGANIZATION',
      'EVENT',
    ]);

    expect(platformFeeLedgerEntryType.enumValues).toEqual([
      'CHARGE',
      'REFUND',
      'ADJUSTMENT',
    ]);
  });
});

'@

$verifyScriptContent = @'
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const migrationArgument = process.argv[2];

if (!migrationArgument) {
  console.error(
    'Uso: node scripts/verify-phase-2-schema.mjs <percorso-migrazione.sql>',
  );
  process.exit(1);
}

const migrationPath = path.resolve(process.cwd(), migrationArgument);
const schemaPath = path.resolve(
  process.cwd(),
  'libs/database/src/schema.ts',
);

await stat(migrationPath);
await stat(schemaPath);

const [migration, schema] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(schemaPath, 'utf8'),
]);

const expectedTables = [
  'events',
  'event_media',
  'event_table_inventory',
  'event_booking_rules',
  'platform_fee_rules',
  'reservation_holds',
  'reservations',
  'reservation_table_assignments',
  'reservation_payments',
  'platform_fee_ledger',
  'reservation_status_history',
];

const expectedConstraints = [
  'events_time_window_ck',
  'events_booking_window_ck',
  'events_booking_before_start_ck',
  'platform_fee_rules_scope_ck',
  'reservation_holds_merchant_gross_ck',
  'reservations_merchant_net_ck',
  'reservation_table_assignments_owner_ck',
  'reservation_table_assignments_active_state_ck',
  'reservation_payments_merchant_net_ck',
  'platform_fee_ledger_balance_ck',
];

const expectedIndexes = [
  'events_slug_uq',
  'event_table_inventory_event_table_uq',
  'reservation_holds_event_idempotency_uq',
  'reservations_confirmation_code_uq',
  'reservation_table_assignments_active_table_uq',
  'reservation_payments_provider_event_uq',
  'platform_fee_ledger_source_key_uq',
];

const missingTables = expectedTables.filter(
  (name) => !migration.includes(`CREATE TABLE "${name}"`),
);
const missingConstraints = expectedConstraints.filter(
  (name) => !migration.includes(name),
);
const missingIndexes = expectedIndexes.filter(
  (name) => !migration.includes(name),
);

const schemaMarkers = [
  'PHASE_2_EVENTS_RESERVATIONS_ENUMS_START',
  'PHASE_2_EVENTS_RESERVATIONS_TABLES_START',
  'PHASE_2_EVENTS_RESERVATIONS_TYPES_START',
];

const missingMarkers = schemaMarkers.filter(
  (marker) => !schema.includes(marker),
);

if (
  missingTables.length > 0 ||
  missingConstraints.length > 0 ||
  missingIndexes.length > 0 ||
  missingMarkers.length > 0
) {
  console.error('Verifica schema Phase 2 fallita.');

  if (missingTables.length > 0) {
    console.error(`Tabelle mancanti: ${missingTables.join(', ')}`);
  }

  if (missingConstraints.length > 0) {
    console.error(`Constraint mancanti: ${missingConstraints.join(', ')}`);
  }

  if (missingIndexes.length > 0) {
    console.error(`Indici mancanti: ${missingIndexes.join(', ')}`);
  }

  if (missingMarkers.length > 0) {
    console.error(`Marker schema mancanti: ${missingMarkers.join(', ')}`);
  }

  process.exit(1);
}

console.log(`Migrazione verificata: ${path.relative(process.cwd(), migrationPath)}`);
console.log(`Tabelle Phase 2: ${expectedTables.length}`);
console.log(`Constraint verificate: ${expectedConstraints.length}`);
console.log(`Indici univoci/critici verificati: ${expectedIndexes.length}`);

'@

$documentationContent = @'
# Fluxa Phase 2 — Schema Events e Reservations

## Obiettivo

Questa fase introduce esclusivamente il modello dati necessario a eventi,
prenotazioni, hold temporanei, assegnazioni tavolo, pagamenti online e
commissioni Fluxa.

Non vengono ancora aggiunti controller, servizi, worker o interfacce utente.

## Domini aggiunti

### Events

- `events`
- `event_media`
- `event_table_inventory`
- `event_booking_rules`

Gli eventi riutilizzano `organizations`, `locations`, `users` e
`dining_tables`.

### Reservations

- `reservation_holds`
- `reservations`
- `reservation_table_assignments`
- `reservation_status_history`

Una prenotazione futura resta distinta da `table_sessions`. Il collegamento
alla table session è nullable e verrà valorizzato solo durante il check-in.

### Booking payments

- `reservation_payments`

Questi pagamenti sono distinti da `payment_transactions`, che rimane il
dominio del checkout POS.

### Commissioni

- `platform_fee_rules`
- `platform_fee_ledger`

Le regole supportano la precedenza:

1. evento;
2. organizzazione;
3. default globale.

Hold e prenotazioni conservano lo snapshot in basis point e centesimi, così
una modifica futura della percentuale non altera transazioni già create.

## Concorrenza tavoli

`reservation_table_assignments.active_event_table_key` viene valorizzato solo
durante un'assegnazione attiva.

L'indice univoco su organizzazione e chiave attiva impedisce due assegnazioni
contemporanee per lo stesso evento e tavolo. Il motore di prenotazione dovrà
comunque usare transazioni e locking PostgreSQL.

## Denaro

Tutti gli importi sono interi in centesimi. Le constraint verificano:

- importi non negativi;
- commissione tra 0 e 10.000 basis point;
- lordo locale uguale a importo meno commissione;
- netto locale uguale a lordo meno costo provider;
- quadratura delle registrazioni nel ledger.

## Migrazione

La migrazione viene generata con Drizzle Kit e non viene applicata
automaticamente al database.

Prima dell'applicazione deve essere revisionato il file SQL generato.

## Verifiche eseguite

- formattazione Prettier;
- controllo della migrazione e delle constraint;
- lint;
- test schema mirato;
- build completa NestJS.

'@

Write-Utf8File `
    -Path $testPath `
    -Content $testContent `
    -DryRun:$DryRun

Write-Utf8File `
    -Path $verifyScriptPath `
    -Content $verifyScriptContent `
    -DryRun:$DryRun

Write-Utf8File `
    -Path $documentationPath `
    -Content $documentationContent `
    -DryRun:$DryRun

if ($DryRun) {
    Write-Step -Message 'DryRun Fase 02 completato'

    Write-Host @"
Lo script modificherebbe lo schema, aggiungerebbe test e documentazione,
genererebbe una nuova migrazione Drizzle e lancerebbe lint, test e build.
"@

    return
}

Write-Step -Message 'Formattazione dei file'

Invoke-Checked `
    -FilePath $npxCommand `
    -ArgumentList @(
        'prettier',
        '--write',
        'libs/database/src/schema.ts',
        'libs/database/src/schema.phase-2.spec.ts',
        'scripts/verify-phase-2-schema.mjs',
        'docs/phase-2/reservations-schema.md'
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

$phaseMigration = Get-PhaseMigration -DrizzleDirectory $drizzleDirectory

if ($null -eq $phaseMigration) {
    Write-Step -Message 'Generazione della migrazione Drizzle'

    $existingSqlFiles = @(
        Get-ChildItem -LiteralPath $drizzleDirectory -Filter '*.sql' -File
    )

    $existingPaths = @{}
    $existingHashes = @{}

    foreach ($file in $existingSqlFiles) {
        $existingPaths[$file.FullName] = $true
        $existingHashes[$file.FullName] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'db:generate') `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }

    foreach ($file in $existingSqlFiles) {
        $currentHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash

        if ($currentHash -ne $existingHashes[$file.FullName]) {
            throw "Una migrazione SQL esistente è stata modificata: $($file.FullName)"
        }
    }

    $newSqlFiles = @(
        Get-ChildItem -LiteralPath $drizzleDirectory -Filter '*.sql' -File |
            Where-Object {
                -not $existingPaths.ContainsKey($_.FullName)
            }
    )

    if ($newSqlFiles.Count -ne 1) {
        $details = @($newSqlFiles | ForEach-Object { $_.FullName }) -join [Environment]::NewLine

        throw @"
Drizzle avrebbe dovuto generare una sola nuova migrazione.
File nuovi rilevati: $($newSqlFiles.Count)

$details
"@
    }

    $phaseMigration = $newSqlFiles[0]
}
else {
    Write-Host "Migrazione Phase 2 già presente: $($phaseMigration.FullName)"
}

Push-Location -LiteralPath $repositoryRoot

try {
    $relativeMigrationPath = (
        Resolve-Path -LiteralPath $phaseMigration.FullName -Relative
    )
}
finally {
    Pop-Location
}

$relativeMigrationPath = $relativeMigrationPath -replace '^[.][\\/]', ''
$relativeMigrationPath = $relativeMigrationPath.Replace('\\', '/')

Write-Step -Message 'Verifica della migrazione'

Invoke-Checked `
    -FilePath 'node' `
    -ArgumentList @(
        'scripts/verify-phase-2-schema.mjs',
        $relativeMigrationPath
    ) `
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

    Write-Step -Message 'Test schema Phase 2'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @(
            'run',
            'test',
            '--',
            'libs/database/src/schema.phase-2.spec.ts'
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

Write-Step -Message 'Fase 02 completata'

Write-Host @"
Schema Events/Reservations aggiunto.

Migrazione generata:
$relativeMigrationPath

La migrazione NON è stata applicata al database.

Prima del commit controlla:

git status --short
git diff --check
git diff --stat
"@
