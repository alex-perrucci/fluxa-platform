import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lte,
  gte,
  or,
  type SQL,
} from 'drizzle-orm';
import {
  categories,
  locationPriceLists,
  locationProducts,
  priceLists,
  productPrices,
  productVariants,
  products,
  vatRates,
} from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import { pickEffectivePrice } from './catalog-policy';
import { CatalogReferencesService } from './catalog-references.service';
import type { CatalogQueryDto } from './dto/catalog-query.dto';

@Injectable()
export class CatalogQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly references: CatalogReferencesService,
  ) {}

  async forLocation(auth: AuthContext, query: CatalogQueryDto) {
    const organizationId = assertOrganizationScope(auth);
    await this.references.location(organizationId, query.locationId);
    const now = new Date();

    const assignments = await this.database.db
      .select({
        priceListId: priceLists.id,
        assignmentPriority: locationPriceLists.priority,
        listPriority: priceLists.priority,
        currency: priceLists.currency,
      })
      .from(locationPriceLists)
      .innerJoin(
        priceLists,
        and(
          eq(priceLists.id, locationPriceLists.priceListId),
          eq(priceLists.organizationId, organizationId),
        ),
      )
      .where(
        and(
          eq(locationPriceLists.organizationId, organizationId),
          eq(locationPriceLists.locationId, query.locationId),
          eq(locationPriceLists.active, true),
          eq(priceLists.status, 'ACTIVE'),
          or(isNull(priceLists.startsAt), lte(priceLists.startsAt, now)),
          or(isNull(priceLists.endsAt), gte(priceLists.endsAt, now)),
        ),
      )
      .orderBy(
        desc(locationPriceLists.priority),
        desc(priceLists.priority),
        asc(priceLists.id),
      );

    const productConditions: SQL[] = [
      eq(products.organizationId, organizationId),
      eq(products.status, 'ACTIVE'),
      eq(categories.status, 'ACTIVE'),
      eq(vatRates.status, 'ACTIVE'),
    ];
    const enabledAtLocation = or(
      isNull(locationProducts.id),
      eq(locationProducts.enabled, true),
    );
    if (enabledAtLocation) productConditions.push(enabledAtLocation);

    const search = query.q?.trim();
    if (search) {
      const predicate = or(
        ilike(products.code, `%${search}%`),
        ilike(products.name, `%${search}%`),
        ilike(products.sku, `%${search}%`),
        ilike(products.barcode, `%${search}%`),
      );
      if (predicate) productConditions.push(predicate);
    }

    const productRows = await this.database.db
      .select({
        id: products.id,
        code: products.code,
        sku: products.sku,
        barcode: products.barcode,
        name: products.name,
        description: products.description,
        imageUrl: products.imageUrl,
        unit: products.unit,
        quantityScale: products.quantityScale,
        trackAvailability: products.trackAvailability,
        categoryId: categories.id,
        categoryCode: categories.code,
        categoryName: categories.name,
        categorySortOrder: categories.sortOrder,
        productSortOrder: locationProducts.sortOrder,
        vatRateId: vatRates.id,
        vatCode: vatRates.code,
        vatRateBasisPoints: vatRates.rateBasisPoints,
        vatNatureCode: vatRates.natureCode,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .innerJoin(vatRates, eq(vatRates.id, products.vatRateId))
      .leftJoin(
        locationProducts,
        and(
          eq(locationProducts.productId, products.id),
          eq(locationProducts.locationId, query.locationId),
          eq(locationProducts.organizationId, organizationId),
        ),
      )
      .where(and(...productConditions))
      .orderBy(
        asc(categories.sortOrder),
        asc(locationProducts.sortOrder),
        asc(products.name),
      );

    if (productRows.length === 0) {
      return {
        locationId: query.locationId,
        currency: assignments[0]?.currency ?? 'EUR',
        priceLists: assignments.map((item) => item.priceListId),
        categories: [],
      };
    }

    const productIds = productRows.map((product) => product.id);
    const priceListIds = assignments.map(
      (assignment) => assignment.priceListId,
    );

    const [variantRows, priceRows] = await Promise.all([
      this.database.db
        .select()
        .from(productVariants)
        .where(
          and(
            eq(productVariants.organizationId, organizationId),
            eq(productVariants.status, 'ACTIVE'),
            inArray(productVariants.productId, productIds),
          ),
        )
        .orderBy(asc(productVariants.sortOrder), asc(productVariants.name)),
      priceListIds.length
        ? this.database.db
            .select()
            .from(productPrices)
            .where(
              and(
                eq(productPrices.organizationId, organizationId),
                eq(productPrices.status, 'ACTIVE'),
                inArray(productPrices.productId, productIds),
                inArray(productPrices.priceListId, priceListIds),
                or(
                  isNull(productPrices.startsAt),
                  lte(productPrices.startsAt, now),
                ),
                or(
                  isNull(productPrices.endsAt),
                  gte(productPrices.endsAt, now),
                ),
              ),
            )
        : Promise.resolve([]),
    ]);

    const rank = new Map(
      assignments.map((assignment, index) => [assignment.priceListId, index]),
    );
    const variantsByProduct = new Map<string, typeof variantRows>();
    const pricesByKey = new Map<
      string,
      Array<{ priceListId: string; amountCents: number }>
    >();

    for (const variant of variantRows) {
      const current = variantsByProduct.get(variant.productId) ?? [];
      current.push(variant);
      variantsByProduct.set(variant.productId, current);
    }

    for (const price of priceRows) {
      const key = price.variantId
        ? `${price.productId}:${price.variantId}`
        : `${price.productId}:BASE`;
      const current = pricesByKey.get(key) ?? [];
      current.push({
        priceListId: price.priceListId,
        amountCents: price.amountCents,
      });
      pricesByKey.set(key, current);
    }

    const categoryMap = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        sortOrder: number;
        products: unknown[];
      }
    >();

    for (const product of productRows) {
      const basePrice = pickEffectivePrice(
        pricesByKey.get(`${product.id}:BASE`) ?? [],
        rank,
      );
      const variants = (variantsByProduct.get(product.id) ?? []).map(
        (variant) => ({
          id: variant.id,
          code: variant.code,
          sku: variant.sku,
          barcode: variant.barcode,
          name: variant.name,
          sortOrder: variant.sortOrder,
          price: pickEffectivePrice(
            pricesByKey.get(`${product.id}:${variant.id}`) ?? [],
            rank,
          ),
        }),
      );

      const category = categoryMap.get(product.categoryId) ?? {
        id: product.categoryId,
        code: product.categoryCode,
        name: product.categoryName,
        sortOrder: product.categorySortOrder,
        products: [],
      };

      category.products.push({
        id: product.id,
        code: product.code,
        sku: product.sku,
        barcode: product.barcode,
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        unit: product.unit,
        quantityScale: product.quantityScale,
        trackAvailability: product.trackAvailability,
        vat: {
          id: product.vatRateId,
          code: product.vatCode,
          rateBasisPoints: product.vatRateBasisPoints,
          natureCode: product.vatNatureCode,
        },
        price: basePrice,
        variants,
      });

      categoryMap.set(product.categoryId, category);
    }

    return {
      locationId: query.locationId,
      currency: assignments[0]?.currency ?? 'EUR',
      priceLists: assignments.map((item) => item.priceListId),
      categories: Array.from(categoryMap.values()),
    };
  }
}
