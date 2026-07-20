import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import {
  auditEvents,
  categories,
  locationProducts,
  productPrices,
  productVariants,
  products,
  vatRates,
} from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import { normalizePagination } from './catalog-policy';
import { CatalogReferencesService } from './catalog-references.service';
import type { CatalogListQueryDto } from './dto/catalog-list-query.dto';
import type { CreateProductDto } from './dto/create-product.dto';
import type { CreateVariantDto } from './dto/create-variant.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import type { UpdateVariantDto } from './dto/update-variant.dto';
import type { UpsertLocationProductDto } from './dto/upsert-location-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly references: CatalogReferencesService,
  ) {}

  async list(auth: AuthContext, query: CatalogListQueryDto) {
    const organizationId = assertOrganizationScope(auth);
    const pagination = normalizePagination(query);
    const conditions: SQL[] = [eq(products.organizationId, organizationId)];

    if (query.status) {
      conditions.push(eq(products.status, query.status));
    }

    const search = query.q?.trim();
    if (search) {
      const predicate = or(
        ilike(products.code, `%${search}%`),
        ilike(products.name, `%${search}%`),
        ilike(products.sku, `%${search}%`),
        ilike(products.barcode, `%${search}%`),
      );
      if (predicate) conditions.push(predicate);
    }

    const where = and(...conditions);
    const [items, totalRows] = await Promise.all([
      this.database.db
        .select({
          id: products.id,
          organizationId: products.organizationId,
          categoryId: products.categoryId,
          categoryName: categories.name,
          vatRateId: products.vatRateId,
          vatCode: vatRates.code,
          vatRateBasisPoints: vatRates.rateBasisPoints,
          code: products.code,
          sku: products.sku,
          barcode: products.barcode,
          name: products.name,
          description: products.description,
          imageUrl: products.imageUrl,
          unit: products.unit,
          quantityScale: products.quantityScale,
          trackAvailability: products.trackAvailability,
          status: products.status,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .innerJoin(vatRates, eq(vatRates.id, products.vatRateId))
        .where(where)
        .orderBy(asc(products.name))
        .limit(pagination.pageSize)
        .offset(pagination.offset),
      this.database.db.select({ value: count() }).from(products).where(where),
    ]);

    return {
      items,
      total: totalRows[0]?.value ?? 0,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async get(auth: AuthContext, productId: string) {
    const organizationId = assertOrganizationScope(auth);
    const [product] = await this.database.db
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Prodotto non trovato.',
      });
    }

    const [variants, locations, prices] = await Promise.all([
      this.database.db
        .select()
        .from(productVariants)
        .where(
          and(
            eq(productVariants.productId, productId),
            eq(productVariants.organizationId, organizationId),
          ),
        )
        .orderBy(asc(productVariants.sortOrder), asc(productVariants.name)),
      this.database.db
        .select()
        .from(locationProducts)
        .where(
          and(
            eq(locationProducts.productId, productId),
            eq(locationProducts.organizationId, organizationId),
          ),
        ),
      this.database.db
        .select()
        .from(productPrices)
        .where(
          and(
            eq(productPrices.productId, productId),
            eq(productPrices.organizationId, organizationId),
          ),
        ),
    ]);

    return { ...product, variants, locations, prices };
  }

  async create(auth: AuthContext, dto: CreateProductDto) {
    const organizationId = assertOrganizationScope(auth);
    const [category, vatRate] = await Promise.all([
      this.references.category(organizationId, dto.categoryId),
      this.references.vatRate(organizationId, dto.vatRateId),
    ]);

    if (category.status !== 'ACTIVE' || vatRate.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'CATALOG_REFERENCE_INACTIVE',
        message: 'Categoria e aliquota IVA devono essere attive.',
      });
    }

    try {
      return await this.database.db.transaction(async (tx) => {
        const [product] = await tx
          .insert(products)
          .values({
            organizationId,
            categoryId: dto.categoryId,
            vatRateId: dto.vatRateId,
            code: dto.code.trim().toUpperCase(),
            sku: dto.sku?.trim().toUpperCase() || null,
            barcode: dto.barcode?.trim() || null,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            imageUrl: dto.imageUrl?.trim() || null,
            unit: dto.unit,
            quantityScale: dto.quantityScale ?? 0,
            trackAvailability: dto.trackAvailability ?? false,
          })
          .returning();

        await tx.insert(auditEvents).values({
          organizationId,
          actorUserId: auth.userId,
          action: 'product.created',
          entityType: 'product',
          entityId: product.id,
          payload: {
            code: product.code,
            categoryId: product.categoryId,
            vatRateId: product.vatRateId,
          },
        });

        return product;
      });
    } catch (error) {
      this.throwProductUniqueViolation(error);
      throw error;
    }
  }

  async update(auth: AuthContext, productId: string, dto: UpdateProductDto) {
    const current = await this.references.product(
      assertOrganizationScope(auth),
      productId,
    );
    const categoryId = dto.categoryId ?? current.categoryId;
    const vatRateId = dto.vatRateId ?? current.vatRateId;
    const [category, vatRate] = await Promise.all([
      this.references.category(current.organizationId, categoryId),
      this.references.vatRate(current.organizationId, vatRateId),
    ]);

    if (
      dto.status !== 'INACTIVE' &&
      (category.status !== 'ACTIVE' || vatRate.status !== 'ACTIVE')
    ) {
      throw new ConflictException({
        code: 'CATALOG_REFERENCE_INACTIVE',
        message: 'Categoria e aliquota IVA devono essere attive.',
      });
    }

    try {
      return await this.database.db.transaction(async (tx) => {
        const [product] = await tx
          .update(products)
          .set({
            categoryId,
            vatRateId,
            code: dto.code?.trim().toUpperCase() ?? current.code,
            sku:
              dto.sku !== undefined
                ? dto.sku.trim().toUpperCase() || null
                : current.sku,
            barcode:
              dto.barcode !== undefined
                ? dto.barcode.trim() || null
                : current.barcode,
            name: dto.name?.trim() ?? current.name,
            description:
              dto.description !== undefined
                ? dto.description.trim() || null
                : current.description,
            imageUrl:
              dto.imageUrl !== undefined
                ? dto.imageUrl?.trim() || null
                : current.imageUrl,
            unit: dto.unit ?? current.unit,
            quantityScale: dto.quantityScale ?? current.quantityScale,
            trackAvailability:
              dto.trackAvailability ?? current.trackAvailability,
            status: dto.status ?? current.status,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, productId),
              eq(products.organizationId, current.organizationId),
            ),
          )
          .returning();

        await tx.insert(auditEvents).values({
          organizationId: current.organizationId,
          actorUserId: auth.userId,
          action: 'product.updated',
          entityType: 'product',
          entityId: product.id,
          payload: { status: product.status },
        });

        return product;
      });
    } catch (error) {
      this.throwProductUniqueViolation(error);
      throw error;
    }
  }

  async archive(auth: AuthContext, productId: string) {
    const current = await this.references.product(
      assertOrganizationScope(auth),
      productId,
    );

    return this.database.db.transaction(async (tx) => {
      const [product] = await tx
        .update(products)
        .set({ status: 'INACTIVE', updatedAt: new Date() })
        .where(
          and(
            eq(products.id, productId),
            eq(products.organizationId, current.organizationId),
          ),
        )
        .returning();

      await tx
        .update(locationProducts)
        .set({ enabled: false, updatedAt: new Date() })
        .where(
          and(
            eq(locationProducts.productId, productId),
            eq(locationProducts.organizationId, current.organizationId),
          ),
        );

      await tx.insert(auditEvents).values({
        organizationId: current.organizationId,
        actorUserId: auth.userId,
        action: 'product.archived',
        entityType: 'product',
        entityId: product.id,
        payload: {},
      });

      return product;
    });
  }

  async createVariant(
    auth: AuthContext,
    productId: string,
    dto: CreateVariantDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    await this.references.product(organizationId, productId);

    try {
      return await this.database.db.transaction(async (tx) => {
        const [variant] = await tx
          .insert(productVariants)
          .values({
            organizationId,
            productId,
            code: dto.code.trim().toUpperCase(),
            sku: dto.sku?.trim().toUpperCase() || null,
            barcode: dto.barcode?.trim() || null,
            name: dto.name.trim(),
            sortOrder: dto.sortOrder ?? 0,
          })
          .returning();

        await tx.insert(auditEvents).values({
          organizationId,
          actorUserId: auth.userId,
          action: 'product_variant.created',
          entityType: 'product_variant',
          entityId: variant.id,
          payload: { productId, code: variant.code },
        });

        return variant;
      });
    } catch (error) {
      this.throwVariantUniqueViolation(error);
      throw error;
    }
  }

  async updateVariant(
    auth: AuthContext,
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.references.variant(
      organizationId,
      productId,
      variantId,
    );

    try {
      const [variant] = await this.database.db
        .update(productVariants)
        .set({
          code: dto.code?.trim().toUpperCase() ?? current.code,
          sku:
            dto.sku !== undefined
              ? dto.sku.trim().toUpperCase() || null
              : current.sku,
          barcode:
            dto.barcode !== undefined
              ? dto.barcode.trim() || null
              : current.barcode,
          name: dto.name?.trim() ?? current.name,
          sortOrder: dto.sortOrder ?? current.sortOrder,
          status: dto.status ?? current.status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(productVariants.id, variantId),
            eq(productVariants.productId, productId),
            eq(productVariants.organizationId, organizationId),
          ),
        )
        .returning();

      await this.database.db.insert(auditEvents).values({
        organizationId,
        actorUserId: auth.userId,
        action: 'product_variant.updated',
        entityType: 'product_variant',
        entityId: variant.id,
        payload: { productId, status: variant.status },
      });

      return variant;
    } catch (error) {
      this.throwVariantUniqueViolation(error);
      throw error;
    }
  }

  async upsertLocation(
    auth: AuthContext,
    productId: string,
    locationId: string,
    dto: UpsertLocationProductDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    await Promise.all([
      this.references.product(organizationId, productId),
      this.references.location(organizationId, locationId),
    ]);

    const [setting] = await this.database.db
      .insert(locationProducts)
      .values({
        organizationId,
        locationId,
        productId,
        enabled: dto.enabled,
        sortOrder: dto.sortOrder ?? 0,
      })
      .onConflictDoUpdate({
        target: [locationProducts.locationId, locationProducts.productId],
        set: {
          enabled: dto.enabled,
          sortOrder: dto.sortOrder ?? 0,
          updatedAt: new Date(),
        },
      })
      .returning();

    await this.database.db.insert(auditEvents).values({
      organizationId,
      actorUserId: auth.userId,
      action: 'location_product.updated',
      entityType: 'location_product',
      entityId: setting.id,
      payload: { productId, locationId, enabled: setting.enabled },
    });

    return setting;
  }

  private throwProductUniqueViolation(error: unknown): void {
    if (!this.isUniqueViolation(error)) return;

    throw new ConflictException({
      code: 'PRODUCT_IDENTIFIER_ALREADY_EXISTS',
      message:
        "Codice, SKU o barcode del prodotto è già utilizzato nell'organizzazione.",
    });
  }

  private throwVariantUniqueViolation(error: unknown): void {
    if (!this.isUniqueViolation(error)) return;

    throw new ConflictException({
      code: 'PRODUCT_VARIANT_IDENTIFIER_ALREADY_EXISTS',
      message:
        "Codice, SKU o barcode della variante è già utilizzato nell'organizzazione.",
    });
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
