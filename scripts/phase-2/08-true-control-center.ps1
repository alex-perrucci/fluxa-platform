[CmdletBinding()]
param(
    [switch] $DryRun,
    [switch] $SkipTests
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
        throw @"
Sono presenti modifiche tracciate non salvate:

$($changes -join [Environment]::NewLine)

Completa commit o stash prima della Fase 08.
"@
    }
}

function Write-PhaseFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [Parameter(Mandatory)]
        [string] $Content,

        [switch] $AllowExisting,

        [switch] $DryRun
    )

    if (Test-Path -LiteralPath $Path) {
        $existing = [System.IO.File]::ReadAllText($Path)

        if (
            -not $AllowExisting -and
            -not $existing.Contains('PHASE_8_TRUE_CONTROL_CENTER')
        ) {
            throw "Il file esiste e non appartiene alla Fase 08: $Path"
        }
    }

    Write-Utf8File -Path $Path -Content $Content -DryRun:$DryRun
}

function Update-AppModule {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string] $Path,

        [switch] $DryRun
    )

    $content = [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n")

    if (-not $content.Contains("import { ControlCenterModule }")) {
        $content = $content.Replace(
            "import { CatalogModule } from './catalog/catalog.module';",
            "import { CatalogModule } from './catalog/catalog.module';`nimport { ControlCenterModule } from './control-center/control-center.module';"
        )
    }

    if (-not $content.Contains("import { PlatformModule }")) {
        $content = $content.Replace(
            "import { PaymentsModule } from './payments/payments.module';",
            "import { PaymentsModule } from './payments/payments.module';`nimport { PlatformModule } from './platform/platform.module';"
        )
    }

    if (-not $content.Contains("    ControlCenterModule,")) {
        $content = $content.Replace(
            "    CatalogModule,",
            "    CatalogModule,`n    ControlCenterModule,"
        )
    }

    if (-not $content.Contains("    PlatformModule,")) {
        $content = $content.Replace(
            "    PaymentsModule,",
            "    PaymentsModule,`n    PlatformModule,"
        )
    }

    if (
        -not $content.Contains("import { ControlCenterModule }") -or
        -not $content.Contains("import { PlatformModule }") -or
        -not $content.Contains("    ControlCenterModule,") -or
        -not $content.Contains("    PlatformModule,")
    ) {
        throw 'Impossibile aggiornare apps/api/src/app.module.ts.'
    }

    Write-Utf8File -Path $Path -Content $content -DryRun:$DryRun
}

$repositoryRoot = Get-RepositoryRoot
$appModulePath = Join-Path `
    -Path $repositoryRoot `
    -ChildPath 'apps/api/src/app.module.ts'
$phaseSevenMarker = Join-Path `
    -Path $repositoryRoot `
    -ChildPath 'scripts/verify-phase-7-runtime.mjs'
$webPackage = Join-Path `
    -Path $repositoryRoot `
    -ChildPath 'apps/web/package.json'

Write-Step -Message 'Preflight Fase 08 True Control Center'

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
    throw 'La Fase 08 non può essere eseguita direttamente su main.'
}

foreach ($requiredPath in @($appModulePath, $phaseSevenMarker, $webPackage)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Prerequisito Fase 08 mancante: $requiredPath"
    }
}

Write-Step -Message 'Generazione backend e Control Center web'

$content_apps_api_src_control_center_control_center_controller_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { Controller, Get, Query } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { ControlCenterService } from './control-center.service';
import { MerchantOverviewQueryDto } from './dto/merchant-overview-query.dto';
import { MerchantReservationListQueryDto } from './dto/merchant-reservation-list-query.dto';

@Controller('control-center')
export class ControlCenterController {
  constructor(private readonly controlCenter: ControlCenterService) {}

  @Get('merchant-overview')
  overview(
    @CurrentAuth() auth: AuthContext,
    @Query() query: MerchantOverviewQueryDto,
  ) {
    return this.controlCenter.merchantOverview(auth, query.locationId);
  }

  @Get('reservations')
  reservations(
    @CurrentAuth() auth: AuthContext,
    @Query() query: MerchantReservationListQueryDto,
  ) {
    return this.controlCenter.reservations(auth, query);
  }
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\control-center\control-center.controller.ts') `
    -Content $content_apps_api_src_control_center_control_center_controller_ts `
    -DryRun:$DryRun

$content_apps_api_src_control_center_control_center_module_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { Module } from '@nestjs/common';
import { ControlCenterController } from './control-center.controller';
import { ControlCenterService } from './control-center.service';

@Module({
  controllers: [ControlCenterController],
  providers: [ControlCenterService],
})
export class ControlCenterModule {}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\control-center\control-center.module.ts') `
    -Content $content_apps_api_src_control_center_control_center_module_ts `
    -DryRun:$DryRun

$content_apps_api_src_control_center_control_center_service_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { Injectable, NotFoundException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { MerchantReservationListQueryDto } from './dto/merchant-reservation-list-query.dto';

interface LocationRow extends QueryResultRow {
  id: string;
  name: string;
  timezone: string;
}

interface OverviewMetricsRow extends QueryResultRow {
  events: number;
  publishedEvents: number;
  upcomingEvents: number;
  reservations: number;
  confirmedGuests: number;
  refundPending: number;
  paidVolumeCents: string;
}

interface CountRow extends QueryResultRow {
  count: number;
}

@Injectable()
export class ControlCenterService {
  constructor(private readonly database: DatabaseService) {}

  async merchantOverview(auth: AuthContext, locationId: string) {
    const organizationId = assertOrganizationScope(auth);
    const location = await this.requireLocation(organizationId, locationId);

    const [metricsResult, eventsResult, reservationsResult] = await Promise.all([
      this.database.pool.query<OverviewMetricsRow>(
        `
          SELECT
            (
              SELECT COUNT(*)::int
              FROM events
              WHERE organization_id = $1
                AND location_id = $2
                AND status <> 'ARCHIVED'
            ) AS events,
            (
              SELECT COUNT(*)::int
              FROM events
              WHERE organization_id = $1
                AND location_id = $2
                AND status IN ('PUBLISHED','SOLD_OUT')
            ) AS "publishedEvents",
            (
              SELECT COUNT(*)::int
              FROM events
              WHERE organization_id = $1
                AND location_id = $2
                AND starts_at > NOW()
                AND status IN ('PUBLISHED','SOLD_OUT')
            ) AS "upcomingEvents",
            (
              SELECT COUNT(*)::int
              FROM reservations
              WHERE organization_id = $1
                AND location_id = $2
            ) AS reservations,
            COALESCE(
              (
                SELECT SUM(party_size)::int
                FROM reservations
                WHERE organization_id = $1
                  AND location_id = $2
                  AND status IN (
                    'CONFIRMED',
                    'CHECKED_IN',
                    'SEATED',
                    'COMPLETED'
                  )
              ),
              0
            ) AS "confirmedGuests",
            (
              SELECT COUNT(*)::int
              FROM reservations
              WHERE organization_id = $1
                AND location_id = $2
                AND status = 'REFUND_PENDING'
            ) AS "refundPending",
            COALESCE(
              (
                SELECT SUM(amount_cents)::text
                FROM reservation_payments
                WHERE organization_id = $1
                  AND location_id = $2
                  AND status = 'PAID'
              ),
              '0'
            ) AS "paidVolumeCents"
        `,
        [organizationId, locationId],
      ),
      this.database.pool.query(
        `
          SELECT
            id,
            title,
            slug,
            status,
            starts_at AS "startsAt",
            capacity,
            booking_amount_cents AS "bookingAmountCents",
            currency,
            cover_image_url AS "coverImageUrl"
          FROM events
          WHERE organization_id = $1
            AND location_id = $2
            AND status <> 'ARCHIVED'
          ORDER BY starts_at DESC
          LIMIT 6
        `,
        [organizationId, locationId],
      ),
      this.database.pool.query(
        `
          SELECT
            r.id,
            r.confirmation_code AS "confirmationCode",
            r.status,
            r.customer_name AS "customerName",
            r.party_size AS "partySize",
            r.amount_cents AS "amountCents",
            r.currency,
            r.created_at AS "createdAt",
            e.title AS "eventTitle",
            dt.name AS "tableName"
          FROM reservations r
          JOIN events e ON e.id = r.event_id
          LEFT JOIN reservation_table_assignments rta
            ON rta.reservation_id = r.id
          LEFT JOIN dining_tables dt ON dt.id = rta.dining_table_id
          WHERE r.organization_id = $1
            AND r.location_id = $2
          ORDER BY r.created_at DESC
          LIMIT 7
        `,
        [organizationId, locationId],
      ),
    ]);

    return {
      location,
      metrics: metricsResult.rows[0] ?? {
        events: 0,
        publishedEvents: 0,
        upcomingEvents: 0,
        reservations: 0,
        confirmedGuests: 0,
        refundPending: 0,
        paidVolumeCents: '0',
      },
      recentEvents: eventsResult.rows,
      recentReservations: reservationsResult.rows,
    };
  }

  async reservations(
    auth: AuthContext,
    query: MerchantReservationListQueryDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    await this.requireLocation(organizationId, query.locationId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const offset = (page - 1) * pageSize;
    const search = query.q?.trim() || null;
    const parameters = [
      organizationId,
      query.locationId,
      query.status ?? null,
      search,
      pageSize,
      offset,
    ];

    const [itemsResult, countResult] = await Promise.all([
      this.database.pool.query(
        `
          SELECT
            r.id,
            r.event_id AS "eventId",
            r.confirmation_code AS "confirmationCode",
            r.status,
            r.customer_name AS "customerName",
            r.customer_email AS "customerEmail",
            r.customer_phone AS "customerPhone",
            r.party_size AS "partySize",
            r.amount_cents AS "amountCents",
            r.platform_fee_cents AS "platformFeeCents",
            r.merchant_net_cents AS "merchantNetCents",
            r.refunded_cents AS "refundedCents",
            r.currency,
            r.confirmed_at AS "confirmedAt",
            r.created_at AS "createdAt",
            e.title AS "eventTitle",
            e.starts_at AS "eventStartsAt",
            dt.id AS "tableId",
            dt.code AS "tableCode",
            dt.name AS "tableName"
          FROM reservations r
          JOIN events e ON e.id = r.event_id
          LEFT JOIN reservation_table_assignments rta
            ON rta.reservation_id = r.id
          LEFT JOIN dining_tables dt ON dt.id = rta.dining_table_id
          WHERE r.organization_id = $1
            AND r.location_id = $2
            AND ($3::reservation_status IS NULL OR r.status = $3)
            AND (
              $4::text IS NULL
              OR r.customer_name ILIKE '%' || $4 || '%'
              OR r.customer_email ILIKE '%' || $4 || '%'
              OR r.confirmation_code ILIKE '%' || $4 || '%'
              OR e.title ILIKE '%' || $4 || '%'
            )
          ORDER BY r.created_at DESC
          LIMIT $5 OFFSET $6
        `,
        parameters,
      ),
      this.database.pool.query<CountRow>(
        `
          SELECT COUNT(*)::int AS count
          FROM reservations r
          JOIN events e ON e.id = r.event_id
          WHERE r.organization_id = $1
            AND r.location_id = $2
            AND ($3::reservation_status IS NULL OR r.status = $3)
            AND (
              $4::text IS NULL
              OR r.customer_name ILIKE '%' || $4 || '%'
              OR r.customer_email ILIKE '%' || $4 || '%'
              OR r.confirmation_code ILIKE '%' || $4 || '%'
              OR e.title ILIKE '%' || $4 || '%'
            )
        `,
        parameters.slice(0, 4),
      ),
    ]);

    return {
      items: itemsResult.rows,
      total: countResult.rows[0]?.count ?? 0,
      page,
      pageSize,
    };
  }

  private async requireLocation(
    organizationId: string,
    locationId: string,
  ): Promise<LocationRow> {
    const result = await this.database.pool.query<LocationRow>(
      `
        SELECT id, name, timezone
        FROM locations
        WHERE id = $1
          AND organization_id = $2
          AND status = 'ACTIVE'
        LIMIT 1
      `,
      [locationId, organizationId],
    );
    const location = result.rows[0];

    if (!location) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Sede attiva non trovata.',
      });
    }

    return location;
  }
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\control-center\control-center.service.ts') `
    -Content $content_apps_api_src_control_center_control_center_service_ts `
    -DryRun:$DryRun

$content_apps_api_src_control_center_dto_merchant_overview_query_dto_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { IsUUID } from 'class-validator';

export class MerchantOverviewQueryDto {
  @IsUUID()
  locationId!: string;
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\control-center\dto\merchant-overview-query.dto.ts') `
    -Content $content_apps_api_src_control_center_dto_merchant_overview_query_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_control_center_dto_merchant_reservation_list_query_dto_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
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

const STATUSES = [
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
] as const;

export class MerchantReservationListQueryDto {
  @IsUUID()
  locationId!: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

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
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\control-center\dto\merchant-reservation-list-query.dto.ts') `
    -Content $content_apps_api_src_control_center_dto_merchant_reservation_list_query_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_platform_dto_platform_onboarding_dto_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PlatformOnboardingTableDto {
  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_.-]+$/i)
  code!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  capacity!: number;
}

export class PlatformOnboardingDto {
  @IsString()
  @Length(2, 180)
  organizationName!: string;

  @IsString()
  @Length(3, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  organizationSlug!: string;

  @IsEmail()
  @MaxLength(320)
  ownerEmail!: string;

  @IsString()
  @Length(2, 160)
  ownerDisplayName!: string;

  @IsString()
  @Length(12, 200)
  ownerTemporaryPassword!: string;

  @IsString()
  @Length(2, 220)
  legalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  tradeName?: string;

  @IsString()
  @Matches(/^[A-Z0-9]{5,32}$/i)
  vatNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_-]+$/i)
  locationCode!: string;

  @IsString()
  @Length(2, 180)
  locationName!: string;

  @IsString()
  @Length(2, 220)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  addressLine2?: string;

  @IsString()
  @Length(3, 20)
  postalCode!: string;

  @IsString()
  @Length(2, 120)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  province?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  timezone?: string;

  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Z0-9_.-]+$/i)
  areaCode!: string;

  @IsString()
  @Length(2, 120)
  areaName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PlatformOnboardingTableDto)
  tables!: PlatformOnboardingTableDto[];
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\platform\dto\platform-onboarding.dto.ts') `
    -Content $content_apps_api_src_platform_dto_platform_onboarding_dto_ts `
    -DryRun:$DryRun

$content_apps_api_src_platform_platform_controller_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator';
import { PlatformAdminOnly } from '../auth/decorators/platform-admin.decorator';
import { TenantOptional } from '../auth/decorators/tenant-optional.decorator';
import { PlatformOnboardingDto } from './dto/platform-onboarding.dto';
import { PlatformService } from './platform.service';

@TenantOptional()
@PlatformAdminOnly()
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Post('onboarding')
  onboard(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PlatformOnboardingDto,
  ) {
    return this.platform.onboard(auth, dto);
  }

  @Get('organizations/:organizationId')
  organization(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.platform.organizationSummary(organizationId);
  }
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\platform\platform.controller.ts') `
    -Content $content_apps_api_src_platform_platform_controller_ts `
    -DryRun:$DryRun

$content_apps_api_src_platform_platform_module_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\platform\platform.module.ts') `
    -Content $content_apps_api_src_platform_platform_module_ts `
    -DryRun:$DryRun

$content_apps_api_src_platform_platform_service_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { hashPassword } from '../auth/crypto';
import type { PlatformOnboardingDto } from './dto/platform-onboarding.dto';

interface PlatformOverviewRow extends QueryResultRow {
  organizations: number;
  activeOrganizations: number;
  users: number;
  events: number;
  reservations: number;
  refundPending: number;
  paidVolumeCents: string;
}

interface OrganizationRow extends QueryResultRow {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
  createdByEmail: string | null;
}

interface OrganizationMetricsRow extends QueryResultRow {
  merchants: number;
  locations: number;
  members: number;
  events: number;
  reservations: number;
  paidVolumeCents: string;
}

@Injectable()
export class PlatformService {
  constructor(private readonly database: DatabaseService) {}

  async overview() {
    const [metricsResult, organizationsResult] = await Promise.all([
      this.database.pool.query<PlatformOverviewRow>(`
        SELECT
          (SELECT COUNT(*)::int FROM organizations) AS organizations,
          (
            SELECT COUNT(*)::int
            FROM organizations
            WHERE status = 'ACTIVE'
          ) AS "activeOrganizations",
          (SELECT COUNT(*)::int FROM users) AS users,
          (
            SELECT COUNT(*)::int
            FROM events
            WHERE status <> 'ARCHIVED'
          ) AS events,
          (SELECT COUNT(*)::int FROM reservations) AS reservations,
          (
            SELECT COUNT(*)::int
            FROM reservations
            WHERE status = 'REFUND_PENDING'
          ) AS "refundPending",
          COALESCE(
            (
              SELECT SUM(amount_cents)::text
              FROM reservation_payments
              WHERE status = 'PAID'
            ),
            '0'
          ) AS "paidVolumeCents"
      `),
      this.database.pool.query<OrganizationRow>(`
        SELECT
          o.id,
          o.name,
          o.slug,
          o.status,
          o.created_at AS "createdAt",
          u.email AS "createdByEmail"
        FROM organizations o
        LEFT JOIN users u ON u.id = o.created_by_user_id
        ORDER BY o.created_at DESC
        LIMIT 8
      `),
    ]);

    return {
      metrics: metricsResult.rows[0] ?? {
        organizations: 0,
        activeOrganizations: 0,
        users: 0,
        events: 0,
        reservations: 0,
        refundPending: 0,
        paidVolumeCents: '0',
      },
      recentOrganizations: organizationsResult.rows,
    };
  }

  async organizationSummary(organizationId: string) {
    const organizationResult = await this.database.pool.query<OrganizationRow>(
      `
        SELECT
          o.id,
          o.name,
          o.slug,
          o.status,
          o.created_at AS "createdAt",
          u.email AS "createdByEmail"
        FROM organizations o
        LEFT JOIN users u ON u.id = o.created_by_user_id
        WHERE o.id = $1
        LIMIT 1
      `,
      [organizationId],
    );
    const organization = organizationResult.rows[0];

    if (!organization) {
      throw new NotFoundException({
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'Organizzazione non trovata.',
      });
    }

    const [metricsResult, merchantsResult, locationsResult, membersResult] =
      await Promise.all([
        this.database.pool.query<OrganizationMetricsRow>(
          `
            SELECT
              (
                SELECT COUNT(*)::int
                FROM merchants
                WHERE organization_id = $1
              ) AS merchants,
              (
                SELECT COUNT(*)::int
                FROM locations
                WHERE organization_id = $1
              ) AS locations,
              (
                SELECT COUNT(*)::int
                FROM organization_memberships
                WHERE organization_id = $1
              ) AS members,
              (
                SELECT COUNT(*)::int
                FROM events
                WHERE organization_id = $1
              ) AS events,
              (
                SELECT COUNT(*)::int
                FROM reservations
                WHERE organization_id = $1
              ) AS reservations,
              COALESCE(
                (
                  SELECT SUM(amount_cents)::text
                  FROM reservation_payments
                  WHERE organization_id = $1
                    AND status = 'PAID'
                ),
                '0'
              ) AS "paidVolumeCents"
          `,
          [organizationId],
        ),
        this.database.pool.query(
          `
            SELECT
              id,
              legal_name AS "legalName",
              trade_name AS "tradeName",
              vat_number AS "vatNumber",
              status
            FROM merchants
            WHERE organization_id = $1
            ORDER BY created_at
          `,
          [organizationId],
        ),
        this.database.pool.query(
          `
            SELECT
              id,
              merchant_id AS "merchantId",
              code,
              name,
              city,
              province,
              timezone,
              status
            FROM locations
            WHERE organization_id = $1
            ORDER BY name
          `,
          [organizationId],
        ),
        this.database.pool.query(
          `
            SELECT
              om.id AS "membershipId",
              u.id AS "userId",
              u.display_name AS "displayName",
              u.email,
              om.role,
              om.status,
              l.name AS "defaultLocationName"
            FROM organization_memberships om
            JOIN users u ON u.id = om.user_id
            LEFT JOIN locations l ON l.id = om.default_location_id
            WHERE om.organization_id = $1
            ORDER BY u.display_name
          `,
          [organizationId],
        ),
      ]);

    return {
      organization,
      metrics: metricsResult.rows[0],
      merchants: merchantsResult.rows,
      locations: locationsResult.rows,
      members: membersResult.rows,
    };
  }

  async onboard(auth: AuthContext, dto: PlatformOnboardingDto) {
    const passwordHash = await hashPassword(dto.ownerTemporaryPassword);
    const normalized = {
      organizationName: dto.organizationName.trim(),
      organizationSlug: dto.organizationSlug.trim().toLowerCase(),
      ownerEmail: dto.ownerEmail.trim().toLowerCase(),
      ownerDisplayName: dto.ownerDisplayName.trim(),
      legalName: dto.legalName.trim(),
      tradeName: dto.tradeName?.trim() || null,
      vatNumber: dto.vatNumber.trim().toUpperCase(),
      taxCode: dto.taxCode?.trim().toUpperCase() || null,
      countryCode: (dto.countryCode ?? 'IT').trim().toUpperCase(),
      locationCode: dto.locationCode.trim().toUpperCase(),
      locationName: dto.locationName.trim(),
      addressLine1: dto.addressLine1.trim(),
      addressLine2: dto.addressLine2?.trim() || null,
      postalCode: dto.postalCode.trim(),
      city: dto.city.trim(),
      province: dto.province?.trim().toUpperCase() || null,
      timezone: dto.timezone?.trim() || 'Europe/Rome',
      areaCode: dto.areaCode.trim().toUpperCase(),
      areaName: dto.areaName.trim(),
      tables: dto.tables.map((table, index) => ({
        code: table.code.trim().toUpperCase(),
        name: table.name.trim(),
        capacity: table.capacity,
        sortOrder: index,
      })),
    };

    try {
      return await this.withTransaction(async (client) => {
        const existingResult = await client.query(
          `
            SELECT
              EXISTS(
                SELECT 1 FROM organizations WHERE slug = $1
              ) AS "organizationExists",
              EXISTS(
                SELECT 1 FROM users WHERE email = $2
              ) AS "userExists"
          `,
          [normalized.organizationSlug, normalized.ownerEmail],
        );
        const existing = existingResult.rows[0] as {
          organizationExists: boolean;
          userExists: boolean;
        };

        if (existing.organizationExists) {
          throw new ConflictException({
            code: 'ORGANIZATION_SLUG_ALREADY_EXISTS',
            message: "Lo slug dell'organizzazione è già utilizzato.",
          });
        }

        if (existing.userExists) {
          throw new ConflictException({
            code: 'OWNER_EMAIL_ALREADY_EXISTS',
            message:
              'Esiste già un account con la mail indicata. Usa una mail nuova per il titolare.',
          });
        }

        const organizationId = randomUUID();
        const ownerUserId = randomUUID();
        const merchantId = randomUUID();
        const locationId = randomUUID();
        const membershipId = randomUUID();
        const areaId = randomUUID();

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
          `,
          [
            organizationId,
            normalized.organizationSlug,
            normalized.organizationName,
            auth.userId,
          ],
        );

        await client.query(
          `
            INSERT INTO users (
              id,
              email,
              password_hash,
              display_name,
              platform_admin,
              status
            )
            VALUES ($1,$2,$3,$4,FALSE,'ACTIVE')
          `,
          [
            ownerUserId,
            normalized.ownerEmail,
            passwordHash,
            normalized.ownerDisplayName,
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
              tax_code,
              country_code,
              status
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE')
          `,
          [
            merchantId,
            organizationId,
            normalized.legalName,
            normalized.tradeName,
            normalized.vatNumber,
            normalized.taxCode,
            normalized.countryCode,
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
              address_line_2,
              postal_code,
              city,
              province,
              country_code,
              timezone,
              status
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ACTIVE'
            )
          `,
          [
            locationId,
            organizationId,
            merchantId,
            normalized.locationCode,
            normalized.locationName,
            normalized.addressLine1,
            normalized.addressLine2,
            normalized.postalCode,
            normalized.city,
            normalized.province,
            normalized.countryCode,
            normalized.timezone,
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
            VALUES ($1,$2,$3,'OWNER','ACTIVE',$4)
          `,
          [membershipId, organizationId, ownerUserId, locationId],
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
            VALUES ($1,$2,$3,$4,$5,0,'ACTIVE')
          `,
          [
            areaId,
            organizationId,
            locationId,
            normalized.areaCode,
            normalized.areaName,
          ],
        );

        const tables: Array<{
          id: string;
          code: string;
          name: string;
          capacity: number;
        }> = [];

        for (const table of normalized.tables) {
          const tableId = randomUUID();

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
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE')
            `,
            [
              tableId,
              organizationId,
              locationId,
              areaId,
              table.code,
              table.name,
              table.capacity,
              table.sortOrder,
            ],
          );

          tables.push({
            id: tableId,
            code: table.code,
            name: table.name,
            capacity: table.capacity,
          });
        }

        const payload = {
          organizationId,
          merchantId,
          locationId,
          ownerUserId,
          ownerEmail: normalized.ownerEmail,
          tableCount: tables.length,
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
              $1,$2,$3,'platform.organization.onboarded',
              'organization',$4,$5::jsonb
            )
          `,
          [
            randomUUID(),
            organizationId,
            auth.userId,
            organizationId,
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
              $1,'platform.organization.onboarded',
              'organization',$2,$3::jsonb
            )
          `,
          [randomUUID(), organizationId, JSON.stringify(payload)],
        );

        return {
          organization: {
            id: organizationId,
            name: normalized.organizationName,
            slug: normalized.organizationSlug,
            status: 'ACTIVE',
          },
          owner: {
            id: ownerUserId,
            email: normalized.ownerEmail,
            displayName: normalized.ownerDisplayName,
            role: 'OWNER',
          },
          merchant: {
            id: merchantId,
            legalName: normalized.legalName,
            tradeName: normalized.tradeName,
          },
          location: {
            id: locationId,
            code: normalized.locationCode,
            name: normalized.locationName,
            timezone: normalized.timezone,
          },
          area: {
            id: areaId,
            code: normalized.areaCode,
            name: normalized.areaName,
          },
          tables,
        };
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'PLATFORM_ONBOARDING_CONFLICT',
          message:
            'Onboarding non completato: slug, partita IVA, codice sede o tavolo già utilizzati.',
        });
      }

      throw error;
    }
  }

  private async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
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
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\api\src\platform\platform.service.ts') `
    -Content $content_apps_api_src_platform_platform_service_ts `
    -DryRun:$DryRun

$content_apps_web_app__auth__login_page_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import type { Metadata } from 'next';
import Link from 'next/link';
import { FluxaMark } from '@/components/brand/fluxa-mark';
import { Icon } from '@/components/control-center/icons';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = {
  title: 'Accesso',
};

export default function LoginPage() {
  return (
    <main className="login-stage">
      <section className="login-visual">
        <Link className="public-brand" href="/">
          <FluxaMark className="h-11 w-11" />
          <span>
            <strong>Fluxa</strong>
            <small>Venue operating system</small>
          </span>
        </Link>

        <div className="login-manifesto">
          <p className="eyebrow">One system. Every moving part.</p>
          <h1>La notte inizia dal controllo.</h1>
          <p>
            Accedi al workspace del tuo locale oppure alla regia globale della
            piattaforma Fluxa.
          </p>
        </div>

        <div className="login-quote">
          <div>
            <Icon name="sparkles" />
          </div>
          <p>
            Eventi e prenotazioni sono sincronizzati con il motore
            transazionale, Stripe e i worker in background.
          </p>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-inner">
          <p className="eyebrow">Secure workspace</p>
          <h2>Bentornato.</h2>
          <p>
            Usa il tuo account Fluxa. Il ruolo determina automaticamente il
            Control Center.
          </p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\(auth)\login\page.tsx') `
    -Content $content_apps_web_app__auth__login_page_tsx `
    -AllowExisting `
    -DryRun:$DryRun

$content_apps_web_app__public__page_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import Link from 'next/link';
import { FluxaMark } from '@/components/brand/fluxa-mark';
import { Icon } from '@/components/control-center/icons';

export default function PublicHomePage() {
  return (
    <main className="landing">
      <nav className="public-nav shell">
        <Link className="public-brand" href="/">
          <FluxaMark className="h-10 w-10" />
          <span>
            <strong>Fluxa</strong>
            <small>Venue operating system</small>
          </span>
        </Link>
        <div className="public-nav-actions">
          <Link className="nav-link" href="/health">
            System status
          </Link>
          <Link className="button-secondary" href="/login">
            Accedi
          </Link>
        </div>
      </nav>

      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow">Control every unforgettable night</p>
          <h1>
            Il locale si muove.
            <br />
            <span>Fluxa lo orchestra.</span>
          </h1>
          <p>
            Eventi, tavoli, depositi, prenotazioni e operatività vivono nello
            stesso sistema. Meno strumenti scollegati. Più controllo quando la
            sala si riempie.
          </p>
          <div className="hero-actions">
            <Link className="button-primary" href="/login">
              Apri il Control Center
              <Icon name="arrow" />
            </Link>
            <Link className="button-secondary" href="/health">
              Verifica il sistema
            </Link>
          </div>
        </div>

        <div className="hero-system">
          <div className="system-window">
            <div className="system-top">
              <div className="system-dots">
                <span />
                <span />
                <span />
              </div>
              <p className="eyebrow">Fluxa control center</p>
            </div>
            <div className="system-body">
              <div className="system-sidebar-demo">
                <FluxaMark className="h-9 w-9" />
                <div className="system-nav-demo">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="system-main-demo">
                <div className="demo-metrics">
                  <div>
                    <span />
                    <strong />
                  </div>
                  <div>
                    <span />
                    <strong />
                  </div>
                </div>
                <div className="demo-list">
                  <span />
                  <div />
                  <div />
                  <div />
                  <div />
                </div>
              </div>
            </div>
          </div>
          <div className="floating-signal">
            <span>Prenotazioni confermate</span>
            <strong>128 ospiti</strong>
            <small>+18% questa settimana</small>
          </div>
        </div>
      </section>

      <section className="trust-row shell">
        <article>
          <strong>Atomic booking</strong>
          <span>Lock PostgreSQL e idempotenza contro l’overbooking.</span>
        </article>
        <article>
          <strong>Tenant isolation</strong>
          <span>Ruoli, organizzazioni e sedi separati nel backend.</span>
        </article>
        <article>
          <strong>Stripe native</strong>
          <span>Depositi, webhook firmati e fee di piattaforma.</span>
        </article>
        <article>
          <strong>POS connected</strong>
          <span>Lo stesso dominio operativo dell’app Flutter.</span>
        </article>
      </section>
    </main>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\(public)\page.tsx') `
    -Content $content_apps_web_app__public__page_tsx `
    -AllowExisting `
    -DryRun:$DryRun

$content_apps_web_app_api_auth_switch_organization_route_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { RefreshResponse } from '@/lib/auth/auth-types';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from '@/lib/auth/cookies';

const schema = z.object({
  organizationId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;

  if (!refreshToken || !accessToken) {
    return NextResponse.json(
      {
        code: 'SESSION_REQUIRED',
        message: 'Sessione non disponibile.',
      },
      { status: 401 },
    );
  }

  try {
    const input = schema.parse(await request.json());
    const result = await fluxaServerFetch<RefreshResponse>(
      '/auth/switch-organization',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          organizationId: input.organizationId,
          refreshToken,
        }),
      },
    );
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          code: 'INVALID_ORGANIZATION',
          message: 'Organizzazione non valida.',
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
        code: 'ORGANIZATION_SWITCH_FAILED',
        message: 'Cambio workspace non riuscito.',
      },
      { status: 500 },
    );
  }
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\api\auth\switch-organization\route.ts') `
    -Content $content_apps_web_app_api_auth_switch_organization_route_ts `
    -DryRun:$DryRun

$content_apps_web_app_api_control_center_merchant_events__eventId__action_route_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

const schema = z.object({
  action: z.enum(['publish', 'cancel', 'archive']),
  reason: z.string().max(1000).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const input = schema.safeParse(await request.json());

  if (!input.success) {
    return NextResponse.json(
      {
        code: 'INVALID_EVENT_ACTION',
        message: 'Azione evento non valida.',
      },
      { status: 400 },
    );
  }

  if (input.data.action === 'archive') {
    return proxyAuthenticatedJson(`/events/${eventId}`, {
      method: 'DELETE',
    });
  }

  return proxyAuthenticatedJson(`/events/${eventId}/${input.data.action}`, {
    method: 'POST',
    ...(input.data.action === 'cancel'
      ? {
          body: JSON.stringify({
            reason:
              input.data.reason ?? 'Annullato dal Control Center Fluxa',
          }),
        }
      : {}),
  });
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\api\control-center\merchant\events\[eventId]\action\route.ts') `
    -Content $content_apps_web_app_api_control_center_merchant_events__eventId__action_route_ts `
    -DryRun:$DryRun

$content_apps_web_app_api_control_center_merchant_events__eventId__route_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

interface EventEditorPayload {
  locationId: string;
  tableIds: string[];
  bookingRules: Record<string, unknown>;
  [key: string]: unknown;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const payload = (await request.json()) as EventEditorPayload;
  const { tableIds, bookingRules } = payload;
  const event = Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) => !['locationId', 'tableIds', 'bookingRules'].includes(key),
    ),
  );

  const eventResponse = await proxyAuthenticatedJson(`/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(event),
  });

  if (!eventResponse.ok) {
    return eventResponse;
  }

  const eventBody = await eventResponse.json();

  const tablesResponse = await proxyAuthenticatedJson(
    `/events/${eventId}/tables`,
    {
      method: 'PUT',
      body: JSON.stringify({ tableIds }),
    },
  );

  if (!tablesResponse.ok) {
    return tablesResponse;
  }

  const rulesResponse = await proxyAuthenticatedJson(
    `/events/${eventId}/booking-rules`,
    {
      method: 'PUT',
      body: JSON.stringify(bookingRules),
    },
  );

  if (!rulesResponse.ok) {
    return rulesResponse;
  }

  return NextResponse.json(eventBody);
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\api\control-center\merchant\events\[eventId]\route.ts') `
    -Content $content_apps_web_app_api_control_center_merchant_events__eventId__route_ts `
    -DryRun:$DryRun

$content_apps_web_app_api_control_center_merchant_events_route_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function POST(request: NextRequest) {
  return proxyAuthenticatedJson('/events', {
    method: 'POST',
    body: await request.text(),
  });
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\api\control-center\merchant\events\route.ts') `
    -Content $content_apps_web_app_api_control_center_merchant_events_route_ts `
    -DryRun:$DryRun

$content_apps_web_app_api_control_center_merchant_tables_route_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get('locationId');

  if (!locationId) {
    return NextResponse.json(
      {
        code: 'LOCATION_REQUIRED',
        message: 'Sede obbligatoria.',
      },
      { status: 400 },
    );
  }

  return proxyAuthenticatedJson(
    `/dining-tables?locationId=${encodeURIComponent(locationId)}`,
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\api\control-center\merchant\tables\route.ts') `
    -Content $content_apps_web_app_api_control_center_merchant_tables_route_ts `
    -DryRun:$DryRun

$content_apps_web_app_api_control_center_platform_onboarding_route_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function POST(request: NextRequest) {
  return proxyAuthenticatedJson('/platform/onboarding', {
    method: 'POST',
    body: await request.text(),
  });
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\api\control-center\platform\onboarding\route.ts') `
    -Content $content_apps_web_app_api_control_center_platform_onboarding_route_ts `
    -DryRun:$DryRun

$content_apps_web_app_globals_css = @'
/* PHASE_8_TRUE_CONTROL_CENTER */
@import "tailwindcss";

:root {
  color-scheme: dark;
  --ink: #050611;
  --surface: rgb(15 19 38 / 82%);
  --surface-strong: #11162b;
  --border: rgb(136 154 210 / 16%);
  --text: #f7f8ff;
  --muted: #9ba6c2;
  --violet: #8b5cf6;
  --blue: #4f7cff;
  --cyan: #22d3ee;
  --green: #42e8ad;
  --rose: #fb7185;
  --amber: #fbbf24;
  --shadow: 0 30px 100px rgb(0 0 0 / 42%);
}

* {
  box-sizing: border-box;
}

html {
  min-height: 100%;
  background: var(--ink);
}

body {
  min-height: 100vh;
  margin: 0;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 8% 5%, rgb(79 124 255 / 17%), transparent 32rem),
    radial-gradient(circle at 88% 0%, rgb(139 92 246 / 17%), transparent 34rem),
    linear-gradient(180deg, #070817 0%, #050611 100%);
  color: var(--text);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  text-rendering: geometricPrecision;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

a {
  color: inherit;
  text-decoration: none;
}

::selection {
  background: rgb(79 124 255 / 40%);
  color: white;
}

.shell {
  width: min(1180px, calc(100% - 2rem));
  margin-inline: auto;
}

.muted {
  color: var(--muted);
}

.eyebrow {
  margin: 0;
  color: #9db6ff;
  font-size: 0.72rem;
  font-weight: 760;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.mt-5 {
  margin-top: 1.25rem;
}

/* Public experience */
.landing {
  position: relative;
  min-height: 100vh;
  isolation: isolate;
}

.landing::before {
  position: absolute;
  z-index: -2;
  inset: 0;
  background-image:
    linear-gradient(rgb(255 255 255 / 2.5%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 2.5%) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: linear-gradient(to bottom, black 0%, transparent 82%);
  content: "";
}

.landing::after {
  position: absolute;
  z-index: -1;
  top: -260px;
  left: 50%;
  width: 800px;
  height: 800px;
  border: 1px solid rgb(139 92 246 / 18%);
  border-radius: 999px;
  box-shadow:
    0 0 150px rgb(79 124 255 / 18%),
    inset 0 0 110px rgb(139 92 246 / 9%);
  content: "";
  transform: translateX(-50%);
}

.public-nav {
  display: flex;
  min-height: 84px;
  align-items: center;
  justify-content: space-between;
}

.public-brand,
.cc-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
}

.public-brand strong,
.cc-brand strong {
  display: block;
  font-size: 1.1rem;
  letter-spacing: -0.03em;
}

.public-brand small,
.cc-brand small {
  display: block;
  margin-top: 0.08rem;
  color: var(--muted);
  font-size: 0.67rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.public-nav-actions,
.hero-actions,
.page-actions,
.event-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.nav-link {
  padding: 0.7rem 0.9rem;
  color: #c5cbe0;
  font-size: 0.9rem;
}

.hero {
  display: grid;
  min-height: calc(100vh - 84px);
  align-items: center;
  gap: 4rem;
  padding: 5rem 0 7rem;
  grid-template-columns: minmax(0, 1.06fr) minmax(430px, 0.94fr);
}

.hero-copy h1 {
  max-width: 850px;
  margin: 1.4rem 0 0;
  font-size: clamp(3.7rem, 7vw, 7.4rem);
  font-weight: 680;
  letter-spacing: -0.075em;
  line-height: 0.9;
}

.hero-copy h1 span {
  background: linear-gradient(
    110deg,
    #fff 10%,
    #a8bbff 48%,
    #b47cff 76%,
    #55e6ff
  );
  background-clip: text;
  color: transparent;
}

.hero-copy > p:not(.eyebrow) {
  max-width: 650px;
  margin: 2rem 0 0;
  color: #c5cbe0;
  font-size: 1.12rem;
  line-height: 1.8;
}

.hero-actions {
  margin-top: 2.2rem;
}

.button-primary,
.button-secondary,
.button-danger {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  border: 1px solid transparent;
  border-radius: 0.9rem;
  padding: 0.8rem 1.1rem;
  font-weight: 720;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease;
}

.button-primary {
  background: linear-gradient(135deg, var(--blue), var(--violet));
  box-shadow: 0 14px 40px rgb(79 124 255 / 25%);
  color: white;
}

.button-primary:hover {
  box-shadow: 0 18px 52px rgb(79 124 255 / 38%);
  transform: translateY(-2px);
}

.button-secondary {
  border-color: var(--border);
  background: rgb(255 255 255 / 4%);
  color: #c5cbe0;
}

.button-secondary:hover {
  border-color: rgb(139 92 246 / 40%);
  background: rgb(139 92 246 / 8%);
  color: white;
}

.button-danger {
  border-color: rgb(251 113 133 / 28%);
  background: rgb(251 113 133 / 10%);
  color: #ffc1ca;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.hero-system {
  position: relative;
  min-height: 570px;
  perspective: 1200px;
}

.system-window {
  position: absolute;
  inset: 3rem 0 0;
  overflow: hidden;
  border: 1px solid rgb(139 92 246 / 28%);
  border-radius: 2rem;
  background: linear-gradient(
    160deg,
    rgb(26 32 64 / 94%),
    rgb(8 10 24 / 94%)
  );
  box-shadow: var(--shadow);
  transform: rotateY(-6deg) rotateX(3deg);
}

.system-window::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgb(255 255 255 / 7%), transparent 28%);
  content: "";
  pointer-events: none;
}

.system-top {
  display: flex;
  height: 58px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  padding: 0 1.3rem;
}

.system-dots {
  display: flex;
  gap: 0.4rem;
}

.system-dots span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #39415d;
}

.system-dots span:first-child {
  background: var(--rose);
}

.system-dots span:nth-child(2) {
  background: var(--amber);
}

.system-dots span:last-child {
  background: var(--green);
}

.system-body {
  display: grid;
  gap: 1rem;
  padding: 1.4rem;
  grid-template-columns: 0.72fr 1.28fr;
}

.system-sidebar-demo {
  min-height: 430px;
  border: 1px solid var(--border);
  border-radius: 1.2rem;
  padding: 1rem;
  background: rgb(0 0 0 / 18%);
}

.system-nav-demo,
.system-main-demo {
  display: grid;
  gap: 0.75rem;
}

.system-nav-demo {
  margin-top: 1.5rem;
}

.system-nav-demo span {
  height: 34px;
  border-radius: 0.65rem;
  background: rgb(255 255 255 / 4%);
}

.system-nav-demo span:nth-child(2) {
  background: linear-gradient(
    90deg,
    rgb(79 124 255 / 30%),
    rgb(139 92 246 / 12%)
  );
}

.demo-metrics {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, 1fr);
}

.demo-metrics div,
.demo-list {
  border: 1px solid var(--border);
  border-radius: 1rem;
  background: rgb(255 255 255 / 4%);
}

.demo-metrics div {
  height: 110px;
  padding: 1rem;
}

.demo-metrics span,
.demo-list span {
  display: block;
  width: 45%;
  height: 8px;
  border-radius: 1rem;
  background: #59617b;
}

.demo-metrics strong {
  display: block;
  width: 65%;
  height: 24px;
  margin-top: 1rem;
  border-radius: 0.5rem;
  background: linear-gradient(90deg, var(--blue), var(--violet));
}

.demo-list {
  min-height: 265px;
  padding: 1rem;
}

.demo-list div {
  height: 48px;
  margin-top: 0.75rem;
  border-radius: 0.8rem;
  background: rgb(255 255 255 / 4%);
}

.floating-signal {
  position: absolute;
  z-index: 4;
  right: -2rem;
  bottom: 0;
  width: 210px;
  border: 1px solid rgb(34 211 238 / 30%);
  border-radius: 1.2rem;
  padding: 1rem;
  background: rgb(8 14 29 / 92%);
  box-shadow: 0 20px 60px rgb(0 0 0 / 45%);
  animation: float-card 5s ease-in-out infinite;
}

.floating-signal span {
  color: var(--muted);
  font-size: 0.75rem;
}

.floating-signal strong {
  display: block;
  margin-top: 0.35rem;
  font-size: 1.45rem;
}

.floating-signal small {
  color: var(--green);
}

@keyframes float-card {
  50% {
    transform: translateY(-12px);
  }
}

.trust-row {
  display: grid;
  gap: 1rem;
  padding: 0 0 7rem;
  grid-template-columns: repeat(4, 1fr);
}

.trust-row article {
  border-top: 1px solid var(--border);
  padding-top: 1.2rem;
}

.trust-row strong,
.trust-row span {
  display: block;
}

.trust-row span {
  margin-top: 0.35rem;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

/* Login */
.login-stage {
  display: grid;
  min-height: 100vh;
  grid-template-columns: minmax(0, 1.15fr) minmax(420px, 0.85fr);
}

.login-visual {
  position: relative;
  display: flex;
  overflow: hidden;
  min-height: 100vh;
  flex-direction: column;
  justify-content: space-between;
  padding: clamp(2rem, 5vw, 5rem);
  border-right: 1px solid var(--border);
  background:
    radial-gradient(circle at 15% 20%, rgb(79 124 255 / 28%), transparent 32rem),
    radial-gradient(circle at 90% 80%, rgb(139 92 246 / 22%), transparent 30rem),
    #080a18;
}

.login-visual::after {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgb(255 255 255 / 3%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 3%) 1px, transparent 1px);
  background-size: 70px 70px;
  content: "";
  mask-image: linear-gradient(135deg, black, transparent 75%);
  pointer-events: none;
}

.login-visual > * {
  position: relative;
  z-index: 1;
}

.login-manifesto {
  max-width: 720px;
}

.login-manifesto h1 {
  margin: 1.4rem 0 0;
  font-size: clamp(3.2rem, 6vw, 6.7rem);
  font-weight: 650;
  letter-spacing: -0.07em;
  line-height: 0.92;
}

.login-manifesto p:last-child {
  max-width: 560px;
  margin-top: 1.8rem;
  color: #c5cbe0;
  font-size: 1.04rem;
  line-height: 1.75;
}

.login-quote {
  display: flex;
  max-width: 650px;
  gap: 1rem;
  align-items: center;
  border-top: 1px solid var(--border);
  padding-top: 1.5rem;
}

.login-quote div:first-child {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(34 211 238 / 25%);
  border-radius: 0.8rem;
  background: rgb(34 211 238 / 10%);
  color: var(--cyan);
}

.login-quote p {
  margin: 0;
  color: #c5cbe0;
  line-height: 1.5;
}

.login-panel {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 2rem;
  background: rgb(5 6 17 / 72%);
}

.login-panel-inner {
  width: min(440px, 100%);
}

.login-panel-inner h2,
.organization-choice h2 {
  margin: 0.65rem 0 0;
  font-size: 2.2rem;
  letter-spacing: -0.045em;
}

.login-panel-inner > p:not(.eyebrow),
.organization-choice > p {
  color: var(--muted);
  line-height: 1.6;
}

.login-form {
  display: grid;
  gap: 1rem;
  margin-top: 2rem;
}

.login-submit {
  width: 100%;
  margin-top: 0.35rem;
}

.login-security {
  margin: 0.3rem 0 0;
  color: #78829c;
  font-size: 0.72rem;
  text-align: center;
}

.organization-choice-list {
  display: grid;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.organization-choice-list button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--border);
  border-radius: 1rem;
  padding: 1rem;
  background: rgb(255 255 255 / 4%);
  color: white;
  text-align: left;
}

.organization-choice-list button:hover {
  border-color: rgb(139 92 246 / 38%);
  background: rgb(139 92 246 / 8%);
}

.organization-choice-list strong,
.organization-choice-list small {
  display: block;
}

.organization-choice-list small {
  margin-top: 0.25rem;
  color: var(--muted);
}

/* Control Center */
.control-center {
  display: grid;
  min-height: 100vh;
  grid-template-columns: 276px minmax(0, 1fr);
}

.cc-sidebar {
  position: sticky;
  top: 0;
  display: flex;
  height: 100vh;
  flex-direction: column;
  border-right: 1px solid var(--border);
  padding: 1.35rem;
  background: linear-gradient(180deg, rgb(12 15 32 / 97%), rgb(7 8 19 / 97%));
}

.cc-brand {
  min-height: 52px;
}

.cc-brand-mark {
  display: grid;
  width: 45px;
  height: 45px;
  place-items: center;
  border: 1px solid rgb(139 92 246 / 28%);
  border-radius: 1rem;
  background: rgb(139 92 246 / 8%);
}

.org-switcher {
  display: grid;
  gap: 0.45rem;
  margin-top: 1.6rem;
}

.org-switcher > span {
  color: #6f7a98;
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.org-switcher select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 0.8rem;
  padding: 0.72rem 0.8rem;
  background: #0e1225;
  color: white;
  outline: none;
}

.platform-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1.6rem;
  border: 1px solid rgb(139 92 246 / 25%);
  border-radius: 0.8rem;
  padding: 0.72rem 0.8rem;
  background: linear-gradient(
    90deg,
    rgb(79 124 255 / 12%),
    rgb(139 92 246 / 12%)
  );
  color: #c9d5ff;
  font-size: 0.8rem;
  font-weight: 650;
}

.cc-nav {
  display: grid;
  gap: 0.38rem;
  margin-top: 2rem;
}

.cc-nav > p {
  margin: 0 0 0.5rem;
  padding: 0 0.8rem;
  color: #5f6985;
  font-size: 0.66rem;
  font-weight: 760;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.cc-nav a {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 0.8rem;
  border: 1px solid transparent;
  border-radius: 0.82rem;
  padding: 0 0.8rem;
  color: #99a4c0;
  font-size: 0.88rem;
  font-weight: 620;
  transition: 150ms ease;
}

.cc-nav a:hover {
  border-color: var(--border);
  background: rgb(255 255 255 / 4%);
  color: white;
  transform: translateX(2px);
}

.cc-sidebar-footer {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-top: auto;
  border-top: 1px solid var(--border);
  padding-top: 1rem;
}

.cc-avatar {
  display: grid;
  width: 39px;
  height: 39px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(79 124 255 / 30%);
  border-radius: 0.8rem;
  background: linear-gradient(
    135deg,
    rgb(79 124 255 / 25%),
    rgb(139 92 246 / 25%)
  );
  color: white;
  font-size: 0.75rem;
  font-weight: 800;
}

.cc-sidebar-footer strong {
  font-size: 0.8rem;
}

.cc-sidebar-footer span {
  margin-top: 0.16rem;
  color: #6f7892;
  font-size: 0.68rem;
}

.cc-sidebar-footer button {
  width: 44px;
  min-height: 36px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.7rem;
  padding: 0.45rem;
  background: transparent;
  color: var(--muted);
  font-size: 0.65rem;
}

.cc-stage {
  min-width: 0;
}

.cc-topbar {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  min-height: 94px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  padding: 1rem clamp(1.2rem, 4vw, 3.5rem);
  background: rgb(6 7 19 / 76%);
  backdrop-filter: blur(24px);
}

.cc-topbar h1 {
  margin: 0.25rem 0 0;
  font-size: clamp(1.55rem, 2.5vw, 2.15rem);
  letter-spacing: -0.04em;
}

.cc-live-pill {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid rgb(66 232 173 / 18%);
  border-radius: 999px;
  padding: 0.58rem 0.82rem;
  background: rgb(66 232 173 / 7%);
  color: #a5f3d4;
  font-size: 0.72rem;
  font-weight: 690;
}

.cc-live-pill span {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--green);
  box-shadow: 0 0 14px var(--green);
}

.cc-content {
  width: min(1480px, 100%);
  margin-inline: auto;
  padding: clamp(1.3rem, 3vw, 3rem);
}

.metrics-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.metric-card {
  position: relative;
  display: flex;
  min-height: 148px;
  gap: 1rem;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 1.3rem;
  padding: 1.25rem;
  background: linear-gradient(
    145deg,
    rgb(17 22 43 / 90%),
    rgb(10 12 27 / 90%)
  );
}

.metric-card::after {
  position: absolute;
  top: -50px;
  right: -45px;
  width: 130px;
  height: 130px;
  border-radius: 999px;
  background: var(--metric-glow);
  content: "";
  filter: blur(28px);
  opacity: 0.4;
}

.metric-blue {
  --metric-glow: var(--blue);
}

.metric-violet {
  --metric-glow: var(--violet);
}

.metric-cyan {
  --metric-glow: var(--cyan);
}

.metric-rose {
  --metric-glow: var(--rose);
}

.metric-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 0.85rem;
  background: rgb(255 255 255 / 5%);
  color: #c6d4ff;
}

.metric-card p {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
}

.metric-card strong {
  display: block;
  margin-top: 0.55rem;
  font-size: 2rem;
  letter-spacing: -0.05em;
}

.metric-card span {
  display: block;
  margin-top: 0.35rem;
  color: #717b98;
  font-size: 0.7rem;
}

.dashboard-grid {
  display: grid;
  gap: 1.2rem;
  margin-top: 1.2rem;
  grid-template-columns: minmax(0, 1.45fr) minmax(340px, 0.55fr);
}

.glass-panel {
  border: 1px solid var(--border);
  border-radius: 1.35rem;
  background: var(--surface);
  box-shadow: 0 22px 70px rgb(0 0 0 / 16%);
  backdrop-filter: blur(18px);
}

.panel-padding {
  padding: 1.25rem;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.2rem;
}

.section-heading h2 {
  margin: 0.28rem 0 0;
  font-size: 1.35rem;
  letter-spacing: -0.035em;
}

.data-list {
  display: grid;
  gap: 0.5rem;
}

.data-row {
  display: grid;
  min-height: 72px;
  align-items: center;
  gap: 1rem;
  border: 1px solid transparent;
  border-radius: 0.95rem;
  padding: 0.8rem;
  grid-template-columns: minmax(0, 1.5fr) minmax(100px, 0.6fr) auto;
  transition: 150ms ease;
}

.data-row.single-column {
  grid-template-columns: 1fr;
}

.data-row:hover {
  border-color: var(--border);
  background: rgb(255 255 255 / 3%);
}

.data-row strong,
.data-row span,
.data-row small {
  display: block;
}

.data-row small {
  margin-top: 0.25rem;
  color: var(--muted);
}

.event-thumb {
  width: 52px;
  height: 52px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.8rem;
  background: linear-gradient(
    135deg,
    rgb(79 124 255 / 30%),
    rgb(139 92 246 / 25%)
  );
}

.event-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.event-title-cell {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.8rem;
}

.status-badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  border: 1px solid;
  border-radius: 999px;
  padding: 0.34rem 0.55rem;
  font-size: 0.62rem;
  font-weight: 780;
  letter-spacing: 0.04em;
}

.badge-success {
  border-color: rgb(66 232 173 / 22%);
  background: rgb(66 232 173 / 8%);
  color: #91f4cd;
}

.badge-warning {
  border-color: rgb(251 191 36 / 25%);
  background: rgb(251 191 36 / 8%);
  color: #f9d777;
}

.badge-info {
  border-color: rgb(34 211 238 / 25%);
  background: rgb(34 211 238 / 8%);
  color: #80eaff;
}

.badge-violet {
  border-color: rgb(139 92 246 / 28%);
  background: rgb(139 92 246 / 10%);
  color: #ccb6ff;
}

.badge-danger {
  border-color: rgb(251 113 133 / 26%);
  background: rgb(251 113 133 / 9%);
  color: #ffb3bf;
}

.badge-neutral {
  border-color: rgb(155 166 194 / 18%);
  background: rgb(155 166 194 / 7%);
  color: #adb6cd;
}

.quick-action-grid {
  display: grid;
  gap: 0.65rem;
}

.quick-action {
  display: flex;
  min-height: 72px;
  align-items: center;
  gap: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 0.95rem;
  padding: 0.85rem;
  background: rgb(255 255 255 / 2.5%);
  transition: 160ms ease;
}

.quick-action:hover {
  border-color: rgb(139 92 246 / 38%);
  background: rgb(139 92 246 / 7%);
  transform: translateY(-2px);
}

.quick-action > div:first-child {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 0.75rem;
  background: linear-gradient(
    135deg,
    rgb(79 124 255 / 20%),
    rgb(139 92 246 / 20%)
  );
  color: #becbff;
}

.quick-action strong,
.quick-action span {
  display: block;
}

.quick-action span {
  margin-top: 0.2rem;
  color: var(--muted);
  font-size: 0.72rem;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  align-items: center;
  margin-bottom: 1rem;
}

.filter-bar input,
.filter-bar select {
  min-height: 42px;
  border: 1px solid var(--border);
  border-radius: 0.8rem;
  padding: 0 0.8rem;
  background: #0d1122;
  color: white;
  outline: none;
}

.filter-bar input {
  min-width: 280px;
  flex: 1;
}

.empty-state {
  display: grid;
  min-height: 320px;
  place-items: center;
  align-content: center;
  padding: 2rem;
  text-align: center;
}

.empty-orbit {
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  border: 1px solid rgb(139 92 246 / 28%);
  border-radius: 999px;
  background: radial-gradient(circle, rgb(139 92 246 / 20%), transparent);
  color: #c6b4ff;
}

.empty-state h3 {
  margin: 1rem 0 0;
  font-size: 1.2rem;
}

.empty-state p {
  max-width: 440px;
  margin: 0.55rem 0 1.3rem;
  color: var(--muted);
  line-height: 1.6;
}

/* Form system */
.field {
  display: grid;
  gap: 0.45rem;
}

.field > span,
.toggle-field > span {
  color: #c9d0e5;
  font-size: 0.76rem;
  font-weight: 650;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 0.85rem;
  padding: 0.78rem 0.85rem;
  background: rgb(5 7 18 / 72%);
  color: white;
  outline: none;
  transition: 150ms ease;
}

.field textarea {
  resize: vertical;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: rgb(79 124 255 / 68%);
  box-shadow: 0 0 0 4px rgb(79 124 255 / 10%);
}

.field small {
  color: #747e98;
  font-size: 0.7rem;
}

.form-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.span-2 {
  grid-column: span 2;
}

.form-error {
  border: 1px solid rgb(251 113 133 / 28%);
  border-radius: 0.85rem;
  padding: 0.8rem;
  background: rgb(251 113 133 / 8%);
  color: #ffc0c9;
  font-size: 0.8rem;
}

.control-notification {
  position: fixed;
  top: max(1rem, env(safe-area-inset-top));
  right: max(1rem, env(safe-area-inset-right));
  z-index: 2000;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.85rem;
  align-items: start;
  width: min(430px, calc(100vw - 2rem));
  padding: 1rem;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 1rem;
  box-shadow:
    0 22px 70px rgb(0 0 0 / 55%),
    inset 0 1px 0 rgb(255 255 255 / 7%);
  backdrop-filter: blur(22px);
  animation: control-notification-enter 180ms ease-out;
}

.control-notification-error {
  border-color: rgb(251 113 133 / 48%);
  background:
    linear-gradient(135deg, rgb(93 24 48 / 96%), rgb(31 16 35 / 96%));
}

.control-notification-success {
  border-color: rgb(66 232 173 / 42%);
  background:
    linear-gradient(135deg, rgb(14 76 59 / 96%), rgb(12 35 31 / 96%));
}

.control-notification-info {
  border-color: rgb(79 124 255 / 46%);
  background:
    linear-gradient(135deg, rgb(24 49 105 / 96%), rgb(16 24 54 / 96%));
}

.control-notification-symbol {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 999px;
  color: #fff;
  font-size: 0.9rem;
  font-weight: 850;
}

.control-notification-copy {
  min-width: 0;
}

.control-notification-copy strong {
  display: block;
  color: #fff;
  font-size: 0.92rem;
}

.control-notification-copy p {
  margin: 0.28rem 0 0;
  color: rgb(255 255 255 / 78%);
  font-size: 0.82rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.control-notification-close {
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 72%);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.control-notification-close:hover {
  background: rgb(255 255 255 / 15%);
  color: #fff;
}

@keyframes control-notification-enter {
  from {
    opacity: 0;
    transform: translate3d(0, -12px, 0) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@media (max-width: 720px) {
  .control-notification {
    top: max(0.75rem, env(safe-area-inset-top));
    right: 0.75rem;
    left: 0.75rem;
    width: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .control-notification {
    animation: none;
  }
}

/* Tenant wizard */
.wizard {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 1.5rem;
  background: var(--surface);
  box-shadow: var(--shadow);
}

.wizard-progress {
  height: 3px;
  background: rgb(255 255 255 / 4%);
}

.wizard-progress div {
  height: 100%;
  background: linear-gradient(90deg, var(--blue), var(--violet), var(--cyan));
  transition: width 300ms ease;
}

.wizard-steps {
  display: grid;
  border-bottom: 1px solid var(--border);
  padding: 1rem;
  grid-template-columns: repeat(4, 1fr);
}

.wizard-steps button {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  border: 0;
  padding: 0.55rem;
  background: transparent;
  color: #69738e;
  font-size: 0.76rem;
  font-weight: 650;
}

.wizard-steps button span {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.68rem;
}

.wizard-steps button.active {
  color: white;
}

.wizard-steps button.active span {
  border-color: transparent;
  background: linear-gradient(135deg, var(--blue), var(--violet));
}

.wizard-panel {
  display: none;
  min-height: 500px;
  padding: clamp(1.5rem, 4vw, 3.5rem);
}

.wizard-panel.active {
  display: block;
  animation: panel-enter 260ms ease;
}

@keyframes panel-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.wizard-panel h2 {
  max-width: 700px;
  margin: 0.75rem 0 2rem;
  font-size: clamp(1.8rem, 4vw, 3.1rem);
  letter-spacing: -0.055em;
}

.wizard-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--border);
  padding: 1rem 1.5rem;
}

.table-preview {
  display: grid;
  gap: 0.65rem;
  margin-top: 1.4rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.table-preview div {
  display: grid;
  min-height: 72px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 0.9rem;
  background: rgb(255 255 255 / 3%);
  font-weight: 760;
}

.table-preview span {
  display: block;
  color: var(--muted);
  font-size: 0.65rem;
  font-weight: 500;
}

.table-editor-toolbar {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  margin-top: 1.5rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 1rem;
  background: rgb(255 255 255 / 2%);
}

.table-editor-toolbar div {
  display: grid;
  gap: 0.25rem;
}

.table-editor-toolbar span {
  color: var(--muted);
  font-size: 0.82rem;
}

.table-editor {
  display: grid;
  gap: 0.75rem;
  max-height: 460px;
  margin-top: 0.85rem;
  padding-right: 0.25rem;
  overflow: auto;
}

.table-editor-row {
  display: grid;
  grid-template-columns:
    42px minmax(110px, 0.7fr) minmax(170px, 1.4fr)
    minmax(90px, 0.45fr);
  gap: 0.75rem;
  align-items: end;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 1rem;
  background: rgb(255 255 255 / 2%);
}

.table-editor-row .field {
  margin: 0;
}

.table-editor-index {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  align-self: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 760;
}

@media (max-width: 760px) {
  .table-editor-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .table-editor-row {
    grid-template-columns: 42px 1fr;
  }

  .table-editor-row .field {
    grid-column: 2;
  }

  .table-editor-index {
    grid-row: 1 / span 3;
  }
}

.success-canvas {
  display: grid;
  min-height: 620px;
  place-items: center;
  align-content: center;
  border: 1px solid rgb(66 232 173 / 18%);
  border-radius: 1.5rem;
  padding: 3rem;
  background:
    radial-gradient(circle at 50% 35%, rgb(66 232 173 / 12%), transparent 20rem),
    var(--surface);
  text-align: center;
}

.success-ring {
  display: grid;
  width: 90px;
  height: 90px;
  margin-bottom: 1.4rem;
  place-items: center;
  border: 1px solid rgb(66 232 173 / 30%);
  border-radius: 999px;
  background: rgb(66 232 173 / 9%);
  color: var(--green);
}

.success-canvas h2 {
  margin: 0.65rem 0;
  font-size: 2.5rem;
  letter-spacing: -0.055em;
}

.success-canvas > p:not(.eyebrow) {
  max-width: 620px;
  color: var(--muted);
  line-height: 1.7;
}

.success-grid {
  display: grid;
  width: min(680px, 100%);
  gap: 0.8rem;
  margin: 1.5rem 0;
  grid-template-columns: repeat(3, 1fr);
}

.success-grid div {
  border: 1px solid var(--border);
  border-radius: 0.9rem;
  padding: 0.9rem;
  background: rgb(255 255 255 / 3%);
}

.success-grid span,
.success-grid strong {
  display: block;
}

.success-grid span {
  color: var(--muted);
  font-size: 0.7rem;
}

.success-grid strong {
  margin-top: 0.3rem;
  font-size: 0.82rem;
}

/* Event Studio */
.event-editor {
  padding-bottom: 6rem;
}

.editor-hero {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 1.2rem;
  border: 1px solid var(--border);
  border-radius: 1.5rem;
  padding: clamp(1.5rem, 4vw, 3rem);
  background:
    radial-gradient(circle at 90% 20%, rgb(139 92 246 / 18%), transparent 20rem),
    linear-gradient(145deg, rgb(20 26 51 / 88%), rgb(9 11 25 / 88%));
}

.editor-hero h2 {
  max-width: 720px;
  margin: 0.65rem 0 0;
  font-size: clamp(2rem, 4vw, 3.8rem);
  letter-spacing: -0.06em;
  line-height: 1.02;
}

.editor-hero > div:first-child > p:last-child {
  max-width: 650px;
  color: var(--muted);
  line-height: 1.65;
}

.event-live-preview {
  min-width: 210px;
  border: 1px solid rgb(34 211 238 / 20%);
  border-radius: 1rem;
  padding: 1rem;
  background: rgb(34 211 238 / 6%);
}

.event-live-preview span,
.event-live-preview strong,
.event-live-preview small {
  display: block;
}

.event-live-preview span,
.event-live-preview small {
  color: var(--muted);
  font-size: 0.68rem;
}

.event-live-preview strong {
  margin: 0.35rem 0;
  font-size: 2.4rem;
}

.editor-grid {
  display: grid;
  gap: 1.1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.editor-card {
  border: 1px solid var(--border);
  border-radius: 1.3rem;
  padding: clamp(1.2rem, 3vw, 2rem);
  background: var(--surface);
}

.editor-card-title {
  display: flex;
  gap: 0.9rem;
  margin-bottom: 1.5rem;
}

.editor-card-title > span {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 0.8rem;
  color: #9db6ff;
  font-size: 0.72rem;
  font-weight: 780;
}

.editor-card-title h3 {
  margin: 0;
  font-size: 1.08rem;
}

.editor-card-title p {
  margin: 0.3rem 0 0;
  color: var(--muted);
  font-size: 0.76rem;
}

.table-selector {
  display: grid;
  gap: 0.7rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.table-selector button,
.table-selector > div {
  display: grid;
  min-height: 110px;
  border: 1px solid var(--border);
  border-radius: 0.95rem;
  padding: 0.8rem;
  background: rgb(255 255 255 / 2.5%);
  color: white;
  text-align: left;
}

.table-selector button:hover,
.table-selector button.selected,
.table-selector > div.selected {
  border-color: rgb(79 124 255 / 58%);
  background: linear-gradient(
    145deg,
    rgb(79 124 255 / 13%),
    rgb(139 92 246 / 9%)
  );
}

.table-selector span {
  color: #8da8ff;
  font-size: 0.68rem;
  font-weight: 780;
}

.table-selector strong {
  margin-top: 0.35rem;
}

.table-selector small {
  align-self: end;
  color: var(--muted);
}

.toggle-field {
  display: flex;
  min-height: 75px;
  align-items: center;
  gap: 0.8rem;
  border: 1px solid var(--border);
  border-radius: 0.9rem;
  padding: 0.8rem;
  background: rgb(255 255 255 / 2.5%);
}

.toggle-field input {
  width: 18px;
  height: 18px;
  accent-color: var(--blue);
}

.toggle-field small {
  display: block;
  margin-top: 0.2rem;
  color: var(--muted);
}

.sticky-submit {
  position: fixed;
  z-index: 30;
  right: clamp(1rem, 3vw, 3rem);
  bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 2rem;
  border: 1px solid rgb(139 92 246 / 38%);
  border-radius: 1rem;
  padding: 0.7rem 0.7rem 0.7rem 1rem;
  background: rgb(10 13 29 / 90%);
  box-shadow: 0 20px 70px rgb(0 0 0 / 45%);
  backdrop-filter: blur(24px);
}

.sticky-submit span,
.sticky-submit strong {
  display: block;
}

.sticky-submit span {
  color: var(--muted);
  font-size: 0.68rem;
}

.sticky-submit strong {
  margin-top: 0.2rem;
  font-size: 0.78rem;
}

/* Event detail */
.detail-hero {
  position: relative;
  overflow: hidden;
  min-height: 330px;
  border: 1px solid var(--border);
  border-radius: 1.5rem;
  background:
    linear-gradient(90deg, rgb(7 9 20 / 96%) 20%, rgb(7 9 20 / 52%)),
    var(--detail-cover),
    linear-gradient(135deg, #18244f, #2c1450);
  background-position: center;
  background-size: cover;
}

.detail-hero-content {
  display: flex;
  min-height: 330px;
  max-width: 760px;
  flex-direction: column;
  justify-content: end;
  padding: clamp(1.5rem, 5vw, 3.5rem);
}

.detail-hero h2 {
  margin: 0.75rem 0 0;
  font-size: clamp(2.3rem, 5vw, 5rem);
  letter-spacing: -0.065em;
  line-height: 0.96;
}

.detail-hero p {
  color: #c5cbe0;
  line-height: 1.65;
}

.detail-meta-grid {
  display: grid;
  gap: 1rem;
  margin-top: 1.2rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.detail-meta-grid article {
  border: 1px solid var(--border);
  border-radius: 1rem;
  padding: 1rem;
  background: var(--surface);
}

.detail-meta-grid span,
.detail-meta-grid strong {
  display: block;
}

.detail-meta-grid span {
  color: var(--muted);
  font-size: 0.72rem;
}

.detail-meta-grid strong {
  margin-top: 0.45rem;
}

@media (max-width: 1180px) {
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hero {
    grid-template-columns: 1fr;
  }

  .hero-system {
    width: min(720px, 100%);
  }

  .trust-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .table-selector {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 900px) {
  .control-center {
    display: block;
  }

  .cc-sidebar {
    position: static;
    width: 100%;
    height: auto;
  }

  .cc-nav {
    display: flex;
    overflow-x: auto;
  }

  .cc-nav > p {
    display: none;
  }

  .cc-nav a {
    flex: 0 0 auto;
  }

  .cc-sidebar-footer {
    display: none;
  }

  .dashboard-grid,
  .login-stage {
    grid-template-columns: 1fr;
  }

  .login-visual {
    min-height: 55vh;
  }

  .login-panel {
    min-height: auto;
    padding: 4rem 1.5rem;
  }

  .editor-grid {
    grid-template-columns: 1fr;
  }

  .editor-card.span-2 {
    grid-column: span 1;
  }

  .detail-meta-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .public-nav .nav-link,
  .cc-live-pill {
    display: none;
  }

  .hero {
    padding-top: 3rem;
  }

  .hero-copy h1 {
    font-size: 3.5rem;
  }

  .hero-system {
    min-height: 430px;
  }

  .system-window {
    inset: 1rem 0 0;
  }

  .system-body {
    grid-template-columns: 1fr;
  }

  .system-sidebar-demo {
    display: none;
  }

  .floating-signal {
    right: 0;
  }

  .trust-row,
  .metrics-grid,
  .form-grid,
  .success-grid,
  .detail-meta-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: span 1;
  }

  .wizard-steps {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .wizard-steps button {
    justify-content: center;
    font-size: 0;
  }

  .table-preview,
  .table-selector {
    grid-template-columns: repeat(2, 1fr);
  }

  .editor-hero {
    align-items: stretch;
    flex-direction: column;
  }

  .sticky-submit {
    right: 0.65rem;
    bottom: 0.65rem;
    left: 0.65rem;
    justify-content: space-between;
  }

  .sticky-submit > div {
    display: none;
  }

  .sticky-submit button {
    width: 100%;
  }

  .data-row {
    grid-template-columns: 1fr auto;
  }

  .data-row > div:nth-child(2) {
    display: none;
  }

  .filter-bar input {
    min-width: 100%;
  }
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\globals.css') `
    -Content $content_apps_web_app_globals_css `
    -AllowExisting `
    -DryRun:$DryRun

$content_apps_web_app_layout_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Fluxa — Venue Operating System',
    template: '%s · Fluxa',
  },
  description:
    'Il sistema operativo per eventi, prenotazioni, tavoli e operatività dei locali.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\layout.tsx') `
    -Content $content_apps_web_app_layout_tsx `
    -AllowExisting `
    -DryRun:$DryRun

$content_apps_web_app_merchant_events__eventId__edit_page_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { EventForm } from '@/components/merchant/event-form';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type {
  EventDetail,
  LocationSummary,
} from '@/lib/control-center/types';

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const [event, locations] = await Promise.all([
    authenticatedFluxaFetch<EventDetail>(`/events/${eventId}`),
    authenticatedFluxaFetch<LocationSummary[]>('/locations'),
  ]);

  return <EventForm event={event} locations={locations} />;
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\merchant\events\[eventId]\edit\page.tsx') `
    -Content $content_apps_web_app_merchant_events__eventId__edit_page_tsx `
    -DryRun:$DryRun

$content_apps_web_app_merchant_events__eventId__page_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { EventActions } from '@/components/merchant/event-actions';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { EventDetail } from '@/lib/control-center/types';

function date(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));
}

function euro(cents: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await authenticatedFluxaFetch<EventDetail>(
    `/events/${eventId}`,
  );
  const cover = event.coverImageUrl
    ? `url("${event.coverImageUrl.replaceAll('"', '%22')}")`
    : 'none';

  return (
    <>
      <div
        className="detail-hero"
        style={{ '--detail-cover': cover } as CSSProperties}
      >
        <div className="detail-hero-content">
          <StatusBadge status={event.status} />
          <h2>{event.title}</h2>
          <p>{event.description}</p>
          <div className="page-actions">
            {event.status === 'DRAFT' ? (
              <Link
                className="button-secondary"
                href={`/merchant/events/${event.id}/edit`}
              >
                Modifica
              </Link>
            ) : null}
            <EventActions eventId={event.id} status={event.status} />
          </div>
        </div>
      </div>

      <div className="detail-meta-grid">
        <article>
          <span>Data evento</span>
          <strong>{date(event.startsAt)}</strong>
        </article>
        <article>
          <span>Deposito</span>
          <strong>{euro(event.bookingAmountCents)}</strong>
        </article>
        <article>
          <span>Capienza</span>
          <strong>{event.capacity} ospiti</strong>
        </article>
        <article>
          <span>Inventario</span>
          <strong>{event.tables.length} tavoli</strong>
        </article>
      </div>

      <div className="dashboard-grid">
        <section className="glass-panel panel-padding">
          <p className="eyebrow">Table inventory</p>
          <h2>Tavoli abilitati</h2>
          <div className="table-selector mt-5">
            {event.tables.map((table) => (
              <div className="selected" key={table.diningTableId}>
                <span>{table.tableCode}</span>
                <strong>{table.tableName}</strong>
                <small>
                  {table.tableCapacity} posti · {table.areaName}
                </small>
              </div>
            ))}
          </div>
        </section>

        <aside className="glass-panel panel-padding">
          <p className="eyebrow">Booking rules</p>
          <h2>Regole attive</h2>
          {event.bookingRules ? (
            <div className="data-list mt-5">
              <div className="data-row single-column">
                <div>
                  <strong>Party size</strong>
                  <small>
                    {event.bookingRules.minPartySize}–
                    {event.bookingRules.maxPartySize} persone
                  </small>
                </div>
              </div>
              <div className="data-row single-column">
                <div>
                  <strong>Hold</strong>
                  <small>{event.bookingRules.holdMinutes} minuti</small>
                </div>
              </div>
              <div className="data-row single-column">
                <div>
                  <strong>Telefono</strong>
                  <small>
                    {event.bookingRules.requirePhone
                      ? 'Obbligatorio'
                      : 'Facoltativo'}
                  </small>
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\merchant\events\[eventId]\page.tsx') `
    -Content $content_apps_web_app_merchant_events__eventId__page_tsx `
    -DryRun:$DryRun

$content_apps_web_app_merchant_events_new_page_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { EventForm } from '@/components/merchant/event-form';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { LocationSummary } from '@/lib/control-center/types';

export default async function NewEventPage() {
  const locations =
    await authenticatedFluxaFetch<LocationSummary[]>('/locations');

  return <EventForm locations={locations} />;
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\merchant\events\new\page.tsx') `
    -Content $content_apps_web_app_merchant_events_new_page_tsx `
    -DryRun:$DryRun

$content_apps_web_app_merchant_events_page_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import Link from 'next/link';
import {
  EmptyState,
  SectionHeading,
} from '@/components/control-center/shell';
import { Icon } from '@/components/control-center/icons';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import type {
  EventListResponse,
  LocationSummary,
} from '@/lib/control-center/types';

function date(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function euro(cents: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    locationId?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const session = await requireMerchantSession();
  const params = await searchParams;
  const locations =
    await authenticatedFluxaFetch<LocationSummary[]>('/locations');
  const membership = session.availableOrganizations.find(
    (organization) =>
      organization.organizationId === session.session.organizationId,
  );
  const locationId =
    params.locationId ?? membership?.defaultLocationId ?? locations[0]?.id;

  if (!locationId) {
    return (
      <div className="glass-panel">
        <EmptyState
          description="Crea o assegna una sede prima di configurare gli eventi."
          title="Nessuna sede disponibile"
        />
      </div>
    );
  }

  const query = new URLSearchParams({
    locationId,
    pageSize: '100',
  });

  if (params.status) query.set('status', params.status);
  if (params.q) query.set('q', params.q);

  const events = await authenticatedFluxaFetch<EventListResponse>(
    `/events?${query}`,
  );

  return (
    <section className="glass-panel panel-padding">
      <SectionHeading
        action={
          <Link className="button-primary" href="/merchant/events/new">
            <Icon name="plus" />
            Nuovo evento
          </Link>
        }
        eyebrow="Event portfolio"
        title={`${events.total} eventi`}
      />

      <form className="filter-bar">
        <select defaultValue={locationId} name="locationId">
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <input
          defaultValue={params.q}
          name="q"
          placeholder="Cerca titolo o slug…"
        />
        <select defaultValue={params.status ?? ''} name="status">
          <option value="">Tutti gli stati</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Pubblicati</option>
          <option value="SOLD_OUT">Sold out</option>
          <option value="CANCELLED">Annullati</option>
          <option value="COMPLETED">Completati</option>
          <option value="ARCHIVED">Archiviati</option>
        </select>
        <button className="button-secondary" type="submit">
          <Icon name="search" />
          Filtra
        </button>
      </form>

      {events.items.length ? (
        <div className="data-list">
          {events.items.map((event) => (
            <Link
              className="data-row"
              href={`/merchant/events/${event.id}`}
              key={event.id}
            >
              <div className="event-title-cell">
                <div className="event-thumb">
                  {event.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" src={event.coverImageUrl} />
                  ) : null}
                </div>
                <div>
                  <strong>{event.title}</strong>
                  <small>
                    {event.slug} · {date(event.startsAt)}
                  </small>
                </div>
              </div>
              <div>
                <span>{event.capacity} posti</span>
                <small>{euro(event.bookingAmountCents)}</small>
              </div>
              <StatusBadge status={event.status} />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          action={
            <Link className="button-primary" href="/merchant/events/new">
              Crea un evento
            </Link>
          }
          description="Nessun evento corrisponde ai filtri selezionati."
          title="Nessun risultato"
        />
      )}
    </section>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\merchant\events\page.tsx') `
    -Content $content_apps_web_app_merchant_events_page_tsx `
    -DryRun:$DryRun

$content_apps_web_app_merchant_layout_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import type { ReactNode } from 'react';
import { ControlCenterShell } from '@/components/control-center/shell';
import { requireMerchantSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const nav = [
  { href: '/merchant', label: 'Panoramica', icon: 'dashboard' as const },
  { href: '/merchant/events', label: 'Eventi', icon: 'calendar' as const },
  {
    href: '/merchant/reservations',
    label: 'Prenotazioni',
    icon: 'ticket' as const,
  },
];

export default async function MerchantLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await requireMerchantSession();

  return (
    <ControlCenterShell
      mode="merchant"
      nav={nav}
      organizations={session.availableOrganizations}
      session={session}
      subtitle={`${session.organization?.name ?? 'Workspace'} · ${session.session.role ?? ''}`}
      title="Venue Control Center"
    >
      {children}
    </ControlCenterShell>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\merchant\layout.tsx') `
    -Content $content_apps_web_app_merchant_layout_tsx `
    -AllowExisting `
    -DryRun:$DryRun

$content_apps_web_app_merchant_page_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import Link from 'next/link';
import {
  EmptyState,
  MetricCard,
  SectionHeading,
} from '@/components/control-center/shell';
import { Icon } from '@/components/control-center/icons';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import type { MerchantOverview } from '@/lib/control-center/types';

function euro(cents: string | number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(cents) / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function MerchantDashboardPage() {
  const session = await requireMerchantSession();
  const membership = session.availableOrganizations.find(
    (organization) =>
      organization.organizationId === session.session.organizationId,
  );
  const locationId = membership?.defaultLocationId;

  if (!locationId) {
    return (
      <div className="glass-panel">
        <EmptyState
          description="Assegna una sede predefinita al tuo account per aprire il Control Center."
          title="Nessuna sede operativa"
        />
      </div>
    );
  }

  const overview = await authenticatedFluxaFetch<MerchantOverview>(
    `/control-center/merchant-overview?locationId=${locationId}`,
  );

  return (
    <>
      <div className="metrics-grid">
        <MetricCard
          accent="blue"
          hint={`${overview.metrics.upcomingEvents} in programma`}
          icon="calendar"
          label="Eventi"
          value={overview.metrics.events}
        />
        <MetricCard
          accent="violet"
          hint={`${overview.metrics.publishedEvents} pubblicati`}
          icon="ticket"
          label="Prenotazioni"
          value={overview.metrics.reservations}
        />
        <MetricCard
          accent="cyan"
          hint="Confermati e serviti"
          icon="users"
          label="Ospiti"
          value={overview.metrics.confirmedGuests}
        />
        <MetricCard
          accent={overview.metrics.refundPending > 0 ? 'rose' : 'blue'}
          hint={`${overview.metrics.refundPending} rimborsi da gestire`}
          icon="money"
          label="Volume incassato"
          value={euro(overview.metrics.paidVolumeCents)}
        />
      </div>

      <div className="dashboard-grid">
        <section className="glass-panel panel-padding">
          <SectionHeading
            action={
              <Link className="button-secondary" href="/merchant/events">
                Tutti gli eventi
              </Link>
            }
            eyebrow="Live portfolio"
            title="Eventi recenti"
          />

          {overview.recentEvents.length ? (
            <div className="data-list">
              {overview.recentEvents.map((event) => (
                <Link
                  className="data-row"
                  href={`/merchant/events/${event.id}`}
                  key={event.id}
                >
                  <div className="event-title-cell">
                    <div className="event-thumb">
                      {event.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" src={event.coverImageUrl} />
                      ) : null}
                    </div>
                    <div>
                      <strong>{event.title}</strong>
                      <small>{date(event.startsAt)}</small>
                    </div>
                  </div>
                  <div>
                    <span>{event.capacity} posti</span>
                    <small>{euro(event.bookingAmountCents)}</small>
                  </div>
                  <StatusBadge status={event.status} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              action={
                <Link className="button-primary" href="/merchant/events/new">
                  Crea il primo evento
                </Link>
              }
              description="Configura tavoli, regole e deposito in un unico flusso."
              title="Il calendario è ancora vuoto"
            />
          )}
        </section>

        <aside className="glass-panel panel-padding">
          <SectionHeading eyebrow="Next move" title="Azioni rapide" />
          <div className="quick-action-grid">
            <Link className="quick-action" href="/merchant/events/new">
              <div>
                <Icon name="plus" />
              </div>
              <div>
                <strong>Nuovo evento</strong>
                <span>Apri l’Event Studio</span>
              </div>
            </Link>
            <Link className="quick-action" href="/merchant/reservations">
              <div>
                <Icon name="ticket" />
              </div>
              <div>
                <strong>Prenotazioni</strong>
                <span>Clienti, tavoli e stati</span>
              </div>
            </Link>
          </div>

          <SectionHeading eyebrow="Latest" title="Ultime prenotazioni" />
          <div className="data-list">
            {overview.recentReservations.slice(0, 5).map((reservation) => (
              <div className="data-row" key={reservation.id}>
                <div>
                  <strong>{reservation.customerName}</strong>
                  <small>{reservation.eventTitle}</small>
                </div>
                <div>
                  <span>{reservation.partySize} persone</span>
                  <small>{reservation.tableName ?? 'Auto-assign'}</small>
                </div>
                <StatusBadge status={reservation.status} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\merchant\page.tsx') `
    -Content $content_apps_web_app_merchant_page_tsx `
    -AllowExisting `
    -DryRun:$DryRun

$content_apps_web_app_merchant_reservations_page_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import {
  EmptyState,
  SectionHeading,
} from '@/components/control-center/shell';
import { Icon } from '@/components/control-center/icons';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import type {
  LocationSummary,
  ReservationListResponse,
} from '@/lib/control-center/types';

function euro(cents: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    locationId?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const session = await requireMerchantSession();
  const params = await searchParams;
  const locations =
    await authenticatedFluxaFetch<LocationSummary[]>('/locations');
  const membership = session.availableOrganizations.find(
    (organization) =>
      organization.organizationId === session.session.organizationId,
  );
  const locationId =
    params.locationId ?? membership?.defaultLocationId ?? locations[0]?.id;

  if (!locationId) {
    return (
      <div className="glass-panel">
        <EmptyState
          description="Serve una sede attiva per visualizzare le prenotazioni."
          title="Nessuna sede disponibile"
        />
      </div>
    );
  }

  const query = new URLSearchParams({
    locationId,
    pageSize: '100',
  });

  if (params.status) query.set('status', params.status);
  if (params.q) query.set('q', params.q);

  const reservations =
    await authenticatedFluxaFetch<ReservationListResponse>(
      `/control-center/reservations?${query}`,
    );

  return (
    <section className="glass-panel panel-padding">
      <SectionHeading
        eyebrow="Guest ledger"
        title={`${reservations.total} prenotazioni`}
      />

      <form className="filter-bar">
        <select defaultValue={locationId} name="locationId">
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <input
          defaultValue={params.q}
          name="q"
          placeholder="Nome, email, codice o evento…"
        />
        <select defaultValue={params.status ?? ''} name="status">
          <option value="">Tutti gli stati</option>
          <option value="PENDING_PAYMENT">Pagamento pendente</option>
          <option value="CONFIRMED">Confermate</option>
          <option value="CHECKED_IN">Check-in</option>
          <option value="SEATED">Al tavolo</option>
          <option value="COMPLETED">Completate</option>
          <option value="REFUND_PENDING">Rimborso pendente</option>
          <option value="REFUNDED">Rimborsate</option>
          <option value="CANCELLED">Annullate</option>
        </select>
        <button className="button-secondary" type="submit">
          <Icon name="search" />
          Filtra
        </button>
      </form>

      {reservations.items.length ? (
        <div className="data-list">
          {reservations.items.map((reservation) => (
            <div className="data-row" key={reservation.id}>
              <div>
                <strong>{reservation.customerName}</strong>
                <small>
                  {reservation.confirmationCode} · {reservation.eventTitle}
                </small>
              </div>
              <div>
                <span>
                  {reservation.partySize} persone ·{' '}
                  {reservation.tableName ?? 'Auto-assign'}
                </span>
                <small>
                  {euro(reservation.amountCents)} ·{' '}
                  {date(reservation.createdAt)}
                </small>
              </div>
              <StatusBadge status={reservation.status} />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          description="Le nuove prenotazioni compariranno qui. Il realtime visuale arriverà nella fase dedicata."
          title="Nessuna prenotazione"
        />
      )}
    </section>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\merchant\reservations\page.tsx') `
    -Content $content_apps_web_app_merchant_reservations_page_tsx `
    -DryRun:$DryRun

$content_apps_web_app_platform_admin_layout_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import type { ReactNode } from 'react';
import { ControlCenterShell } from '@/components/control-center/shell';
import { requirePlatformAdminSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const nav = [
  {
    href: '/platform-admin',
    label: 'Panoramica',
    icon: 'dashboard' as const,
  },
  {
    href: '/platform-admin/organizations',
    label: 'Organizzazioni',
    icon: 'building' as const,
  },
  {
    href: '/platform-admin/organizations/new',
    label: 'Nuovo tenant',
    icon: 'plus' as const,
  },
];

export default async function PlatformAdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await requirePlatformAdminSession();

  return (
    <ControlCenterShell
      mode="platform"
      nav={nav}
      session={session}
      subtitle="Global operations"
      title="Platform Control Center"
    >
      {children}
    </ControlCenterShell>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\platform-admin\layout.tsx') `
    -Content $content_apps_web_app_platform_admin_layout_tsx `
    -AllowExisting `
    -DryRun:$DryRun

$content_apps_web_app_platform_admin_organizations__organizationId__page_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import {
  MetricCard,
  SectionHeading,
} from '@/components/control-center/shell';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { PlatformOrganizationDetail } from '@/lib/control-center/types';

function euro(cents: string) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(cents) / 100);
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const detail = await authenticatedFluxaFetch<PlatformOrganizationDetail>(
    `/platform/organizations/${organizationId}`,
  );

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading
          action={<StatusBadge status={detail.organization.status} />}
          eyebrow={detail.organization.slug}
          title={detail.organization.name}
        />
        <p className="muted">
          Tenant ID {detail.organization.id} · creato da{' '}
          {detail.organization.createdByEmail ?? 'Fluxa Platform'}
        </p>
      </section>

      <div className="metrics-grid mt-5">
        <MetricCard
          hint={`${detail.metrics.locations} sedi`}
          icon="building"
          label="Merchant"
          value={detail.metrics.merchants}
        />
        <MetricCard
          accent="violet"
          hint="Account collegati"
          icon="users"
          label="Membri"
          value={detail.metrics.members}
        />
        <MetricCard
          accent="cyan"
          hint={`${detail.metrics.reservations} prenotazioni`}
          icon="calendar"
          label="Eventi"
          value={detail.metrics.events}
        />
        <MetricCard
          accent="blue"
          hint="Pagamenti Stripe"
          icon="money"
          label="Volume"
          value={euro(detail.metrics.paidVolumeCents)}
        />
      </div>

      <div className="dashboard-grid">
        <section className="glass-panel panel-padding">
          <SectionHeading eyebrow="Locations" title="Sedi operative" />
          <div className="data-list">
            {detail.locations.map((location) => (
              <div className="data-row" key={location.id}>
                <div>
                  <strong>{location.name}</strong>
                  <small>
                    {location.code} · {location.city}
                  </small>
                </div>
                <div>
                  <span>{location.timezone}</span>
                  <small>{location.province ?? '—'}</small>
                </div>
                <StatusBadge status={location.status} />
              </div>
            ))}
          </div>
        </section>

        <aside className="glass-panel panel-padding">
          <SectionHeading eyebrow="People" title="Membri" />
          <div className="data-list">
            {detail.members.map((member) => (
              <div className="data-row" key={member.membershipId}>
                <div>
                  <strong>{member.displayName}</strong>
                  <small>{member.email}</small>
                </div>
                <div>
                  <span>{member.role}</span>
                  <small>
                    {member.defaultLocationName ?? 'Nessuna sede'}
                  </small>
                </div>
                <StatusBadge status={member.status} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\platform-admin\organizations\[organizationId]\page.tsx') `
    -Content $content_apps_web_app_platform_admin_organizations__organizationId__page_tsx `
    -DryRun:$DryRun

$content_apps_web_app_platform_admin_organizations_new_page_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { PlatformOnboardingForm } from '@/components/platform/onboarding-form';

export default function NewOrganizationPage() {
  return <PlatformOnboardingForm />;
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\platform-admin\organizations\new\page.tsx') `
    -Content $content_apps_web_app_platform_admin_organizations_new_page_tsx `
    -DryRun:$DryRun

$content_apps_web_app_platform_admin_organizations_page_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import Link from 'next/link';
import { Icon } from '@/components/control-center/icons';
import { SectionHeading } from '@/components/control-center/shell';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { OrganizationListItem } from '@/lib/control-center/types';

export default async function OrganizationsPage() {
  const organizations =
    await authenticatedFluxaFetch<OrganizationListItem[]>('/organizations');

  return (
    <section className="glass-panel panel-padding">
      <SectionHeading
        action={
          <Link
            className="button-primary"
            href="/platform-admin/organizations/new"
          >
            <Icon name="plus" />
            Nuova organizzazione
          </Link>
        }
        eyebrow="Tenant directory"
        title={`${organizations.length} organizzazioni`}
      />

      <div className="data-list">
        {organizations.map((organization) => (
          <Link
            className="data-row"
            href={`/platform-admin/organizations/${organization.id}`}
            key={organization.id}
          >
            <div className="event-title-cell">
              <div className="cc-avatar">
                {organization.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <strong>{organization.name}</strong>
                <small>{organization.slug}</small>
              </div>
            </div>
            <div>
              <span>{organization.id}</span>
            </div>
            <StatusBadge status={organization.status} />
          </Link>
        ))}
      </div>
    </section>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\platform-admin\organizations\page.tsx') `
    -Content $content_apps_web_app_platform_admin_organizations_page_tsx `
    -DryRun:$DryRun

$content_apps_web_app_platform_admin_page_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import Link from 'next/link';
import { Icon } from '@/components/control-center/icons';
import {
  MetricCard,
  SectionHeading,
} from '@/components/control-center/shell';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { PlatformOverview } from '@/lib/control-center/types';

function euro(cents: string) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(cents) / 100);
}

export default async function PlatformAdminPage() {
  const overview =
    await authenticatedFluxaFetch<PlatformOverview>('/platform/overview');

  return (
    <>
      <div className="metrics-grid">
        <MetricCard
          accent="blue"
          hint={`${overview.metrics.activeOrganizations} attive`}
          icon="building"
          label="Organizzazioni"
          value={overview.metrics.organizations}
        />
        <MetricCard
          accent="violet"
          hint="Account globali"
          icon="users"
          label="Utenti"
          value={overview.metrics.users}
        />
        <MetricCard
          accent="cyan"
          hint={`${overview.metrics.reservations} prenotazioni`}
          icon="calendar"
          label="Eventi"
          value={overview.metrics.events}
        />
        <MetricCard
          accent={overview.metrics.refundPending ? 'rose' : 'blue'}
          hint={`${overview.metrics.refundPending} refund pending`}
          icon="money"
          label="Volume pagato"
          value={euro(overview.metrics.paidVolumeCents)}
        />
      </div>

      <div className="dashboard-grid">
        <section className="glass-panel panel-padding">
          <SectionHeading
            action={
              <Link
                className="button-secondary"
                href="/platform-admin/organizations"
              >
                Tutti i tenant
              </Link>
            }
            eyebrow="Tenant network"
            title="Ultime organizzazioni"
          />
          <div className="data-list">
            {overview.recentOrganizations.map((organization) => (
              <Link
                className="data-row"
                href={`/platform-admin/organizations/${organization.id}`}
                key={organization.id}
              >
                <div className="event-title-cell">
                  <div className="cc-avatar">
                    {organization.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <strong>{organization.name}</strong>
                    <small>{organization.slug}</small>
                  </div>
                </div>
                <div>
                  <span>{organization.createdByEmail ?? 'Fluxa Platform'}</span>
                  <small>
                    {new Intl.DateTimeFormat('it-IT').format(
                      new Date(organization.createdAt),
                    )}
                  </small>
                </div>
                <StatusBadge status={organization.status} />
              </Link>
            ))}
          </div>
        </section>

        <aside className="glass-panel panel-padding">
          <SectionHeading eyebrow="Launchpad" title="Azioni piattaforma" />
          <div className="quick-action-grid">
            <Link
              className="quick-action"
              href="/platform-admin/organizations/new"
            >
              <div>
                <Icon name="sparkles" />
              </div>
              <div>
                <strong>Onboarding atomico</strong>
                <span>Tenant, owner, sede e tavoli</span>
              </div>
            </Link>
            <Link
              className="quick-action"
              href="/platform-admin/organizations"
            >
              <div>
                <Icon name="building" />
              </div>
              <div>
                <strong>Tenant directory</strong>
                <span>Stato e dettaglio organizzazioni</span>
              </div>
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\app\platform-admin\page.tsx') `
    -Content $content_apps_web_app_platform_admin_page_tsx `
    -AllowExisting `
    -DryRun:$DryRun

$content_apps_web_components_auth_login_form_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/control-center/icons';
import { ControlCenterNotification } from '@/components/control-center/notification';

interface LoginOrganization {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
}

interface LoginResult {
  user?: { platformAdmin?: boolean };
  organization?: { id: string } | null;
  code?: string;
  message?: string;
  details?: { organizations?: LoginOrganization[] };
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [organizations, setOrganizations] = useState<LoginOrganization[]>([]);
  const [credentials, setCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);

  async function login(
    email: string,
    password: string,
    organizationId?: string,
  ) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(organizationId ? { organizationId } : {}),
        }),
      });
      const payload = (await response.json()) as LoginResult;

      if (!response.ok) {
        const available = payload.details?.organizations;

        if (
          payload.code === 'ORGANIZATION_SELECTION_REQUIRED' &&
          available?.length
        ) {
          setCredentials({ email, password });
          setOrganizations(available);
          return;
        }

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
      setError('Il server Fluxa non è raggiungibile.');
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await login(
      String(form.get('email') ?? ''),
      String(form.get('password') ?? ''),
    );
  }

  if (organizations.length > 0 && credentials) {
    return (
      <div className="organization-choice">
        <ControlCenterNotification
          message={error}
          onDismiss={() => setError(null)}
          title="Accesso non riuscito"
        />
        <p className="eyebrow">Scegli workspace</p>
        <h2>Dove vuoi entrare?</h2>
        <p>Il tuo account è collegato a più organizzazioni.</p>
        <div className="organization-choice-list">
          {organizations.map((organization) => (
            <button
              disabled={pending}
              key={organization.organizationId}
              onClick={() =>
                void login(
                  credentials.email,
                  credentials.password,
                  organization.organizationId,
                )
              }
              type="button"
            >
              <span>
                <strong>{organization.organizationName}</strong>
                <small>
                  {organization.role} · {organization.organizationSlug}
                </small>
              </span>
              <Icon name="arrow" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Accesso non riuscito"
      />
      <label className="field">
        <span>Email</span>
        <input
          autoComplete="email"
          name="email"
          placeholder="nome@azienda.it"
          required
          type="email"
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          autoComplete="current-password"
          minLength={8}
          name="password"
          placeholder="••••••••••••"
          required
          type="password"
        />
      </label>
      <button
        className="button-primary login-submit"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Accesso sicuro…' : 'Entra in Fluxa'}
        <Icon name="arrow" />
      </button>
      <p className="login-security">
        Sessione protetta con token HttpOnly e isolamento tenant.
      </p>
    </form>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\auth\login-form.tsx') `
    -Content $content_apps_web_components_auth_login_form_tsx `
    -AllowExisting `
    -DryRun:$DryRun

$content_apps_web_components_brand_fluxa_mark_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import type { SVGProps } from 'react';

export function FluxaMark({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 48 48"
      {...props}
    >
      <defs>
        <linearGradient id="fluxa-a" x1="6" x2="42" y1="7" y2="42">
          <stop stopColor="#8B5CF6" />
          <stop offset=".52" stopColor="#4F7CFF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <path
        d="M12.2 7.5h24.1c3.7 0 5.8 4.2 3.6 7.2L27.7 31.4a4.5 4.5 0 0 1-7.3 0L8.5 14.7c-2.2-3 .1-7.2 3.7-7.2Z"
        fill="url(#fluxa-a)"
      />
      <path d="M24 14.5 31.5 25H16.7L24 14.5Z" fill="white" fillOpacity=".94" />
      <path
        d="M16 37.8h16"
        stroke="url(#fluxa-a)"
        strokeLinecap="round"
        strokeWidth="4"
      />
    </svg>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\brand\fluxa-mark.tsx') `
    -Content $content_apps_web_components_brand_fluxa_mark_tsx `
    -DryRun:$DryRun

$content_apps_web_components_control_center_icons_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'dashboard'
  | 'building'
  | 'calendar'
  | 'ticket'
  | 'plus'
  | 'arrow'
  | 'users'
  | 'sparkles'
  | 'money'
  | 'search';

const paths: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect height="7" rx="2" width="7" x="3" y="3" />
      <rect height="7" rx="2" width="7" x="14" y="3" />
      <rect height="7" rx="2" width="7" x="3" y="14" />
      <rect height="7" rx="2" width="7" x="14" y="14" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16M17 9h2a2 2 0 0 1 2 2v10M2 21h20" />
      <path d="M8 7h1M12 7h1M8 11h1M12 11h1M8 15h1M12 15h1" />
    </>
  ),
  calendar: (
    <>
      <rect height="18" rx="3" width="18" x="3" y="4" />
      <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3Z" />
      <path d="M13 5v2M13 11v2M13 17v2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  arrow: <path d="m9 18 6-6-6-6" />,
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3-1.2 3.2L7.5 7.5l3.3 1.3L12 12l1.2-3.2 3.3-1.3-3.3-1.3L12 3Z" />
      <path d="m19 13-.8 2.2-2.2.8 2.2.8L19 19l.8-2.2 2.2-.8-2.2-.8L19 13ZM5 14l-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8L5 14Z" />
    </>
  ),
  money: (
    <>
      <rect height="14" rx="2" width="20" x="2" y="5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 9h.01M18 15h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
};

export function Icon({
  name,
  className = 'h-5 w-5',
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\control-center\icons.tsx') `
    -Content $content_apps_web_components_control_center_icons_tsx `
    -DryRun:$DryRun

$content_apps_web_components_control_center_organization_switcher_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AvailableOrganization } from '@/lib/auth/auth-types';

export function OrganizationSwitcher({
  organizations,
  currentOrganizationId,
}: {
  organizations: AvailableOrganization[];
  currentOrganizationId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function changeOrganization(organizationId: string) {
    if (!organizationId || organizationId === currentOrganizationId) return;
    setPending(true);

    try {
      const response = await fetch('/api/auth/switch-organization', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });

      if (!response.ok) throw new Error('Cambio organizzazione non riuscito.');
      router.replace('/merchant');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <label className="org-switcher">
      <span>Workspace</span>
      <select
        aria-label="Cambia organizzazione"
        disabled={pending}
        onChange={(event) => void changeOrganization(event.target.value)}
        value={currentOrganizationId}
      >
        {organizations.map((organization) => (
          <option
            key={organization.organizationId}
            value={organization.organizationId}
          >
            {organization.organizationName}
          </option>
        ))}
      </select>
    </label>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\control-center\organization-switcher.tsx') `
    -Content $content_apps_web_components_control_center_organization_switcher_tsx `
    -DryRun:$DryRun

$content_apps_web_components_control_center_shell_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
import type { ReactNode } from 'react';
import Link from 'next/link';
import { FluxaMark } from '@/components/brand/fluxa-mark';
import { Icon, type IconName } from '@/components/control-center/icons';
import { OrganizationSwitcher } from '@/components/control-center/organization-switcher';
import { LogoutButton } from '@/components/auth/logout-button';
import type {
  AuthenticatedSession,
  AvailableOrganization,
} from '@/lib/auth/auth-types';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export function ControlCenterShell({
  children,
  title,
  subtitle,
  nav,
  session,
  mode,
  organizations,
}: {
  children: ReactNode;
  title: string;
  subtitle: string;
  nav: NavItem[];
  session: AuthenticatedSession;
  mode: 'platform' | 'merchant';
  organizations?: AvailableOrganization[];
}) {
  return (
    <div className="control-center">
      <aside className="cc-sidebar">
        <Link
          className="cc-brand"
          href={mode === 'platform' ? '/platform-admin' : '/merchant'}
        >
          <span className="cc-brand-mark">
            <FluxaMark className="h-9 w-9" />
          </span>
          <span>
            <strong>Fluxa</strong>
            <small>{mode === 'platform' ? 'Platform OS' : 'Venue OS'}</small>
          </span>
        </Link>

        {mode === 'merchant' &&
        session.organization &&
        organizations &&
        organizations.length > 0 ? (
          <OrganizationSwitcher
            currentOrganizationId={session.organization.id}
            organizations={organizations}
          />
        ) : (
          <div className="platform-pill">
            <Icon className="h-4 w-4" name="sparkles" />
            Platform control
          </div>
        )}

        <nav className="cc-nav">
          <p>Control center</p>
          {nav.map((item) => (
            <Link href={item.href} key={item.href}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="cc-sidebar-footer">
          <div className="cc-avatar">
            {session.user.displayName
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')
              .toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <strong className="block truncate">{session.user.displayName}</strong>
            <span className="block truncate">{session.user.email}</span>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <div className="cc-stage">
        <header className="cc-topbar">
          <div>
            <p className="eyebrow">{subtitle}</p>
            <h1>{title}</h1>
          </div>
          <div className="cc-live-pill">
            <span />
            sistemi operativi
          </div>
        </header>
        <main className="cc-content">{children}</main>
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  icon,
  accent = 'blue',
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: IconName;
  accent?: 'blue' | 'violet' | 'cyan' | 'rose';
}) {
  return (
    <article className={`metric-card metric-${accent}`}>
      <div className="metric-icon">
        <Icon name={icon} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{hint}</span>
      </div>
    </article>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-orbit">
        <Icon name="sparkles" />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\control-center\shell.tsx') `
    -Content $content_apps_web_components_control_center_shell_tsx `
    -DryRun:$DryRun

$content_apps_web_components_control_center_notification_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
'use client';

interface ControlCenterNotificationProps {
  message: string | null;
  title?: string;
  tone?: 'error' | 'success' | 'info';
  onDismiss?: () => void;
}

export function ControlCenterNotification({
  message,
  title = 'Attenzione',
  tone = 'error',
  onDismiss,
}: ControlCenterNotificationProps) {
  if (!message) return null;

  return (
    <div
      aria-atomic="true"
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`control-notification control-notification-${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span aria-hidden="true" className="control-notification-symbol">
        {tone === 'error' ? '!' : tone === 'success' ? '✓' : 'i'}
      </span>
      <div className="control-notification-copy">
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {onDismiss ? (
        <button
          aria-label="Chiudi notifica"
          className="control-notification-close"
          onClick={onDismiss}
          type="button"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\control-center\notification.tsx') `
    -Content $content_apps_web_components_control_center_notification_tsx `
    -DryRun:$DryRun

$content_apps_web_lib_control_center_event_form_validation_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER

export interface EventDateWindowInput {
  startsAt: FormDataEntryValue | null;
  endsAt: FormDataEntryValue | null;
  bookingOpensAt: FormDataEntryValue | null;
  bookingClosesAt: FormDataEntryValue | null;
}

export interface EventDateWindow {
  startsAt: string;
  endsAt: string;
  bookingOpensAt: string;
  bookingClosesAt: string;
}

function parseRequiredLocalDateTime(
  value: FormDataEntryValue | null,
  label: string,
): Date {
  const raw = typeof value === 'string' ? value.trim() : '';

  if (!raw) {
    throw new Error(`${label}: inserisci data e ora.`);
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label}: data e ora non valide.`);
  }

  return parsed;
}

export function parseEventDateWindow(
  input: EventDateWindowInput,
): EventDateWindow {
  const startsAt = parseRequiredLocalDateTime(
    input.startsAt,
    'Inizio evento',
  );
  const endsAt = parseRequiredLocalDateTime(input.endsAt, 'Fine evento');
  const bookingOpensAt = parseRequiredLocalDateTime(
    input.bookingOpensAt,
    'Apertura prenotazioni',
  );
  const bookingClosesAt = parseRequiredLocalDateTime(
    input.bookingClosesAt,
    'Chiusura prenotazioni',
  );

  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error(
      'La fine dell’evento deve essere successiva all’inizio.',
    );
  }

  if (bookingOpensAt.getTime() >= bookingClosesAt.getTime()) {
    throw new Error(
      'L’apertura delle prenotazioni deve precedere la chiusura.',
    );
  }

  if (bookingClosesAt.getTime() > startsAt.getTime()) {
    throw new Error(
      'La chiusura delle prenotazioni non può essere successiva all’inizio dell’evento.',
    );
  }

  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    bookingOpensAt: bookingOpensAt.toISOString(),
    bookingClosesAt: bookingClosesAt.toISOString(),
  };
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\lib\control-center\event-form-validation.ts') `
    -Content $content_apps_web_lib_control_center_event_form_validation_ts `
    -DryRun:$DryRun

$content_apps_web_lib_control_center_event_form_validation_test_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { describe, expect, it } from 'vitest';
import { parseEventDateWindow } from './event-form-validation';

describe('parseEventDateWindow', () => {
  it('converts a valid local window to ISO strings', () => {
    const result = parseEventDateWindow({
      startsAt: '2026-08-01T20:00',
      endsAt: '2026-08-02T02:00',
      bookingOpensAt: '2026-07-20T10:00',
      bookingClosesAt: '2026-08-01T19:00',
    });

    expect(result.startsAt).toContain('2026-08-01T');
    expect(result.endsAt).toContain('2026-08-02T');
  });

  it('returns a friendly error for an invalid date', () => {
    expect(() =>
      parseEventDateWindow({
        startsAt: 'not-a-date',
        endsAt: '2026-08-02T02:00',
        bookingOpensAt: '2026-07-20T10:00',
        bookingClosesAt: '2026-08-01T19:00',
      }),
    ).toThrow('Inizio evento: data e ora non valide.');
  });

  it('rejects an event ending before it starts', () => {
    expect(() =>
      parseEventDateWindow({
        startsAt: '2026-08-02T02:00',
        endsAt: '2026-08-01T20:00',
        bookingOpensAt: '2026-07-20T10:00',
        bookingClosesAt: '2026-08-01T19:00',
      }),
    ).toThrow(
      'La fine dell’evento deve essere successiva all’inizio.',
    );
  });

  it('rejects a booking closing time after event start', () => {
    expect(() =>
      parseEventDateWindow({
        startsAt: '2026-08-01T20:00',
        endsAt: '2026-08-02T02:00',
        bookingOpensAt: '2026-07-20T10:00',
        bookingClosesAt: '2026-08-01T21:00',
      }),
    ).toThrow(
      'La chiusura delle prenotazioni non può essere successiva all’inizio dell’evento.',
    );
  });
});
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\lib\control-center\event-form-validation.test.ts') `
    -Content $content_apps_web_lib_control_center_event_form_validation_test_ts `
    -DryRun:$DryRun

$content_apps_web_components_control_center_status_badge_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
const tones: Record<string, string> = {
  ACTIVE: 'badge-success',
  PUBLISHED: 'badge-success',
  CONFIRMED: 'badge-success',
  COMPLETED: 'badge-neutral',
  DRAFT: 'badge-warning',
  PENDING_PAYMENT: 'badge-warning',
  CHECKED_IN: 'badge-info',
  SEATED: 'badge-info',
  SOLD_OUT: 'badge-violet',
  REFUND_PENDING: 'badge-danger',
  CANCELLED: 'badge-danger',
  EXPIRED: 'badge-neutral',
  NO_SHOW: 'badge-neutral',
  REFUNDED: 'badge-violet',
  SUSPENDED: 'badge-danger',
  ARCHIVED: 'badge-neutral',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge ${tones[status] ?? 'badge-neutral'}`}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\control-center\status-badge.tsx') `
    -Content $content_apps_web_components_control_center_status_badge_tsx `
    -DryRun:$DryRun

$content_apps_web_components_merchant_event_actions_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/control-center/icons';
import { ControlCenterNotification } from '@/components/control-center/notification';
import type { EventStatus } from '@/lib/control-center/types';

export function EventActions({
  eventId,
  status,
}: {
  eventId: string;
  status: EventStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function action(actionName: 'publish' | 'cancel' | 'archive') {
    setPending(actionName);
    setError(null);

    const response = await fetch(
      `/api/control-center/merchant/events/${eventId}/action`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: actionName,
          ...(actionName === 'cancel'
            ? { reason: 'Annullato dal Control Center Fluxa' }
            : {}),
        }),
      },
    );
    const payload = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(payload.message ?? 'Operazione non riuscita.');
      setPending(null);
      return;
    }

    if (actionName === 'archive') {
      router.push('/merchant/events');
    } else {
      router.refresh();
    }

    setPending(null);
  }

  return (
    <div className="event-actions">
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Operazione non riuscita"
      />
      {status === 'DRAFT' ? (
        <button
          className="button-primary"
          disabled={Boolean(pending)}
          onClick={() => void action('publish')}
          type="button"
        >
          {pending === 'publish' ? 'Pubblicazione…' : 'Pubblica evento'}
          <Icon name="sparkles" />
        </button>
      ) : null}
      {status === 'PUBLISHED' || status === 'SOLD_OUT' ? (
        <button
          className="button-danger"
          disabled={Boolean(pending)}
          onClick={() => void action('cancel')}
          type="button"
        >
          {pending === 'cancel' ? 'Annullamento…' : 'Annulla evento'}
        </button>
      ) : null}
      {status === 'DRAFT' || status === 'CANCELLED' ? (
        <button
          className="button-secondary"
          disabled={Boolean(pending)}
          onClick={() => void action('archive')}
          type="button"
        >
          Archivia
        </button>
      ) : null}
    </div>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\merchant\event-actions.tsx') `
    -Content $content_apps_web_components_merchant_event_actions_tsx `
    -DryRun:$DryRun

$content_apps_web_components_merchant_event_form_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/control-center/icons';
import { ControlCenterNotification } from '@/components/control-center/notification';
import { parseEventDateWindow } from '@/lib/control-center/event-form-validation';
import type {
  DiningTableSummary,
  EventDetail,
  LocationSummary,
} from '@/lib/control-center/types';

function localDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 16);
}

export function EventForm({
  locations,
  event,
}: {
  locations: LocationSummary[];
  event?: EventDetail;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(
    event?.locationId ?? locations[0]?.id ?? '',
  );
  const [tables, setTables] = useState<DiningTableSummary[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>(
    event?.tables
      .filter((table) => table.enabled)
      .map((table) => table.diningTableId) ?? [],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCapacity = useMemo(
    () =>
      tables
        .filter((table) => selectedTables.includes(table.id))
        .reduce((sum, table) => sum + table.capacity, 0),
    [selectedTables, tables],
  );

  useEffect(() => {
    if (!locationId) return;
    const controller = new AbortController();
    fetch(`/api/control-center/merchant/tables?locationId=${locationId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Tavoli non disponibili.');
        return (await response.json()) as DiningTableSummary[];
      })
      .then((rows) =>
        setTables(rows.filter((table) => table.status === 'ACTIVE')),
      )
      .catch((requestError: unknown) => {
        if (
          requestError instanceof DOMException &&
          requestError.name === 'AbortError'
        ) {
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Tavoli non disponibili.',
        );
      })
;

    return () => controller.abort();
  }, [locationId]);

  function toggleTable(tableId: string) {
    setSelectedTables((current) =>
      current.includes(tableId)
        ? current.filter((id) => id !== tableId)
        : [...current, tableId],
    );
  }

  async function submit(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setPending(true);
    setError(null);

    try {
      const form = new FormData(submitEvent.currentTarget);
      const dateWindow = parseEventDateWindow({
        startsAt: form.get('startsAt'),
        endsAt: form.get('endsAt'),
        bookingOpensAt: form.get('bookingOpensAt'),
        bookingClosesAt: form.get('bookingClosesAt'),
      });
      const body = {
        locationId,
        title: String(form.get('title') ?? ''),
        slug: String(form.get('slug') ?? '') || undefined,
        description: String(form.get('description') ?? ''),
        timezone: String(form.get('timezone') ?? 'Europe/Rome'),
        coverImageUrl:
          String(form.get('coverImageUrl') ?? '') || undefined,
        ...dateWindow,
        bookingAmountCents: Math.round(
          Number(form.get('bookingAmountEuro')) * 100,
        ),
        currency: 'EUR',
        capacity: Number(form.get('capacity')),
        cancellationPolicy:
          String(form.get('cancellationPolicy') ?? '') || undefined,
        bookingRules: {
          minPartySize: Number(form.get('minPartySize')),
          maxPartySize: Number(form.get('maxPartySize')),
          holdMinutes: Number(form.get('holdMinutes')),
          bookingCutoffMinutes: Number(
            form.get('bookingCutoffMinutes'),
          ),
          cancellationCutoffMinutes: Number(
            form.get('cancellationCutoffMinutes'),
          ),
          autoAssignSmallestTable: true,
          allowManualAssignment: true,
          requirePhone: form.get('requirePhone') === 'on',
        },
        tableIds: selectedTables,
      };

      const endpoint = event
        ? `/api/control-center/merchant/events/${event.id}`
        : '/api/control-center/merchant/events';
      const response = await fetch(endpoint, {
        method: event ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        id?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(payload.message ?? 'Salvataggio evento non riuscito.');
        return;
      }

      const eventId = event?.id ?? payload.id;

      if (!eventId) {
        throw new Error('Identificativo evento mancante.');
      }

      router.push(`/merchant/events/${eventId}`);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Salvataggio evento non riuscito.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="event-editor" noValidate onSubmit={submit}>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title={event ? 'Evento non aggiornato' : 'Evento non creato'}
      />
      <section className="editor-hero">
        <div>
          <p className="eyebrow">Event studio</p>
          <h2>
            {event
              ? 'Modifica esperienza'
              : 'Crea qualcosa che riempia la sala.'}
          </h2>
          <p>
            Contenuti, disponibilità e regole restano allineati con il motore
            transazionale Fluxa.
          </p>
        </div>
        <div className="event-live-preview">
          <span>Capienza tavoli selezionati</span>
          <strong>{selectedCapacity}</strong>
          <small>Capienza evento dichiarata sotto</small>
        </div>
      </section>

      <div className="editor-grid">
        <section className="editor-card span-2">
          <div className="editor-card-title">
            <span>01</span>
            <div>
              <h3>Identità dell’evento</h3>
              <p>Il primo impatto che vedrà il cliente.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field span-2">
              <span>Titolo</span>
              <input
                defaultValue={event?.title}
                minLength={3}
                name="title"
                placeholder="Midnight Garden"
                required
              />
            </label>
            <label className="field">
              <span>Slug</span>
              <input defaultValue={event?.slug} name="slug" />
            </label>
            <label className="field">
              <span>Immagine cover URL</span>
              <input
                defaultValue={event?.coverImageUrl ?? ''}
                name="coverImageUrl"
                placeholder="https://..."
                type="url"
              />
            </label>
            <label className="field span-2">
              <span>Descrizione</span>
              <textarea
                defaultValue={event?.description}
                name="description"
                required
                rows={6}
              />
            </label>
          </div>
        </section>

        <section className="editor-card">
          <div className="editor-card-title">
            <span>02</span>
            <div>
              <h3>Luogo</h3>
              <p>Sede e fuso orario operativo.</p>
            </div>
          </div>
          <label className="field">
            <span>Sede</span>
            <select
              disabled={Boolean(event)}
              onChange={(changeEvent) => {
                setLocationId(changeEvent.target.value);
                setSelectedTables([]);
              }}
              value={locationId}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} · {location.city}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Timezone</span>
            <input
              defaultValue={event?.timezone ?? 'Europe/Rome'}
              name="timezone"
              required
            />
          </label>
        </section>

        <section className="editor-card">
          <div className="editor-card-title">
            <span>03</span>
            <div>
              <h3>Calendario</h3>
              <p>Evento e finestra di vendita.</p>
            </div>
          </div>
          <label className="field">
            <span>Inizio evento</span>
            <input
              defaultValue={localDateTime(event?.startsAt)}
              name="startsAt"
              required
              type="datetime-local"
            />
          </label>
          <label className="field">
            <span>Fine evento</span>
            <input
              defaultValue={localDateTime(event?.endsAt)}
              name="endsAt"
              required
              type="datetime-local"
            />
          </label>
          <label className="field">
            <span>Apertura prenotazioni</span>
            <input
              defaultValue={localDateTime(event?.bookingOpensAt)}
              name="bookingOpensAt"
              required
              type="datetime-local"
            />
          </label>
          <label className="field">
            <span>Chiusura prenotazioni</span>
            <input
              defaultValue={localDateTime(event?.bookingClosesAt)}
              name="bookingClosesAt"
              required
              type="datetime-local"
            />
          </label>
        </section>

        <section className="editor-card span-2">
          <div className="editor-card-title">
            <span>04</span>
            <div>
              <h3>Tavoli e capacità</h3>
              <p>Scegli l’inventario bloccabile dal motore prenotazioni.</p>
            </div>
          </div>
          <div className="table-selector">
            {tables.map((table) => {
              const selected = selectedTables.includes(table.id);

              return (
                <button
                  className={selected ? 'selected' : ''}
                  key={table.id}
                  onClick={() => toggleTable(table.id)}
                  type="button"
                >
                  <span>{table.code}</span>
                  <strong>{table.name}</strong>
                  <small>
                    {table.capacity} posti · {table.areaName}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="form-grid mt-5">
            <label className="field">
              <span>Capienza evento</span>
              <input
                defaultValue={event?.capacity ?? Math.max(selectedCapacity, 1)}
                min={1}
                name="capacity"
                required
                type="number"
              />
            </label>
            <label className="field">
              <span>Deposito per prenotazione (€)</span>
              <input
                defaultValue={
                  event ? (event.bookingAmountCents / 100).toFixed(2) : '10.00'
                }
                min={0}
                name="bookingAmountEuro"
                required
                step="0.01"
                type="number"
              />
            </label>
          </div>
        </section>

        <section className="editor-card span-2">
          <div className="editor-card-title">
            <span>05</span>
            <div>
              <h3>Regole operative</h3>
              <p>Controllano hold, cutoff e assegnazione.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Minimo persone</span>
              <input
                defaultValue={event?.bookingRules?.minPartySize ?? 1}
                min={1}
                name="minPartySize"
                type="number"
              />
            </label>
            <label className="field">
              <span>Massimo persone</span>
              <input
                defaultValue={event?.bookingRules?.maxPartySize ?? 8}
                min={1}
                name="maxPartySize"
                type="number"
              />
            </label>
            <label className="field">
              <span>Durata hold</span>
              <input
                defaultValue={event?.bookingRules?.holdMinutes ?? 15}
                min={1}
                name="holdMinutes"
                type="number"
              />
            </label>
            <label className="field">
              <span>Cutoff prenotazione</span>
              <input
                defaultValue={event?.bookingRules?.bookingCutoffMinutes ?? 60}
                min={0}
                name="bookingCutoffMinutes"
                type="number"
              />
            </label>
            <label className="field">
              <span>Cutoff cancellazione</span>
              <input
                defaultValue={
                  event?.bookingRules?.cancellationCutoffMinutes ?? 1440
                }
                min={0}
                name="cancellationCutoffMinutes"
                type="number"
              />
            </label>
            <label className="toggle-field">
              <input
                defaultChecked={event?.bookingRules?.requirePhone ?? true}
                name="requirePhone"
                type="checkbox"
              />
              <span>
                Telefono obbligatorio
                <small>Richiedilo nel checkout pubblico.</small>
              </span>
            </label>
            <label className="field span-2">
              <span>Policy di cancellazione</span>
              <textarea
                defaultValue={event?.cancellationPolicy ?? ''}
                name="cancellationPolicy"
                rows={4}
              />
            </label>
          </div>
        </section>
      </div>

      <div className="sticky-submit">
        <div>
          <span>{event ? 'Aggiornamento evento' : 'Nuovo draft'}</span>
          <strong>
            {selectedTables.length} tavoli · {selectedCapacity} posti
          </strong>
        </div>
        <button className="button-primary" disabled={pending} type="submit">
          {pending
            ? 'Salvataggio…'
            : event
              ? 'Salva modifiche'
              : 'Crea evento'}
          <Icon name={event ? 'sparkles' : 'plus'} />
        </button>
      </div>
    </form>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\merchant\event-form.tsx') `
    -Content $content_apps_web_components_merchant_event_form_tsx `
    -DryRun:$DryRun

$content_apps_web_components_platform_onboarding_form_tsx = @'
// PHASE_8_TRUE_CONTROL_CENTER
'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/control-center/icons';
import { ControlCenterNotification } from '@/components/control-center/notification';

interface OnboardingResult {
  organization: { id: string; name: string; slug: string };
  owner: { email: string; displayName: string };
  location: { name: string };
  tables: Array<{ id: string }>;
}

interface EditableTable {
  code: string;
  name: string;
  capacity: number;
}

function createTable(index: number, capacity: number): EditableTable {
  return {
    code: `T${index + 1}`,
    name: `Tavolo ${index + 1}`,
    capacity,
  };
}

export function PlatformOnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [defaultTableCapacity, setDefaultTableCapacity] = useState(4);
  const [tables, setTables] = useState<EditableTable[]>(() =>
    Array.from({ length: 8 }, (_, index) => createTable(index, 4)),
  );
  const progress = useMemo(() => `${(step / 4) * 100}%`, [step]);

  function resizeTables(nextCount: number) {
    const safeCount = Math.min(100, Math.max(1, nextCount || 1));

    setTables((current) =>
      Array.from(
        { length: safeCount },
        (_, index) =>
          current[index] ?? createTable(index, defaultTableCapacity),
      ),
    );
  }

  function updateTable(index: number, patch: Partial<EditableTable>) {
    setTables((current) =>
      current.map((table, tableIndex) =>
        tableIndex === index ? { ...table, ...patch } : table,
      ),
    );
  }

  function applyCapacityToAll() {
    setTables((current) =>
      current.map((table) => ({
        ...table,
        capacity: defaultTableCapacity,
      })),
    );
  }

  function slugify(value: string) {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const ownerEmail = String(form.get('ownerEmail') ?? '')
      .trim()
      .toLowerCase();
    const ownerDisplayName = String(
      form.get('ownerDisplayName') ?? '',
    ).trim();
    const ownerTemporaryPassword = String(
      form.get('ownerTemporaryPassword') ?? '',
    );
    const legalName = String(form.get('legalName') ?? '').trim();
    const tradeName = String(form.get('tradeName') ?? '').trim();
    const vatNumber = String(form.get('vatNumber') ?? '').trim();
    const taxCode = String(form.get('taxCode') ?? '').trim();
    const locationCode = String(form.get('locationCode') ?? '')
      .trim()
      .toUpperCase();
    const locationName = String(form.get('locationName') ?? '').trim();
    const addressLine1 = String(form.get('addressLine1') ?? '').trim();
    const addressLine2 = String(form.get('addressLine2') ?? '').trim();
    const postalCode = String(form.get('postalCode') ?? '').trim();
    const city = String(form.get('city') ?? '').trim();
    const province = String(form.get('province') ?? '')
      .trim()
      .toUpperCase();
    const areaCode = String(form.get('areaCode') ?? '')
      .trim()
      .toUpperCase();
    const areaName = String(form.get('areaName') ?? '').trim();

    function reject(targetStep: number, message: string) {
      setStep(targetStep);
      setError(message);
      setPending(false);
    }

    if (
      organizationName.trim().length < 2 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug) ||
      !legalName ||
      !vatNumber
    ) {
      reject(
        1,
        'Completa nome, slug, ragione sociale e partita IVA.',
      );
      return;
    }

    if (
      !ownerDisplayName ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) ||
      ownerTemporaryPassword.length < 12
    ) {
      reject(
        2,
        'Controlla nome, email e password OWNER di almeno 12 caratteri.',
      );
      return;
    }

    if (
      !locationCode ||
      !locationName ||
      !addressLine1 ||
      !postalCode ||
      !city
    ) {
      reject(3, 'Completa tutti i dati obbligatori della sede.');
      return;
    }

    if (!areaCode || !areaName) {
      reject(4, 'Completa codice e nome dell’area.');
      return;
    }

    const normalizedTables = tables.map((table) => ({
      code: table.code.trim().toUpperCase(),
      name: table.name.trim(),
      capacity: table.capacity,
    }));
    const tableCodes = normalizedTables.map((table) => table.code);

    if (
      normalizedTables.some(
        (table) =>
          !table.code ||
          !table.name ||
          !Number.isInteger(table.capacity) ||
          table.capacity < 1 ||
          table.capacity > 100,
      )
    ) {
      reject(4, 'Controlla codice, nome e posti di ogni tavolo.');
      return;
    }

    if (new Set(tableCodes).size !== tableCodes.length) {
      reject(4, 'I codici dei tavoli devono essere univoci.');
      return;
    }

    const payload = {
      organizationName: organizationName.trim(),
      organizationSlug,
      ownerEmail,
      ownerDisplayName,
      ownerTemporaryPassword,
      legalName,
      tradeName: tradeName || undefined,
      vatNumber,
      taxCode: taxCode || undefined,
      countryCode: 'IT',
      locationCode,
      locationName,
      addressLine1,
      addressLine2: addressLine2 || undefined,
      postalCode,
      city,
      province: province || undefined,
      timezone: 'Europe/Rome',
      areaCode,
      areaName,
      tables: normalizedTables,
    };

    try {
      const response = await fetch('/api/control-center/platform/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as
        | OnboardingResult
        | { message?: string };

      if (!response.ok) {
        setError(
          'message' in body && body.message
            ? body.message
            : 'Onboarding non completato.',
        );
        return;
      }

      setResult(body as OnboardingResult);
      router.refresh();
    } catch {
      setError('Control Center non raggiungibile.');
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className="success-canvas">
        <div className="success-ring">
          <Icon className="h-9 w-9" name="sparkles" />
        </div>
        <p className="eyebrow">Tenant online</p>
        <h2>{result.organization.name} è pronta.</h2>
        <p>
          Organizzazione, account OWNER, sede, sala e {result.tables.length}{' '}
          tavoli creati in una singola transazione.
        </p>
        <div className="success-grid">
          <div>
            <span>Owner</span>
            <strong>{result.owner.email}</strong>
          </div>
          <div>
            <span>Sede</span>
            <strong>{result.location.name}</strong>
          </div>
          <div>
            <span>Slug</span>
            <strong>{result.organization.slug}</strong>
          </div>
        </div>
        <button
          className="button-primary"
          onClick={() =>
            router.push(
              `/platform-admin/organizations/${result.organization.id}`,
            )
          }
          type="button"
        >
          Apri il tenant
          <Icon name="arrow" />
        </button>
      </div>
    );
  }

  return (
    <form className="wizard" noValidate onSubmit={submit}>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Controlla i dati inseriti"
      />
      <div className="wizard-progress">
        <div style={{ width: progress }} />
      </div>
      <div className="wizard-steps">
        {['Identità', 'Titolare', 'Sede', 'Layout'].map((label, index) => (
          <button
            className={step === index + 1 ? 'active' : ''}
            key={label}
            onClick={() => setStep(index + 1)}
            type="button"
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </div>

      <section className={step === 1 ? 'wizard-panel active' : 'wizard-panel'}>
        <p className="eyebrow">01 · Identità tenant</p>
        <h2>Diamo un’identità al nuovo workspace.</h2>
        <div className="form-grid">
          <label className="field span-2">
            <span>Nome organizzazione</span>
            <input
              minLength={2}
              onChange={(changeEvent) => {
                setOrganizationName(changeEvent.target.value);
                setOrganizationSlug(slugify(changeEvent.target.value));
              }}
              placeholder="Lumen Hospitality"
              required
              value={organizationName}
            />
          </label>
          <label className="field span-2">
            <span>Slug pubblico</span>
            <input
              minLength={3}
              onChange={(changeEvent) =>
                setOrganizationSlug(changeEvent.target.value)
              }
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
              value={organizationSlug}
            />
          </label>
          <label className="field">
            <span>Ragione sociale</span>
            <input name="legalName" required />
          </label>
          <label className="field">
            <span>Nome commerciale</span>
            <input name="tradeName" />
          </label>
          <label className="field">
            <span>Partita IVA</span>
            <input name="vatNumber" required />
          </label>
          <label className="field">
            <span>Codice fiscale</span>
            <input name="taxCode" />
          </label>
        </div>
      </section>

      <section className={step === 2 ? 'wizard-panel active' : 'wizard-panel'}>
        <p className="eyebrow">02 · Account OWNER</p>
        <h2>Creiamo l’accesso del titolare.</h2>
        <div className="form-grid">
          <label className="field span-2">
            <span>Nome completo</span>
            <input name="ownerDisplayName" required />
          </label>
          <label className="field span-2">
            <span>Email di accesso</span>
            <input name="ownerEmail" required type="email" />
          </label>
          <label className="field span-2">
            <span>Password temporanea</span>
            <input
              minLength={12}
              name="ownerTemporaryPassword"
              required
              type="password"
            />
            <small>Almeno 12 caratteri. Comunicala al titolare in modo sicuro.</small>
          </label>
        </div>
      </section>

      <section className={step === 3 ? 'wizard-panel active' : 'wizard-panel'}>
        <p className="eyebrow">03 · Prima sede</p>
        <h2>Configuriamo il punto operativo principale.</h2>
        <div className="form-grid">
          <label className="field">
            <span>Codice sede</span>
            <input defaultValue="MAIN" name="locationCode" required />
          </label>
          <label className="field">
            <span>Nome sede</span>
            <input name="locationName" required />
          </label>
          <label className="field span-2">
            <span>Indirizzo</span>
            <input name="addressLine1" required />
          </label>
          <label className="field span-2">
            <span>Dettagli indirizzo</span>
            <input name="addressLine2" />
          </label>
          <label className="field">
            <span>CAP</span>
            <input name="postalCode" required />
          </label>
          <label className="field">
            <span>Città</span>
            <input name="city" required />
          </label>
          <label className="field">
            <span>Provincia</span>
            <input maxLength={8} name="province" />
          </label>
        </div>
      </section>

      <section className={step === 4 ? 'wizard-panel active' : 'wizard-panel'}>
        <p className="eyebrow">04 · Layout iniziale</p>
        <h2>Configura ogni tavolo prima di attivare il locale.</h2>
        <div className="form-grid">
          <label className="field">
            <span>Codice area</span>
            <input defaultValue="SALA" name="areaCode" required />
          </label>
          <label className="field">
            <span>Nome area</span>
            <input defaultValue="Sala principale" name="areaName" required />
          </label>
          <label className="field">
            <span>Numero tavoli</span>
            <input
              max={100}
              min={1}
              onChange={(changeEvent) =>
                resizeTables(Number(changeEvent.target.value))
              }
              type="number"
              value={tables.length}
            />
          </label>
          <label className="field">
            <span>Posti predefiniti per nuovi tavoli</span>
            <input
              max={100}
              min={1}
              onChange={(changeEvent) =>
                setDefaultTableCapacity(
                  Math.min(
                    100,
                    Math.max(1, Number(changeEvent.target.value) || 1),
                  ),
                )
              }
              type="number"
              value={defaultTableCapacity}
            />
          </label>
        </div>

        <div className="table-editor-toolbar">
          <div>
            <strong>{tables.length} tavoli configurati</strong>
            <span>
              Codice, nome e posti possono essere diversi per ogni tavolo.
            </span>
          </div>
          <button
            className="button-secondary"
            onClick={applyCapacityToAll}
            type="button"
          >
            Applica {defaultTableCapacity} posti a tutti
          </button>
        </div>

        <div className="table-editor">
          {tables.map((table, index) => (
            <div className="table-editor-row" key={index}>
              <div className="table-editor-index">{index + 1}</div>
              <label className="field">
                <span>Codice</span>
                <input
                  aria-label={`Codice tavolo ${index + 1}`}
                  maxLength={40}
                  onChange={(changeEvent) =>
                    updateTable(index, { code: changeEvent.target.value })
                  }
                  required
                  value={table.code}
                />
              </label>
              <label className="field">
                <span>Nome</span>
                <input
                  aria-label={`Nome tavolo ${index + 1}`}
                  maxLength={120}
                  onChange={(changeEvent) =>
                    updateTable(index, { name: changeEvent.target.value })
                  }
                  required
                  value={table.name}
                />
              </label>
              <label className="field table-editor-capacity">
                <span>Posti</span>
                <input
                  aria-label={`Posti tavolo ${index + 1}`}
                  max={100}
                  min={1}
                  onChange={(changeEvent) =>
                    updateTable(index, {
                      capacity: Math.min(
                        100,
                        Math.max(1, Number(changeEvent.target.value) || 1),
                      ),
                    })
                  }
                  required
                  type="number"
                  value={table.capacity}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <div className="wizard-actions">
        <button
          className="button-secondary"
          disabled={step === 1}
          onClick={() => setStep((value) => Math.max(1, value - 1))}
          type="button"
        >
          Indietro
        </button>
        {step < 4 ? (
          <button
            className="button-primary"
            onClick={() => setStep((value) => Math.min(4, value + 1))}
            type="button"
          >
            Continua
            <Icon name="arrow" />
          </button>
        ) : (
          <button className="button-primary" disabled={pending} type="submit">
            {pending ? 'Creazione in corso…' : 'Attiva organizzazione'}
            <Icon name="sparkles" />
          </button>
        )}
      </div>
    </form>
  );
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\components\platform\onboarding-form.tsx') `
    -Content $content_apps_web_components_platform_onboarding_form_tsx `
    -DryRun:$DryRun

$content_apps_web_lib_api_authenticated_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { fluxaServerFetch } from '@/lib/api/fluxa-api';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

export async function authenticatedFluxaFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  if (!accessToken) {
    redirect('/login?reason=session');
  }

  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${accessToken}`);

  return fluxaServerFetch<T>(path, { ...init, headers });
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\lib\api\authenticated.ts') `
    -Content $content_apps_web_lib_api_authenticated_ts `
    -DryRun:$DryRun

$content_apps_web_lib_api_bff_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

export async function proxyAuthenticatedJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<NextResponse<T | Record<string, unknown>>> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json(
      { code: 'SESSION_REQUIRED', message: 'Sessione non disponibile.' },
      { status: 401 },
    );
  }

  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${accessToken}`);

  try {
    const result = await fluxaServerFetch<T>(path, { ...init, headers });
    return NextResponse.json(result);
  } catch (error) {
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
        code: 'CONTROL_CENTER_REQUEST_FAILED',
        message: 'Operazione non riuscita.',
      },
      { status: 500 },
    );
  }
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\lib\api\bff.ts') `
    -Content $content_apps_web_lib_api_bff_ts `
    -DryRun:$DryRun

$content_apps_web_lib_control_center_types_ts = @'
// PHASE_8_TRUE_CONTROL_CENTER
export type EventStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'SOLD_OUT'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'ARCHIVED';

export type ReservationStatus =
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

export interface LocationSummary {
  id: string;
  merchantId: string;
  code: string;
  name: string;
  city: string;
  province: string | null;
  timezone: string;
  status: string;
}

export interface DiningTableSummary {
  id: string;
  locationId: string;
  areaId: string;
  areaName: string;
  code: string;
  name: string;
  capacity: number;
  status: string;
}

export interface EventSummary {
  id: string;
  organizationId: string;
  locationId: string;
  title: string;
  slug: string;
  description: string;
  timezone: string;
  status: EventStatus;
  coverImageUrl: string | null;
  startsAt: string;
  endsAt: string;
  bookingOpensAt: string;
  bookingClosesAt: string;
  bookingAmountCents: number;
  currency: string;
  capacity: number;
  cancellationPolicy: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EventDetail extends EventSummary {
  tables: Array<{
    diningTableId: string;
    tableCode: string;
    tableName: string;
    tableCapacity: number;
    areaName: string;
    enabled: boolean;
  }>;
  bookingRules: {
    minPartySize: number;
    maxPartySize: number;
    holdMinutes: number;
    bookingCutoffMinutes: number;
    cancellationCutoffMinutes: number;
    autoAssignSmallestTable: boolean;
    allowManualAssignment: boolean;
    requirePhone: boolean;
  } | null;
}

export interface EventListResponse {
  items: EventSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReservationRow {
  id: string;
  eventId?: string;
  confirmationCode: string;
  status: ReservationStatus;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string | null;
  partySize: number;
  amountCents: number;
  platformFeeCents?: number;
  merchantNetCents?: number;
  refundedCents?: number;
  currency: string;
  eventTitle: string;
  eventStartsAt?: string;
  tableId?: string | null;
  tableCode?: string | null;
  tableName?: string | null;
  createdAt: string;
}

export interface MerchantOverview {
  location: { id: string; name: string; timezone: string };
  metrics: {
    events: number;
    publishedEvents: number;
    upcomingEvents: number;
    reservations: number;
    confirmedGuests: number;
    refundPending: number;
    paidVolumeCents: string;
  };
  recentEvents: EventSummary[];
  recentReservations: ReservationRow[];
}

export interface ReservationListResponse {
  items: ReservationRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrganizationListItem {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  createdByEmail?: string | null;
}

export interface PlatformOverview {
  metrics: {
    organizations: number;
    activeOrganizations: number;
    users: number;
    events: number;
    reservations: number;
    refundPending: number;
    paidVolumeCents: string;
  };
  recentOrganizations: OrganizationListItem[];
}

export interface PlatformOrganizationDetail {
  organization: OrganizationListItem;
  metrics: {
    merchants: number;
    locations: number;
    members: number;
    events: number;
    reservations: number;
    paidVolumeCents: string;
  };
  merchants: Array<{
    id: string;
    legalName: string;
    tradeName: string | null;
    vatNumber: string;
    status: string;
  }>;
  locations: Array<{
    id: string;
    merchantId: string;
    code: string;
    name: string;
    city: string;
    province: string | null;
    timezone: string;
    status: string;
  }>;
  members: Array<{
    membershipId: string;
    userId: string;
    displayName: string;
    email: string;
    role: string;
    status: string;
    defaultLocationName: string | null;
  }>;
}
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'apps\web\lib\control-center\types.ts') `
    -Content $content_apps_web_lib_control_center_types_ts `
    -DryRun:$DryRun

$content_docs_phase_2_control_center_md = @'
# Fluxa Phase 2 — Fase 08 True Control Center

## Risultato

La Fase 08 trasforma lo scaffold Next.js in un’applicazione operativa con due
aree separate.

### Platform Control Center

Percorsi:

```text
/platform-admin
/platform-admin/organizations
/platform-admin/organizations/new
/platform-admin/organizations/[organizationId]
```

Il wizard di onboarding crea in una sola transazione serializzabile:

```text
organization
merchant
location
customer OWNER user
OWNER membership
dining area
initial dining tables
audit event
outbox event
```

Il platform admin che avvia l’onboarding non diventa owner del tenant cliente.

### Venue Control Center

Percorsi:

```text
/merchant
/merchant/events
/merchant/events/new
/merchant/events/[eventId]
/merchant/events/[eventId]/edit
/merchant/reservations
```

Funzioni:

- metriche reali;
- lista eventi;
- Event Studio;
- selezione tavoli;
- regole di prenotazione;
- deposito in euro;
- creazione draft;
- modifica;
- pubblicazione;
- annullamento;
- archiviazione;
- lista e filtri prenotazioni;
- cambio organizzazione.

## Autenticazione

Restano invariati:

- access token e refresh token in cookie HttpOnly;
- verifica backend dei ruoli;
- isolamento tenant;
- protezione server delle route.

Il login multi-organizzazione non richiede più l’inserimento manuale di UUID:
in caso di `ORGANIZATION_SELECTION_REQUIRED` mostra i workspace disponibili.

## Backend

Nuovi endpoint:

```text
GET  /api/v1/platform/overview
POST /api/v1/platform/onboarding
GET  /api/v1/platform/organizations/:organizationId

GET  /api/v1/control-center/merchant-overview
GET  /api/v1/control-center/reservations
```

Gli endpoint platform richiedono `platformAdmin=true`.

## Fuori scope

La Fase 08 non include ancora:

- catalogo pubblico eventi;
- pagina pubblica `/events/[slug]`;
- checkout pubblico visuale;
- upload object storage delle immagini;
- realtime websocket/SSE;
- rimborsi automatici.

Questi elementi appartengono alle fasi successive.
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'docs\phase-2\control-center.md') `
    -Content $content_docs_phase_2_control_center_md `
    -DryRun:$DryRun

$content_scripts_verify_phase_8_control_center_mjs = @'
// PHASE_8_TRUE_CONTROL_CENTER
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const required = [
  'apps/api/src/platform/dto/platform-onboarding.dto.ts',
  'apps/api/src/platform/platform.service.ts',
  'apps/api/src/platform/platform.controller.ts',
  'apps/api/src/platform/platform.module.ts',
  'apps/api/src/control-center/control-center.service.ts',
  'apps/api/src/control-center/control-center.controller.ts',
  'apps/api/src/control-center/control-center.module.ts',
  'apps/web/app/(public)/page.tsx',
  'apps/web/app/(auth)/login/page.tsx',
  'apps/web/app/merchant/page.tsx',
  'apps/web/app/merchant/events/page.tsx',
  'apps/web/app/merchant/events/new/page.tsx',
  'apps/web/app/merchant/reservations/page.tsx',
  'apps/web/app/platform-admin/page.tsx',
  'apps/web/app/platform-admin/organizations/new/page.tsx',
  'apps/web/components/platform/onboarding-form.tsx',
  'apps/web/components/merchant/event-form.tsx',
  'apps/web/components/control-center/notification.tsx',
  'apps/web/lib/control-center/event-form-validation.ts',
  'apps/web/lib/control-center/event-form-validation.test.ts',
  'apps/web/lib/api/authenticated.ts',
  'docs/phase-2/control-center.md',
];

for (const relativePath of required) {
  await stat(path.join(root, relativePath));
}

const [
  appModule,
  platformService,
  controlCenter,
  webCss,
  login,
  eventForm,
  onboardingForm,
  notification,
  eventFormValidation,
] = await Promise.all([
    readFile(path.join(root, 'apps/api/src/app.module.ts'), 'utf8'),
    readFile(
      path.join(root, 'apps/api/src/platform/platform.service.ts'),
      'utf8',
    ),
    readFile(
      path.join(root, 'apps/api/src/control-center/control-center.service.ts'),
      'utf8',
    ),
    readFile(path.join(root, 'apps/web/app/globals.css'), 'utf8'),
    readFile(
      path.join(root, 'apps/web/components/auth/login-form.tsx'),
      'utf8',
    ),
    readFile(
      path.join(root, 'apps/web/components/merchant/event-form.tsx'),
      'utf8',
    ),
    readFile(
      path.join(root, 'apps/web/components/platform/onboarding-form.tsx'),
      'utf8',
    ),
    readFile(
      path.join(root, 'apps/web/components/control-center/notification.tsx'),
      'utf8',
    ),
    readFile(
      path.join(
        root,
        'apps/web/lib/control-center/event-form-validation.ts',
      ),
      'utf8',
    ),
  ]);

const checks = [
  ['PlatformModule import', appModule, 'PlatformModule'],
  ['ControlCenterModule import', appModule, 'ControlCenterModule'],
  [
    'Atomic transaction',
    platformService,
    'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE',
  ],
  ['Customer owner role', platformService, "'OWNER','ACTIVE'"],
  [
    'Onboarding outbox',
    platformService,
    'platform.organization.onboarded',
  ],
  [
    'Audit entity parameter separated',
    platformService,
    "'organization',$4,$5::jsonb",
  ],
  [
    'Merchant reservation query',
    controlCenter,
    'reservation_table_assignments',
  ],
  ['Control Center design', webCss, '.control-center'],
  ['Event Studio design', webCss, '.event-editor'],
  ['Organization selection UX', login, 'ORGANIZATION_SELECTION_REQUIRED'],
  ['Event table selection', eventForm, 'selectedTables'],
  ['Per-table capacity editor', onboardingForm, 'table-editor-row'],
  ['Per-table update function', onboardingForm, 'updateTable'],
  ['Hidden-step validation bypass', onboardingForm, 'noValidate'],
  ['Wizard validation routing', onboardingForm, 'function reject('],
  ['Fixed notification component', notification, 'control-notification'],
  ['Accessible live notification', notification, 'aria-live'],
  ['Notification design', webCss, '.control-notification'],
  ['Event errors use notification', eventForm, 'ControlCenterNotification'],
  [
    'Onboarding errors use notification',
    onboardingForm,
    'ControlCenterNotification',
  ],
  ['Date parsing helper', eventFormValidation, 'parseEventDateWindow'],
  [
    'Invalid date friendly error',
    eventFormValidation,
    'data e ora non valide',
  ],
  ['Date errors inside submit catch', eventForm, 'const dateWindow'],
  ['Event native validation bypass', eventForm, 'noValidate'],
];

const missing = checks
  .filter(([, content, fragment]) => !content.includes(fragment))
  .map(([name]) => name);

if (missing.length) {
  console.error(`Fase 08 incompleta: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`File Control Center verificati: ${required.length}`);
console.log('Platform onboarding atomico: presente');
console.log('Audit onboarding PostgreSQL: corretto');
console.log('Capienza per singolo tavolo: configurabile');
console.log('Validazione wizard multi-step: presente');
console.log('Notifiche errore fisse e accessibili: presenti');
console.log('Validazione date evento con errori amichevoli: presente');
console.log('Merchant events e reservations: presenti');
console.log('Login multi-organizzazione: presente');
console.log('Design system responsive: presente');
console.log('Nessuna nuova migrazione richiesta');
'@
Write-PhaseFile `
    -Path (Join-Path -Path $repositoryRoot -ChildPath 'scripts\verify-phase-8-control-center.mjs') `
    -Content $content_scripts_verify_phase_8_control_center_mjs `
    -DryRun:$DryRun

Update-AppModule `
    -Path $appModulePath `
    -DryRun:$DryRun

if ($DryRun) {
    Write-Step -Message 'DryRun Fase 08 completato'

    Write-Host @"
Verrebbero creati:

- Platform Control Center completo;
- onboarding atomico tenant/owner/sede/tavoli;
- Venue Control Center;
- Event Studio con tavoli e regole;
- elenco prenotazioni;
- selettore organizzazione;
- login multi-workspace;
- landing e design system premium responsive;
- route BFF Next.js con cookie HttpOnly.

Nessuna nuova migrazione.
Nessun workflow GitHub modificato.
"@

    return
}

Write-Step -Message 'Formattazione backend Fase 08'

Invoke-Checked `
    -FilePath $npxCommand `
    -ArgumentList @(
        'prettier',
        '--write',
        'apps/api/src/platform/**/*.ts',
        'apps/api/src/control-center/**/*.ts',
        'apps/api/src/app.module.ts',
        'scripts/verify-phase-8-control-center.mjs',
        'docs/phase-2/control-center.md'
    ) `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Formattazione web Fase 08'

Invoke-Checked `
    -FilePath $npxCommand `
    -ArgumentList @(
        'prettier',
        '--write',
        'app/**/*.{ts,tsx,css}',
        'components/**/*.{ts,tsx}',
        'lib/**/*.{ts,tsx}'
    ) `
    -WorkingDirectory (Join-Path $repositoryRoot 'apps/web') | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Verifica strutturale Fase 08'

Invoke-Checked `
    -FilePath 'node' `
    -ArgumentList @('scripts/verify-phase-8-control-center.mjs') `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Lint backend'

Invoke-Checked `
    -FilePath $npmCommand `
    -ArgumentList @('run', 'lint') `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

if (-not $SkipTests) {
    Write-Step -Message 'Test backend'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('test') `
        -WorkingDirectory $repositoryRoot | ForEach-Object {
            Write-Host $_
        }
}

Write-Step -Message 'Build backend'

Invoke-Checked `
    -FilePath $npmCommand `
    -ArgumentList @('run', 'build') `
    -WorkingDirectory $repositoryRoot | ForEach-Object {
        Write-Host $_
    }

Write-Step -Message 'Lint web'

Invoke-Checked `
    -FilePath $npmCommand `
    -ArgumentList @('run', 'lint') `
    -WorkingDirectory (Join-Path $repositoryRoot 'apps/web') | ForEach-Object {
        Write-Host $_
    }

if (-not $SkipTests) {
    Write-Step -Message 'Test web'

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'test') `
        -WorkingDirectory (Join-Path $repositoryRoot 'apps/web') | ForEach-Object {
            Write-Host $_
        }
}

Write-Step -Message 'Build Next.js con ambiente production pulito'

$webWorkingDirectory = Join-Path $repositoryRoot 'apps/web'
$nextBuildDirectory = Join-Path $webWorkingDirectory '.next'
$hadNodeEnvironment = Test-Path Env:NODE_ENV
$previousNodeEnvironment = if ($hadNodeEnvironment) {
    $env:NODE_ENV
}
else {
    $null
}

try {
    $env:NODE_ENV = 'production'

    if (Test-Path -LiteralPath $nextBuildDirectory) {
        Remove-Item `
            -LiteralPath $nextBuildDirectory `
            -Recurse `
            -Force
        Write-Host "Cache Next.js rimossa: $nextBuildDirectory"
    }

    Invoke-Checked `
        -FilePath $npmCommand `
        -ArgumentList @('run', 'build') `
        -WorkingDirectory $webWorkingDirectory | ForEach-Object {
            Write-Host $_
        }
}
finally {
    if ($hadNodeEnvironment) {
        $env:NODE_ENV = $previousNodeEnvironment
    }
    else {
        Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
    }
}

Assert-NoWorkflowChanges -RepositoryRoot $repositoryRoot
Show-GitDiffSummary -RepositoryRoot $repositoryRoot

Write-Step -Message 'Fase 08 True Control Center completata'

Write-Host @"
Il Control Center è ora funzionale.

Platform admin:
- overview globale;
- directory tenant;
- onboarding atomico;
- dettaglio organizzazione.

Organizzazione:
- dashboard reale;
- selezione workspace;
- Event Studio;
- modifica/pubblicazione/annullamento/archiviazione;
- prenotazioni e filtri.

La Fase 09 collegherà il portale pubblico eventi e il checkout visuale.
"@
