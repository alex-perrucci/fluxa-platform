import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { QueryResultRow } from 'pg';
import { auditEvents, locations, merchants } from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import { LocationAccessService } from '../auth/location-access.service';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { CreateLocationDto } from './dto/create-location.dto';
import type { UpdateLocationDto } from './dto/update-location.dto';

interface LocationSummaryRow extends QueryResultRow {
  id: string;
  organizationId: string;
  merchantId: string;
  merchantLegalName: string;
  code: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  countryCode: string;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
  kind: 'PERMANENT' | 'TEMPORARY';
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  activeFrom: Date | null;
  activeUntil: Date | null;
  canManageLocation: boolean;
  canManageTables: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class LocationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly locationAccess: LocationAccessService,
  ) {}

  async list(auth: AuthContext): Promise<LocationSummaryRow[]> {
    const organizationId = assertOrganizationScope(auth);
    const globallyScoped = auth.role === 'OWNER' || auth.role === 'ADMIN';
    const result = await this.database.pool.query<LocationSummaryRow>(
      `SELECT
         l.id,
         l.organization_id AS "organizationId",
         l.merchant_id AS "merchantId",
         m.legal_name AS "merchantLegalName",
         l.code,
         l.name,
         l.address_line_1 AS "addressLine1",
         l.address_line_2 AS "addressLine2",
         l.postal_code AS "postalCode",
         l.city,
         l.province,
         l.country_code AS "countryCode",
         l.timezone,
         l.status,
         COALESCE(ll.kind::text, 'PERMANENT') AS kind,
         COALESCE(ll.lifecycle_status::text, l.status::text) AS "lifecycleStatus",
         ll.active_from AS "activeFrom",
         ll.active_until AS "activeUntil",
         CASE WHEN $3::boolean THEN TRUE ELSE COALESCE(oml.can_manage_location,FALSE) END AS "canManageLocation",
         CASE WHEN $3::boolean THEN TRUE ELSE COALESCE(oml.can_manage_tables,FALSE) END AS "canManageTables",
         l.created_at AS "createdAt",
         l.updated_at AS "updatedAt"
       FROM locations l
       JOIN merchants m ON m.id=l.merchant_id
       LEFT JOIN location_lifecycle ll ON ll.location_id=l.id
       LEFT JOIN organization_membership_locations oml
         ON oml.organization_id=l.organization_id
        AND oml.location_id=l.id
        AND oml.membership_id=$2
        AND oml.active=TRUE
       WHERE l.organization_id=$1
         AND ($3::boolean OR oml.id IS NOT NULL)
         AND COALESCE(ll.lifecycle_status::text, l.status::text) <> 'ARCHIVED'
       ORDER BY l.name`,
      [organizationId, auth.membershipId, globallyScoped],
    );
    return result.rows;
  }

  async get(auth: AuthContext, locationId: string) {
    await this.locationAccess.assert(auth, locationId);
    const organizationId = assertOrganizationScope(auth);
    const result = await this.database.pool.query<LocationSummaryRow>(
      `SELECT
         l.id,
         l.organization_id AS "organizationId",
         l.merchant_id AS "merchantId",
         m.legal_name AS "merchantLegalName",
         l.code,
         l.name,
         l.address_line_1 AS "addressLine1",
         l.address_line_2 AS "addressLine2",
         l.postal_code AS "postalCode",
         l.city,
         l.province,
         l.country_code AS "countryCode",
         l.timezone,
         l.status,
         COALESCE(ll.kind::text, 'PERMANENT') AS kind,
         COALESCE(ll.lifecycle_status::text, l.status::text) AS "lifecycleStatus",
         ll.active_from AS "activeFrom",
         ll.active_until AS "activeUntil",
         CASE WHEN $4::boolean THEN TRUE ELSE COALESCE(oml.can_manage_location,FALSE) END AS "canManageLocation",
         CASE WHEN $4::boolean THEN TRUE ELSE COALESCE(oml.can_manage_tables,FALSE) END AS "canManageTables",
         l.created_at AS "createdAt",
         l.updated_at AS "updatedAt"
       FROM locations l
       JOIN merchants m ON m.id=l.merchant_id
       LEFT JOIN location_lifecycle ll ON ll.location_id=l.id
       LEFT JOIN organization_membership_locations oml
         ON oml.organization_id=l.organization_id
        AND oml.location_id=l.id
        AND oml.membership_id=$3
        AND oml.active=TRUE
       WHERE l.id=$1 AND l.organization_id=$2
       LIMIT 1`,
      [
        locationId,
        organizationId,
        auth.membershipId,
        auth.role === 'OWNER' || auth.role === 'ADMIN',
      ],
    );
    const location = result.rows[0];
    if (!location) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Punto vendita non trovato.',
      });
    }
    return location;
  }

  async create(auth: AuthContext, dto: CreateLocationDto) {
    const organizationId = assertOrganizationScope(auth);
    await this.assertMerchantScope(organizationId, dto.merchantId);

    try {
      const [location] = await this.database.db
        .insert(locations)
        .values({
          organizationId,
          merchantId: dto.merchantId,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          addressLine1: dto.addressLine1.trim(),
          addressLine2: dto.addressLine2?.trim() || null,
          postalCode: dto.postalCode.trim(),
          city: dto.city.trim(),
          province: dto.province?.trim().toUpperCase() || null,
          countryCode: dto.countryCode?.toUpperCase() || 'IT',
          timezone: dto.timezone?.trim() || 'Europe/Rome',
        })
        .returning();

      await this.database.db.insert(auditEvents).values({
        organizationId,
        actorUserId: auth.userId,
        action: 'location.created',
        entityType: 'location',
        entityId: location.id,
        payload: {
          code: location.code,
          merchantId: location.merchantId,
        },
      });

      return location;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'LOCATION_CODE_ALREADY_EXISTS',
          message:
            "Il codice del punto vendita è già usato nell'organizzazione.",
        });
      }
      throw error;
    }
  }

  async update(auth: AuthContext, locationId: string, dto: UpdateLocationDto) {
    await this.locationAccess.assert(auth, locationId, 'manage_location');
    const current = await this.get(auth, locationId);
    const merchantId = dto.merchantId ?? current.merchantId;

    await this.assertMerchantScope(current.organizationId, merchantId);

    try {
      const [location] = await this.database.db
        .update(locations)
        .set({
          merchantId,
          code: dto.code?.trim().toUpperCase() ?? current.code,
          name: dto.name?.trim() ?? current.name,
          addressLine1: dto.addressLine1?.trim() ?? current.addressLine1,
          addressLine2:
            dto.addressLine2 !== undefined
              ? dto.addressLine2.trim() || null
              : current.addressLine2,
          postalCode: dto.postalCode?.trim() ?? current.postalCode,
          city: dto.city?.trim() ?? current.city,
          province:
            dto.province !== undefined
              ? dto.province.trim().toUpperCase() || null
              : current.province,
          countryCode: dto.countryCode?.toUpperCase() ?? current.countryCode,
          timezone: dto.timezone?.trim() ?? current.timezone,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(locations.id, locationId),
            eq(locations.organizationId, current.organizationId),
          ),
        )
        .returning();

      await this.database.db.insert(auditEvents).values({
        organizationId: current.organizationId,
        actorUserId: auth.userId,
        action: 'location.updated',
        entityType: 'location',
        entityId: location.id,
        payload: {
          code: location.code,
          name: location.name,
          city: location.city,
        },
      });

      return this.get(auth, locationId);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'LOCATION_CODE_ALREADY_EXISTS',
          message:
            "Il codice del punto vendita è già usato nell'organizzazione.",
        });
      }
      throw error;
    }
  }

  private async assertMerchantScope(
    organizationId: string,
    merchantId: string,
  ): Promise<void> {
    const [merchant] = await this.database.db
      .select({ id: merchants.id })
      .from(merchants)
      .where(
        and(
          eq(merchants.id, merchantId),
          eq(merchants.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!merchant) {
      throw new NotFoundException({
        code: 'MERCHANT_NOT_FOUND',
        message: "Esercente non trovato nell'organizzazione corrente.",
      });
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
