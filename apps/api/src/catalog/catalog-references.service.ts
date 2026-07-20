import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  categories,
  locations,
  priceLists,
  productVariants,
  products,
  vatRates,
} from '@fluxa/database';
import { DatabaseService } from '@fluxa/database';

@Injectable()
export class CatalogReferencesService {
  constructor(private readonly database: DatabaseService) {}

  async category(organizationId: string, categoryId: string) {
    const [category] = await this.database.db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: "Categoria non trovata nell'organizzazione corrente.",
      });
    }

    return category;
  }

  async vatRate(organizationId: string, vatRateId: string) {
    const [vatRate] = await this.database.db
      .select()
      .from(vatRates)
      .where(
        and(
          eq(vatRates.id, vatRateId),
          eq(vatRates.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!vatRate) {
      throw new NotFoundException({
        code: 'VAT_RATE_NOT_FOUND',
        message: "Aliquota IVA non trovata nell'organizzazione corrente.",
      });
    }

    return vatRate;
  }

  async location(organizationId: string, locationId: string) {
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
        message: "Punto vendita non trovato nell'organizzazione corrente.",
      });
    }

    return location;
  }

  async product(organizationId: string, productId: string) {
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
        message: "Prodotto non trovato nell'organizzazione corrente.",
      });
    }

    return product;
  }

  async variant(organizationId: string, productId: string, variantId: string) {
    const [variant] = await this.database.db
      .select()
      .from(productVariants)
      .where(
        and(
          eq(productVariants.id, variantId),
          eq(productVariants.productId, productId),
          eq(productVariants.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!variant) {
      throw new NotFoundException({
        code: 'PRODUCT_VARIANT_NOT_FOUND',
        message: "Variante non trovata nell'organizzazione corrente.",
      });
    }

    return variant;
  }

  async priceList(organizationId: string, priceListId: string) {
    const [priceList] = await this.database.db
      .select()
      .from(priceLists)
      .where(
        and(
          eq(priceLists.id, priceListId),
          eq(priceLists.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!priceList) {
      throw new NotFoundException({
        code: 'PRICE_LIST_NOT_FOUND',
        message: "Listino non trovato nell'organizzazione corrente.",
      });
    }

    return priceList;
  }
}
