import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import type { PlatformOpenApiFiscalProfileDto } from './dto/platform-openapi-fiscal-profile.dto';

interface FiscalProfileRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  provider: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  fiscalId: string;
  enabled: boolean;
  autoIssueOnPaid: boolean;
  receiptEmail: string | null;
  displayName: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface LocationRow extends QueryResultRow {
  id: string;
  organizationId: string;
  merchantId: string;
  merchantLegalName: string;
  merchantVatNumber: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

@Injectable()
export class PlatformOpenApiFiscalService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async get(organizationId: string, locationId: string) {
    const location = await this.requireLocation(organizationId, locationId);
    const profile = await this.getLocalProfile(organizationId, locationId);
    return { location, profile };
  }

  async upsert(
    auth: AuthContext,
    organizationId: string,
    locationId: string,
    dto: PlatformOpenApiFiscalProfileDto,
  ) {
    const location = await this.requireLocation(organizationId, locationId);
    if (location.lifecycleStatus === 'ARCHIVED') {
      throw new BadRequestException({
        code: 'LOCATION_ARCHIVED',
        message: 'Non puoi configurare il provider fiscale su una location archiviata.',
      });
    }

    if (dto.environment === 'PRODUCTION' && dto.enabled) {
      const enabled = this.config.get<boolean>('OPENAPI_ENABLED') === true;
      const token = this.config.get<string>('OPENAPI_BEARER_TOKEN')?.trim();
      if (!enabled || !token) {
        throw new ServiceUnavailableException({
          code: 'OPENAPI_PRODUCTION_DISABLED',
          message:
            'OpenAPI production non è abilitato o il secret provider non è configurato sul server.',
        });
      }
    }

    const existing = await this.getLocalProfile(organizationId, locationId);
    if (
      existing?.provider === 'OPENAPI_SMART_RECEIPTS' &&
      existing.fiscalId !== dto.fiscalId
    ) {
      throw new BadRequestException({
        code: 'OPENAPI_FISCAL_ID_CHANGE_BLOCKED',
        message:
          'La partita IVA di un profilo OpenAPI già collegato non può essere cambiata da questa schermata.',
      });
    }

    const result = await this.database.pool.query<FiscalProfileRow>(
      `INSERT INTO fiscal_profiles (
         id, organization_id, location_id, provider, environment, fiscal_id,
         enabled, auto_issue_on_paid, receipt_email, display_name,
         version, created_at, updated_at
       ) VALUES (
         $1,$2,$3,'OPENAPI_SMART_RECEIPTS'::fiscal_provider,
         $4::fiscal_environment,$5,$6,$7,$8,$9,1,NOW(),NOW()
       )
       ON CONFLICT (organization_id, location_id)
       DO UPDATE SET
         provider='OPENAPI_SMART_RECEIPTS'::fiscal_provider,
         environment=EXCLUDED.environment,
         fiscal_id=EXCLUDED.fiscal_id,
         enabled=EXCLUDED.enabled,
         auto_issue_on_paid=EXCLUDED.auto_issue_on_paid,
         receipt_email=EXCLUDED.receipt_email,
         display_name=EXCLUDED.display_name,
         version=fiscal_profiles.version + 1,
         updated_at=NOW()
       RETURNING id, organization_id AS "organizationId",
         location_id AS "locationId", provider, environment,
         fiscal_id AS "fiscalId", enabled,
         auto_issue_on_paid AS "autoIssueOnPaid",
         receipt_email AS "receiptEmail", display_name AS "displayName",
         version, created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        randomUUID(),
        organizationId,
        locationId,
        dto.environment,
        dto.fiscalId,
        dto.enabled,
        dto.autoIssueOnPaid,
        dto.receiptEmail?.trim() || dto.companyEmail.trim().toLowerCase(),
        dto.displayName?.trim() || dto.companyName.trim(),
      ],
    );
    const profile = result.rows[0];

    await this.database.pool.query(
      `INSERT INTO audit_events (
         id, organization_id, actor_user_id, action, entity_type, entity_id, payload
       ) VALUES (
         $1,$2,$3,'platform.fiscal.openapi_profile.upserted',
         'fiscal_profile',$4,$5::jsonb
       )`,
      [
        randomUUID(),
        organizationId,
        auth.userId,
        profile.id,
        JSON.stringify({
          locationId,
          environment: dto.environment,
          fiscalId: dto.fiscalId,
          enabled: dto.enabled,
        }),
      ],
    );

    return { location, profile };
  }

  private async requireLocation(organizationId: string, locationId: string) {
    const result = await this.database.pool.query<LocationRow>(
      `SELECT l.id, l.organization_id AS "organizationId",
         l.merchant_id AS "merchantId", l.name, l.status,
         m.legal_name AS "merchantLegalName", m.vat_number AS "merchantVatNumber",
         COALESCE(ll.lifecycle_status::text, l.status::text) AS "lifecycleStatus"
       FROM locations l
       JOIN merchants m ON m.id = l.merchant_id AND m.organization_id = l.organization_id
       LEFT JOIN location_lifecycle ll ON ll.location_id = l.id
       WHERE l.organization_id=$1 AND l.id=$2
       LIMIT 1`,
      [organizationId, locationId],
    );
    const location = result.rows[0];
    if (!location) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Location non trovata per questo tenant.',
      });
    }
    return location;
  }

  private async getLocalProfile(organizationId: string, locationId: string) {
    const result = await this.database.pool.query<FiscalProfileRow>(
      `SELECT id, organization_id AS "organizationId",
         location_id AS "locationId", provider, environment,
         fiscal_id AS "fiscalId", enabled,
         auto_issue_on_paid AS "autoIssueOnPaid",
         receipt_email AS "receiptEmail", display_name AS "displayName",
         version, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM fiscal_profiles
       WHERE organization_id=$1 AND location_id=$2
       LIMIT 1`,
      [organizationId, locationId],
    );
    return result.rows[0] ?? null;
  }
}
