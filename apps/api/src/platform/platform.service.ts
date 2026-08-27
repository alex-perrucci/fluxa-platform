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
      plan: dto.plan,
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
        const subscriptionId = randomUUID();
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
            INSERT INTO organization_subscriptions (
              id,
              organization_id,
              plan,
              status,
              starts_at
            )
            VALUES ($1,$2,$3::subscription_plan,'ACTIVE',NOW())
          `,
          [subscriptionId, organizationId, normalized.plan],
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
          subscriptionId,
          plan: normalized.plan,
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
          subscription: {
            id: subscriptionId,
            plan: normalized.plan,
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
