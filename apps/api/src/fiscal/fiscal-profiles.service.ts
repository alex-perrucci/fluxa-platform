import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { FiscalAccessService } from './fiscal-access.service';
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

@Injectable()
export class FiscalProfilesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: FiscalAccessService,
  ) {}

  async get(auth: AuthContext, locationId: string) {
    const scope = await this.access.assertLocation(auth, locationId);
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
      [scope.organizationId, locationId],
    );
    return result.rows[0] ?? null;
  }

  async upsert(
    auth: AuthContext,
    locationId: string,
    dto: UpsertFiscalProfileDto,
  ) {
    const scope = await this.access.assertLocation(auth, locationId);
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
        scope.organizationId,
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
        scope.organizationId,
        auth.userId,
        profile.id,
        JSON.stringify({
          locationId,
          provider: dto.provider,
          environment: dto.environment,
          enabled: dto.enabled,
        }),
      ],
    );
    return profile;
  }
}
