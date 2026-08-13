import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
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

interface OpenApiHttpResult {
  status: number;
  payload: Record<string, unknown>;
}

function recordField(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
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
    const providerConfiguration =
      profile?.provider === 'OPENAPI_SMART_RECEIPTS'
        ? await this.providerStatus(profile.environment, profile.fiscalId)
        : null;
    return { location, profile, providerConfiguration };
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
        message:
          'Non puoi configurare il provider fiscale su una location archiviata.',
      });
    }

    this.assertProviderAvailable(dto.environment);
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

    const remoteBefore = await this.getRemoteConfiguration(
      dto.environment,
      dto.fiscalId,
    );
    if (remoteBefore) {
      await this.openApiRequest(
        dto.environment,
        `/IT-configurations/${encodeURIComponent(dto.fiscalId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ receipts: true }),
        },
      );
    } else {
      await this.openApiRequest(dto.environment, '/IT-configurations', {
        method: 'POST',
        body: JSON.stringify({
          fiscal_id: dto.fiscalId,
          name: dto.companyName.trim(),
          email: dto.companyEmail.trim().toLowerCase(),
          receipts: true,
        }),
      });
    }

    const remote = await this.getRemoteConfiguration(
      dto.environment,
      dto.fiscalId,
    );
    if (!remote) {
      throw new BadGatewayException({
        code: 'OPENAPI_CONFIGURATION_NOT_VERIFIED',
        message:
          'OpenAPI ha accettato la configurazione ma non è stato possibile verificarla. Il profilo Fluxa non è stato aggiornato.',
      });
    }

    const providerConfiguration = this.publicRemoteConfiguration(remote);
    if (dto.environment === 'PRODUCTION' && dto.enabled) {
      if (!providerConfiguration.receipts || !providerConfiguration.taxCode) {
        throw new BadRequestException({
          code: 'OPENAPI_PRODUCTION_PROFILE_NOT_READY',
          message:
            'La configurazione OpenAPI production esiste, ma le credenziali per gli scontrini non risultano ancora configurate sul provider. Completa le credenziali OpenAPI prima di attivare la sede.',
        });
      }
    }

    const profile = await this.upsertLocalProfile(
      organizationId,
      locationId,
      dto,
    );
    await this.audit(auth, organizationId, profile.id, {
      locationId,
      environment: dto.environment,
      fiscalId: dto.fiscalId,
      enabled: dto.enabled,
      remoteCreated: !remoteBefore,
      providerReady: Boolean(
        providerConfiguration.receipts &&
        (dto.environment === 'SANDBOX' || providerConfiguration.taxCode),
      ),
    });

    return { location, profile, providerConfiguration };
  }

  private assertProviderAvailable(environment: 'SANDBOX' | 'PRODUCTION') {
    const token = this.config.get<string>('OPENAPI_BEARER_TOKEN')?.trim();
    if (!token) {
      throw new ServiceUnavailableException({
        code: 'OPENAPI_CREDENTIALS_MISSING',
        message: 'OpenAPI bearer token non configurato sul server.',
      });
    }
    if (
      environment === 'PRODUCTION' &&
      this.config.get<boolean>('OPENAPI_ENABLED') !== true
    ) {
      throw new ServiceUnavailableException({
        code: 'OPENAPI_PRODUCTION_DISABLED',
        message: 'OpenAPI production non è abilitato sul server.',
      });
    }
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

  private async upsertLocalProfile(
    organizationId: string,
    locationId: string,
    dto: PlatformOpenApiFiscalProfileDto,
  ) {
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
    return result.rows[0];
  }

  private async providerStatus(
    environment: 'SANDBOX' | 'PRODUCTION',
    fiscalId: string,
  ) {
    const token = this.config.get<string>('OPENAPI_BEARER_TOKEN')?.trim();
    if (!token) {
      return {
        reachable: false,
        configured: false,
        receipts: false,
        fiscalId,
        name: null,
        email: null,
        taxCode: null,
        reason: 'OPENAPI_TOKEN_NOT_CONFIGURED',
      };
    }
    const remote = await this.getRemoteConfiguration(environment, fiscalId);
    return remote
      ? this.publicRemoteConfiguration(remote)
      : {
          reachable: true,
          configured: false,
          receipts: false,
          fiscalId,
          name: null,
          email: null,
          taxCode: null,
          reason: 'OPENAPI_CONFIGURATION_NOT_FOUND',
        };
  }

  private async getRemoteConfiguration(
    environment: 'SANDBOX' | 'PRODUCTION',
    fiscalId: string,
  ): Promise<Record<string, unknown> | null> {
    const response = await this.openApiRequest(
      environment,
      `/IT-configurations/${encodeURIComponent(fiscalId)}`,
      { method: 'GET' },
      true,
    );
    if (response.status === 404) return null;
    return recordField(response.payload.data);
  }

  private publicRemoteConfiguration(remote: Record<string, unknown>) {
    const authentication = recordField(remote.receipts_authentication);
    return {
      reachable: true,
      configured: true,
      receipts: remote.receipts !== false,
      fiscalId: stringField(remote.fiscal_id),
      name: stringField(remote.name) || null,
      email: stringField(remote.email) || null,
      taxCode: stringField(authentication.taxCode) || null,
      reason: null,
    };
  }

  private async openApiRequest(
    environment: 'SANDBOX' | 'PRODUCTION',
    path: string,
    init: RequestInit,
    allowNotFound = false,
  ): Promise<OpenApiHttpResult> {
    const token = this.config.get<string>('OPENAPI_BEARER_TOKEN')?.trim();
    if (!token) {
      throw new ServiceUnavailableException({
        code: 'OPENAPI_CREDENTIALS_MISSING',
        message: 'OpenAPI bearer token non configurato sul server.',
      });
    }
    const configuredBase = this.config
      .get<string>('OPENAPI_API_BASE_URL')
      ?.trim();
    const base = (
      configuredBase ||
      (environment === 'SANDBOX'
        ? 'https://test.invoice.openapi.com'
        : 'https://invoice.openapi.com')
    ).replace(/\/+$/, '');

    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        signal: AbortSignal.timeout(15_000),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new BadGatewayException({
        code: 'OPENAPI_NETWORK_ERROR',
        message: 'OpenAPI non è raggiungibile in questo momento.',
      });
    }

    const text = await response.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }
    if (allowNotFound && response.status === 404) {
      return { status: response.status, payload };
    }
    if (!response.ok || payload.success === false) {
      throw new BadGatewayException({
        code: `OPENAPI_HTTP_${response.status}`,
        message:
          stringField(payload.message) ||
          `OpenAPI ha restituito HTTP ${response.status}.`,
      });
    }
    return { status: response.status, payload };
  }

  private async audit(
    auth: AuthContext,
    organizationId: string,
    profileId: string,
    payload: Record<string, unknown>,
  ) {
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
        profileId,
        JSON.stringify(payload),
      ],
    );
  }
}
