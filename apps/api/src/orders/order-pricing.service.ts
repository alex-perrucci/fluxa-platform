import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { buildPriceKey } from '../catalog/catalog-policy';
import {
  calculateGrossFromQuantity,
  calculateVatFromGross,
} from './order-calculator';

interface ProductRow extends QueryResultRow {
  id: string;
  code: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  unit: 'EACH' | 'WEIGHT' | 'VOLUME';
  quantityScale: number;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  vatRateId: string;
  vatCode: string;
  vatRateBasisPoints: number;
  vatNatureCode: string | null;
}

interface VariantRow extends QueryResultRow {
  id: string;
  code: string;
  sku: string | null;
  barcode: string | null;
  name: string;
}

interface PriceRow extends QueryResultRow {
  priceListId: string;
  amountCents: number;
  currency: string;
}

export interface ResolvedOrderItem {
  productId: string;
  variantId: string | null;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  variantCodeSnapshot: string | null;
  variantNameSnapshot: string | null;
  skuSnapshot: string | null;
  barcodeSnapshot: string | null;
  categoryIdSnapshot: string;
  categoryCodeSnapshot: string;
  categoryNameSnapshot: string;
  unitSnapshot: 'EACH' | 'WEIGHT' | 'VOLUME';
  quantityScale: number;
  unitPriceCents: number;
  grossTotalCents: number;
  netTotalCents: number;
  taxTotalCents: number;
  vatRateIdSnapshot: string;
  vatCodeSnapshot: string;
  vatRateBasisPointsSnapshot: number;
  vatNatureCodeSnapshot: string | null;
  priceListIdSnapshot: string;
  currency: string;
}

@Injectable()
export class OrderPricingService {
  async resolve(
    client: PoolClient,
    input: {
      organizationId: string;
      locationId: string;
      productId: string;
      variantId?: string;
      quantityAmount: number;
    },
  ): Promise<ResolvedOrderItem> {
    const productResult = await client.query<ProductRow>(
      `
        SELECT
          p.id,
          p.code,
          p.sku,
          p.barcode,
          p.name,
          p.unit,
          p.quantity_scale AS "quantityScale",
          c.id AS "categoryId",
          c.code AS "categoryCode",
          c.name AS "categoryName",
          vr.id AS "vatRateId",
          vr.code AS "vatCode",
          vr.rate_basis_points AS "vatRateBasisPoints",
          vr.nature_code AS "vatNatureCode"
        FROM products p
        INNER JOIN categories c
          ON c.id = p.category_id
         AND c.organization_id = p.organization_id
         AND c.status = 'ACTIVE'
        INNER JOIN vat_rates vr
          ON vr.id = p.vat_rate_id
         AND vr.organization_id = p.organization_id
         AND vr.status = 'ACTIVE'
        LEFT JOIN location_products lp
          ON lp.organization_id = p.organization_id
         AND lp.location_id = $2
         AND lp.product_id = p.id
        WHERE p.id = $1
          AND p.organization_id = $3
          AND p.status = 'ACTIVE'
          AND (lp.id IS NULL OR lp.enabled = TRUE)
        LIMIT 1
      `,
      [input.productId, input.locationId, input.organizationId],
    );

    const product = productResult.rows[0];

    if (!product) {
      throw new NotFoundException({
        code: 'ORDER_PRODUCT_NOT_AVAILABLE',
        message: 'Prodotto non trovato o non disponibile nel punto vendita.',
      });
    }

    if (product.unit === 'EACH' && product.quantityScale !== 0) {
      throw new UnprocessableEntityException({
        code: 'INVALID_PRODUCT_QUANTITY_SCALE',
        message: 'Un prodotto unitario deve avere precisione quantità zero.',
      });
    }

    let variant: VariantRow | null = null;

    if (input.variantId) {
      const variantResult = await client.query<VariantRow>(
        `
          SELECT id, code, sku, barcode, name
          FROM product_variants
          WHERE id = $1
            AND product_id = $2
            AND organization_id = $3
            AND status = 'ACTIVE'
          LIMIT 1
        `,
        [input.variantId, product.id, input.organizationId],
      );

      variant = variantResult.rows[0] ?? null;

      if (!variant) {
        throw new NotFoundException({
          code: 'ORDER_VARIANT_NOT_AVAILABLE',
          message: 'Variante non trovata o non disponibile.',
        });
      }
    }

    const variantPriceKey = input.variantId
      ? buildPriceKey(product.id, input.variantId)
      : null;
    const basePriceKey = buildPriceKey(product.id);

    let price = variantPriceKey
      ? await this.findPrice(
          client,
          input.organizationId,
          input.locationId,
          product.id,
          variantPriceKey,
        )
      : null;

    price ??= await this.findPrice(
      client,
      input.organizationId,
      input.locationId,
      product.id,
      basePriceKey,
    );

    if (!price) {
      throw new UnprocessableEntityException({
        code: 'ORDER_PRICE_NOT_FOUND',
        message:
          'Nessun prezzo attivo è disponibile per il prodotto nella sede.',
      });
    }

    const grossTotalCents = calculateGrossFromQuantity(
      price.amountCents,
      input.quantityAmount,
      product.quantityScale,
    );
    const vat = calculateVatFromGross(
      grossTotalCents,
      product.vatRateBasisPoints,
    );

    return {
      productId: product.id,
      variantId: variant?.id ?? null,
      productCodeSnapshot: product.code,
      productNameSnapshot: product.name,
      variantCodeSnapshot: variant?.code ?? null,
      variantNameSnapshot: variant?.name ?? null,
      skuSnapshot: variant?.sku ?? product.sku,
      barcodeSnapshot: variant?.barcode ?? product.barcode,
      categoryIdSnapshot: product.categoryId,
      categoryCodeSnapshot: product.categoryCode,
      categoryNameSnapshot: product.categoryName,
      unitSnapshot: product.unit,
      quantityScale: product.quantityScale,
      unitPriceCents: price.amountCents,
      grossTotalCents,
      netTotalCents: vat.netCents,
      taxTotalCents: vat.taxCents,
      vatRateIdSnapshot: product.vatRateId,
      vatCodeSnapshot: product.vatCode,
      vatRateBasisPointsSnapshot: product.vatRateBasisPoints,
      vatNatureCodeSnapshot: product.vatNatureCode,
      priceListIdSnapshot: price.priceListId,
      currency: price.currency,
    };
  }

  private async findPrice(
    client: PoolClient,
    organizationId: string,
    locationId: string,
    productId: string,
    priceKey: string,
  ): Promise<PriceRow | null> {
    const result = await client.query<PriceRow>(
      `
        SELECT
          pp.price_list_id AS "priceListId",
          pp.amount_cents AS "amountCents",
          pl.currency
        FROM location_price_lists lpl
        INNER JOIN price_lists pl
          ON pl.id = lpl.price_list_id
         AND pl.organization_id = lpl.organization_id
        INNER JOIN product_prices pp
          ON pp.price_list_id = pl.id
         AND pp.organization_id = pl.organization_id
         AND pp.product_id = $3
         AND pp.price_key = $4
        WHERE lpl.organization_id = $1
          AND lpl.location_id = $2
          AND lpl.active = TRUE
          AND pl.status = 'ACTIVE'
          AND pp.status = 'ACTIVE'
          AND (pl.starts_at IS NULL OR pl.starts_at <= NOW())
          AND (pl.ends_at IS NULL OR pl.ends_at >= NOW())
          AND (pp.starts_at IS NULL OR pp.starts_at <= NOW())
          AND (pp.ends_at IS NULL OR pp.ends_at >= NOW())
        ORDER BY
          lpl.priority DESC,
          pl.priority DESC,
          pl.id ASC
        LIMIT 1
      `,
      [organizationId, locationId, productId, priceKey],
    );

    return result.rows[0] ?? null;
  }
}
