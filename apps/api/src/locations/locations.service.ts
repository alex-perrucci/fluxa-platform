import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { auditEvents, locations, merchants } from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { CreateLocationDto } from './dto/create-location.dto';
import type { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly database: DatabaseService) {}

  async list(auth: AuthContext) {
    const organizationId = assertOrganizationScope(auth);

    return this.database.db
      .select({
        id: locations.id,
        organizationId: locations.organizationId,
        merchantId: locations.merchantId,
        merchantLegalName: merchants.legalName,
        code: locations.code,
        name: locations.name,
        addressLine1: locations.addressLine1,
        addressLine2: locations.addressLine2,
        postalCode: locations.postalCode,
        city: locations.city,
        province: locations.province,
        countryCode: locations.countryCode,
        timezone: locations.timezone,
        status: locations.status,
        createdAt: locations.createdAt,
        updatedAt: locations.updatedAt,
      })
      .from(locations)
      .innerJoin(merchants, eq(merchants.id, locations.merchantId))
      .where(eq(locations.organizationId, organizationId))
      .orderBy(asc(locations.name));
  }

  async get(auth: AuthContext, locationId: string) {
    const organizationId = assertOrganizationScope(auth);

    const [location] = await this.database.db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, locationId),
          eq(locations.organizationId, organizationId),
        ),
      )
      .limit(1);

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
          status: dto.status ?? current.status,
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
        payload: { status: location.status },
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
