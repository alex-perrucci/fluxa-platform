import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import {
  auditEvents,
  locationPriceLists,
  priceLists,
  productPrices,
} from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import {
  buildPriceKey,
  normalizePagination,
  validateDateRange,
} from './catalog-policy';
import { CatalogReferencesService } from './catalog-references.service';
import type { AssignPriceListDto } from './dto/assign-price-list.dto';
import type { CatalogListQueryDto } from './dto/catalog-list-query.dto';
import type { CreatePriceListDto } from './dto/create-price-list.dto';
import type { UpdatePriceListDto } from './dto/update-price-list.dto';
import type { UpsertProductPriceDto } from './dto/upsert-product-price.dto';

@Injectable()
export class PricingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly references: CatalogReferencesService,
  ) {}

  async listPriceLists(auth: AuthContext, query: CatalogListQueryDto) {
    const organizationId = assertOrganizationScope(auth);
    const pagination = normalizePagination(query);
    const conditions: SQL[] = [eq(priceLists.organizationId, organizationId)];

    if (query.status) {
      conditions.push(eq(priceLists.status, query.status));
    }

    const search = query.q?.trim();
    if (search) {
      const predicate = or(
        ilike(priceLists.code, `%${search}%`),
        ilike(priceLists.name, `%${search}%`),
      );
      if (predicate) conditions.push(predicate);
    }

    const where = and(...conditions);
    const [items, totalRows] = await Promise.all([
      this.database.db
        .select()
        .from(priceLists)
        .where(where)
        .orderBy(asc(priceLists.priority), asc(priceLists.name))
        .limit(pagination.pageSize)
        .offset(pagination.offset),
      this.database.db.select({ value: count() }).from(priceLists).where(where),
    ]);

    return {
      items,
      total: totalRows[0]?.value ?? 0,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async getPriceList(auth: AuthContext, priceListId: string) {
    const organizationId = assertOrganizationScope(auth);
    const priceList = await this.references.priceList(
      organizationId,
      priceListId,
    );

    const [assignments, prices] = await Promise.all([
      this.database.db
        .select()
        .from(locationPriceLists)
        .where(
          and(
            eq(locationPriceLists.priceListId, priceListId),
            eq(locationPriceLists.organizationId, organizationId),
          ),
        ),
      this.database.db
        .select()
        .from(productPrices)
        .where(
          and(
            eq(productPrices.priceListId, priceListId),
            eq(productPrices.organizationId, organizationId),
          ),
        ),
    ]);

    return { ...priceList, assignments, prices };
  }

  async createPriceList(auth: AuthContext, dto: CreatePriceListDto) {
    const organizationId = assertOrganizationScope(auth);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    validateDateRange(startsAt, endsAt);

    try {
      return await this.database.db.transaction(async (tx) => {
        const [priceList] = await tx
          .insert(priceLists)
          .values({
            organizationId,
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
            currency: dto.currency.trim().toUpperCase(),
            priority: dto.priority ?? 0,
            startsAt,
            endsAt,
          })
          .returning();

        await tx.insert(auditEvents).values({
          organizationId,
          actorUserId: auth.userId,
          action: 'price_list.created',
          entityType: 'price_list',
          entityId: priceList.id,
          payload: {
            code: priceList.code,
            currency: priceList.currency,
          },
        });

        return priceList;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'PRICE_LIST_CODE_ALREADY_EXISTS',
          message: 'Il codice del listino è già utilizzato.',
        });
      }

      throw error;
    }
  }

  async updatePriceList(
    auth: AuthContext,
    priceListId: string,
    dto: UpdatePriceListDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.references.priceList(
      organizationId,
      priceListId,
    );
    const startsAt =
      dto.startsAt !== undefined
        ? dto.startsAt
          ? new Date(dto.startsAt)
          : null
        : current.startsAt;
    const endsAt =
      dto.endsAt !== undefined
        ? dto.endsAt
          ? new Date(dto.endsAt)
          : null
        : current.endsAt;

    validateDateRange(startsAt, endsAt);

    try {
      const [priceList] = await this.database.db
        .update(priceLists)
        .set({
          code: dto.code?.trim().toUpperCase() ?? current.code,
          name: dto.name?.trim() ?? current.name,
          currency: dto.currency?.trim().toUpperCase() ?? current.currency,
          priority: dto.priority ?? current.priority,
          startsAt,
          endsAt,
          status: dto.status ?? current.status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(priceLists.id, priceListId),
            eq(priceLists.organizationId, organizationId),
          ),
        )
        .returning();

      await this.database.db.insert(auditEvents).values({
        organizationId,
        actorUserId: auth.userId,
        action: 'price_list.updated',
        entityType: 'price_list',
        entityId: priceList.id,
        payload: { status: priceList.status },
      });

      return priceList;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'PRICE_LIST_CODE_ALREADY_EXISTS',
          message: 'Il codice del listino è già utilizzato.',
        });
      }

      throw error;
    }
  }

  async assignPriceList(
    auth: AuthContext,
    priceListId: string,
    dto: AssignPriceListDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    await Promise.all([
      this.references.priceList(organizationId, priceListId),
      this.references.location(organizationId, dto.locationId),
    ]);

    const [assignment] = await this.database.db
      .insert(locationPriceLists)
      .values({
        organizationId,
        locationId: dto.locationId,
        priceListId,
        priority: dto.priority ?? 0,
        active: dto.active ?? true,
      })
      .onConflictDoUpdate({
        target: [locationPriceLists.locationId, locationPriceLists.priceListId],
        set: {
          priority: dto.priority ?? 0,
          active: dto.active ?? true,
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.database.db.insert(auditEvents).values({
      organizationId,
      actorUserId: auth.userId,
      action: 'price_list.assigned',
      entityType: 'location_price_list',
      entityId: assignment.id,
      payload: {
        locationId: assignment.locationId,
        priceListId,
        active: assignment.active,
      },
    });

    return assignment;
  }

  async upsertProductPrice(
    auth: AuthContext,
    priceListId: string,
    dto: UpsertProductPriceDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    await Promise.all([
      this.references.priceList(organizationId, priceListId),
      this.references.product(organizationId, dto.productId),
    ]);

    if (dto.variantId) {
      await this.references.variant(
        organizationId,
        dto.productId,
        dto.variantId,
      );
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    validateDateRange(startsAt, endsAt);
    const priceKey = buildPriceKey(dto.productId, dto.variantId);

    const [price] = await this.database.db
      .insert(productPrices)
      .values({
        organizationId,
        priceListId,
        productId: dto.productId,
        variantId: dto.variantId ?? null,
        priceKey,
        amountCents: dto.amountCents,
        startsAt,
        endsAt,
      })
      .onConflictDoUpdate({
        target: [productPrices.priceListId, productPrices.priceKey],
        set: {
          amountCents: dto.amountCents,
          startsAt,
          endsAt,
          status: 'ACTIVE',
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.database.db.insert(auditEvents).values({
      organizationId,
      actorUserId: auth.userId,
      action: 'product_price.upserted',
      entityType: 'product_price',
      entityId: price.id,
      payload: {
        priceListId,
        productId: dto.productId,
        variantId: dto.variantId ?? null,
        amountCents: dto.amountCents,
      },
    });

    return price;
  }

  async archiveProductPrice(
    auth: AuthContext,
    priceListId: string,
    priceId: string,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const [current] = await this.database.db
      .select()
      .from(productPrices)
      .where(
        and(
          eq(productPrices.id, priceId),
          eq(productPrices.priceListId, priceListId),
          eq(productPrices.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!current) {
      throw new NotFoundException({
        code: 'PRODUCT_PRICE_NOT_FOUND',
        message: 'Prezzo non trovato.',
      });
    }

    const [price] = await this.database.db
      .update(productPrices)
      .set({ status: 'INACTIVE', updatedAt: new Date() })
      .where(
        and(
          eq(productPrices.id, priceId),
          eq(productPrices.organizationId, organizationId),
        ),
      )
      .returning();

    await this.database.db.insert(auditEvents).values({
      organizationId,
      actorUserId: auth.userId,
      action: 'product_price.archived',
      entityType: 'product_price',
      entityId: price.id,
      payload: { priceListId },
    });

    return price;
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
