import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { LocationAccessService } from '../auth/location-access.service';
import type { UpsertFiscalProfileDto } from './dto/upsert-fiscal-profile.dto';

interface FiscalProfileRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  provider: string;
  environment: string;
  fiscalId: string;
  enabled: boolean;
  autoIssueOnPaid: boolean;
  receiptEmail: string | null;
  displayName: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface FiscalDocumentSummaryRow extends QueryResultRow {
  id: string;
  status: string;
  totalCents: number;
  createdAt: Date;
  issuedAt: Date | null;
}

interface PlatformLocationRow extends QueryResultRow {
  id: string;
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

@Injectable()
export class FiscalProfilesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly locationAccess: LocationAccessService,
  ) {}

  async getMerchantStatus(auth: AuthContext, locationId: string) {
    const scope = await this.locationAccess.assert(auth, locationId);
    const [profileResult, documentResult] = await Promise.all([
      this.database.pool.query<FiscalProfileRow>(
        `
          SELECT id, organization_id AS "organizationId",
            location_id AS "locationId", provider, environment,
            fiscal_id AS "fiscalId", enabled,
            auto_issue_on_paid AS "autoIssueOnPaid",
            receipt_email AS "receiptEmail", display_name AS "displayName",
            version, created_at AS "createdAt", updated_at AS "updatedAt"
          FROM fiscal_profiles
          WHERE organization_id = $1 AND location_id = $2
          LIMIT 1
        `,
        [scope.organizationId, locationId],
      ),
      this.database.pool.query<FiscalDocumentSummaryRow>(
        `
          SELECT id, status::text AS status, total_cents AS "totalCents",
            created_at AS "createdAt", issued_at AS "issuedAt"
          FROM fiscal_documents
          WHERE organization_id = $1 AND location_id = $2
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        `,
        [scope.organizationId, locationId],
      ),
    ]);

    const profile = profileResult.rows[0] ?? null;
    const lastDocument = documentResult.rows[0] ?? null;

    return {
      locationId,
      state: profile
        ? profile.enabled
          ? ('ACTIVE' as const)
          : ('INACTIVE' as const)
        : ('NOT_CONFIGURED' as const),
      mode: profile ? this.merchantMode(profile.provider) : null,
      autoIssueOnPaid: profile?.autoIssueOnPaid ?? false,
      lastDocument: lastDocument
        ? {
            id: lastDocument.id,
            status: lastDocument.status,
            totalCents: lastDocument.totalCents,
            createdAt: lastDocument.createdAt,
            issuedAt: lastDocument.issuedAt,
          }
        : null,
    };
  }

  async getForPlatform(organizationId: string, locationId: string) {
    await this.assertPlatformLocation(organizationId, locationId);
    return this.getProfile(organizationId, locationId);
  }

  async upsertForPlatform(
    auth: AuthContext,
    organizationId: string,
    locationId: string,
    dto: UpsertFiscalProfileDto,
  ) {
    await this.assertPlatformLocation(organizationId, locationId);

    if (dto.provider === 'OPENAPI_SMART_RECEIPTS') {
      throw new BadRequestException({
        code: 'OPENAPI_REQUIRES_PROVISIONING',
        message:
          'OpenAPI deve essere configurato dalla sezione di provisioning dedicata.',
      });
    }

    const result = await this.database.pool.query<FiscalProfileRow>(
      `
        INSERT INTO fiscal_profiles (
          id, organization_id, location_id, provider, environment,
          fiscal_id, enabled, auto_issue_on_paid, receipt_email,
          display_name, version, created_at, updated_at
        ) VALUES ($1,$2,$3,$4::fiscal_provider,$5::fiscal_environment,$6,$7,$8,$9,$10,1,NOW(),NOW())
        ON CONFLICT (organization_id, location_id)
        DO UPDATE SET provider = EXCLUDED.provider,
          environment = EXCLUDED.environment,
          fiscal_id = EXCLUDED.fiscal_id,
          enabled = EXCLUDED.enabled,
          auto_issue_on_paid = EXCLUDED.auto_issue_on_paid,
          receipt_email = EXCLUDED.receipt_email,
          display_name = EXCLUDED.display_name,
          version = fiscal_profiles.version + 1,
          updated_at = NOW()
        RETURNING id, organization_id AS "organizationId",
          location_id AS "locationId", provider, environment,
          fiscal_id AS "fiscalId", enabled,
          auto_issue_on_paid AS "autoIssueOnPaid",
          receipt_email AS "receiptEmail", display_name AS "displayName",
          version, created_at AS "createdAt", updated_at AS "updatedAt"
      `,
      [
        randomUUID(),
        organizationId,
        locationId,
        dto.provider,
        dto.environment,
        dto.fiscalId,
        dto.enabled,
        dto.autoIssueOnPaid,
        dto.receiptEmail?.trim() || null,
        dto.displayName?.trim() || null,
      ],
    );
    const profile = result.rows[0];

    await this.database.pool.query(
      `INSERT INTO audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload)
       VALUES ($1,$2,$3,'fiscal.profile.upserted','fiscal_profile',$4,$5::jsonb)`,
      [
        randomUUID(),
        organizationId,
        auth.userId,
        profile.id,
        JSON.stringify({
          locationId,
          provider: dto.provider,
          environment: dto.environment,
          enabled: dto.enabled,
          source: 'PLATFORM_ADMIN',
        }),
      ],
    );

    return profile;
  }

  private async getProfile(organizationId: string, locationId: string) {
    const result = await this.database.pool.query<FiscalProfileRow>(
      `
        SELECT id, organization_id AS "organizationId",
          location_id AS "locationId", provider, environment,
          fiscal_id AS "fiscalId", enabled,
          auto_issue_on_paid AS "autoIssueOnPaid",
          receipt_email AS "receiptEmail", display_name AS "displayName",
          version, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM fiscal_profiles
        WHERE organization_id = $1 AND location_id = $2
        LIMIT 1
      `,
      [organizationId, locationId],
    );
    return result.rows[0] ?? null;
  }

  private async assertPlatformLocation(
    organizationId: string,
    locationId: string,
  ) {
    const result = await this.database.pool.query<PlatformLocationRow>(
      `
        SELECT l.id,
          COALESCE(ll.lifecycle_status::text, l.status::text) AS "lifecycleStatus"
        FROM locations l
        LEFT JOIN location_lifecycle ll ON ll.location_id = l.id
        WHERE l.organization_id = $1 AND l.id = $2
        LIMIT 1
      `,
      [organizationId, locationId],
    );
    const location = result.rows[0];
    if (!location) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Location non trovata per questa organizzazione.',
      });
    }
    if (location.lifecycleStatus === 'ARCHIVED') {
      throw new BadRequestException({
        code: 'LOCATION_ARCHIVED',
        message: 'La configurazione fiscale non è modificabile su una sede archiviata.',
      });
    }
    return location;
  }

  private merchantMode(provider: string) {
    switch (provider) {
      case 'ADE_WEB':
        return 'Agenzia delle Entrate';
      case 'OPENAPI_SMART_RECEIPTS':
      case 'ACUBE_SMART_RECEIPTS':
        return 'Servizio fiscale digitale';
      case 'MOCK':
        return 'Ambiente di prova';
      default:
        return 'Servizio fiscale Fluxa';
    }
  }
}
