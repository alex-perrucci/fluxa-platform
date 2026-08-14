import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService, type OrderAdjustmentType } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { AddManualOrderItemDto } from './dto/add-manual-order-item.dto';
import {
  calculateOrderTotals,
  calculateVatFromGross,
  type CalculationAdjustment,
  type CalculationItem,
} from './order-calculator';
import { OrderAccessService } from './order-access.service';
import { mutationRequestHash } from './order-idempotency';
import { OrdersService } from './orders.service';

const MANUAL_CODE = '__FLUXA_MANUAL__';
const MANUAL_CATEGORY_NAME = 'Vendita libera';
const MANUAL_PRODUCT_NAME = 'Vendita libera';
const MANUAL_PRICE_LIST_NAME = 'Vendite libere POS';

interface OrderRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  currency: string;
  status: string;
  version: number;
}

interface ExistingMutationRow extends QueryResultRow {
  operation: string;
  requestHash: string;
}

interface VatRateRow extends QueryResultRow {
  id: string;
  code: string;
  rateBasisPoints: number;
  natureCode: string | null;
}

interface IdRow extends QueryResultRow {
  id: string;
}

interface CalculationItemRow extends QueryResultRow {
  id: string;
  grossTotalCents: number;
  vatRateBasisPointsSnapshot: number;
  vatNatureCodeSnapshot: string | null;
}

interface AdjustmentRow extends QueryResultRow {
  id: string;
  type: OrderAdjustmentType;
  value: number;
}

@Injectable()
export class ManualOrderItemsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: OrderAccessService,
    private readonly orders: OrdersService,
  ) {}

  async add(auth: AuthContext, orderId: string, dto: AddManualOrderItemDto) {
    const organizationId = assertOrganizationScope(auth);
    const orderLookup = await this.database.pool.query<OrderRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          currency,
          status,
          version
        FROM orders
        WHERE id=$1 AND organization_id=$2
        LIMIT 1
      `,
      [orderId, organizationId],
    );
    const existingOrder = orderLookup.rows[0];
    if (!existingOrder) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Ordine non trovato.',
      });
    }
    await this.access.assertLocation(auth, existingOrder.locationId);

    const description = dto.description?.trim() || MANUAL_PRODUCT_NAME;
    const note = dto.note?.trim() || null;
    const operation = 'order.item.manual.add';
    const requestHash = mutationRequestHash({
      operation,
      expectedVersion: dto.expectedVersion,
      payload: {
        clientItemId: dto.clientItemId,
        amountCents: dto.amountCents,
        description,
        note,
      },
    });

    await this.withTransaction(async (client) => {
      const lockedResult = await client.query<OrderRow>(
        `
          SELECT
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            currency,
            status,
            version
          FROM orders
          WHERE id=$1 AND organization_id=$2
          FOR UPDATE
        `,
        [orderId, organizationId],
      );
      const order = lockedResult.rows[0];
      if (!order) {
        throw new NotFoundException({
          code: 'ORDER_NOT_FOUND',
          message: 'Ordine non trovato.',
        });
      }

      const mutationResult = await client.query<ExistingMutationRow>(
        `
          SELECT operation,request_hash AS "requestHash"
          FROM order_mutations
          WHERE order_id=$1 AND device_id=$2 AND mutation_id=$3
          LIMIT 1
        `,
        [orderId, auth.deviceId, dto.mutationId],
      );
      const existingMutation = mutationResult.rows[0];
      if (existingMutation) {
        if (
          existingMutation.operation !== operation ||
          existingMutation.requestHash !== requestHash
        ) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message:
              'La mutationId è già stata usata con una richiesta differente.',
          });
        }
        return;
      }

      if (order.version !== dto.expectedVersion) {
        throw new ConflictException({
          code: 'ORDER_VERSION_CONFLICT',
          message: "L'ordine è stato modificato da un altro dispositivo.",
          currentVersion: order.version,
          expectedVersion: dto.expectedVersion,
        });
      }
      if (order.status !== 'OPEN') {
        throw new ConflictException({
          code: 'ORDER_NOT_MUTABLE',
          message: `Operazione non consentita quando l'ordine è ${order.status}.`,
          status: order.status,
        });
      }

      const duplicateItem = await client.query<IdRow>(
        `SELECT id FROM order_items WHERE order_id=$1 AND client_item_id=$2 LIMIT 1`,
        [orderId, dto.clientItemId],
      );
      if (duplicateItem.rows[0]) {
        throw new ConflictException({
          code: 'ORDER_CLIENT_ITEM_ALREADY_EXISTS',
          message: 'La riga locale è già presente nell’ordine.',
        });
      }

      const vatResult = await client.query<VatRateRow>(
        `
          SELECT
            id,
            code,
            rate_basis_points AS "rateBasisPoints",
            nature_code AS "natureCode"
          FROM vat_rates
          WHERE organization_id=$1 AND status='ACTIVE' AND is_default=TRUE
          ORDER BY created_at,id
          LIMIT 1
        `,
        [organizationId],
      );
      const vat = vatResult.rows[0];
      if (!vat) {
        throw new UnprocessableEntityException({
          code: 'MANUAL_SALE_DEFAULT_VAT_REQUIRED',
          message:
            'Configura un’aliquota IVA predefinita prima di usare la vendita a importo libero.',
        });
      }

      const categoryId = await this.ensureManualCategory(
        client,
        organizationId,
      );
      const priceListId = await this.ensureManualPriceList(
        client,
        organizationId,
        order.currency,
      );
      const productId = await this.ensureManualProduct(
        client,
        organizationId,
        categoryId,
        vat.id,
      );
      const vatAmounts = calculateVatFromGross(
        dto.amountCents,
        vat.rateBasisPoints,
      );
      const sortResult = await client.query<
        { nextSort: number } & QueryResultRow
      >(
        `SELECT COALESCE(MAX(sort_order),-1)+1 AS "nextSort" FROM order_items WHERE order_id=$1`,
        [orderId],
      );
      const itemId = randomUUID();

      await client.query(
        `
          INSERT INTO order_items(
            id,organization_id,order_id,client_item_id,product_id,variant_id,
            product_code_snapshot,product_name_snapshot,variant_code_snapshot,
            variant_name_snapshot,sku_snapshot,barcode_snapshot,
            category_id_snapshot,category_code_snapshot,category_name_snapshot,
            unit_snapshot,quantity_amount,quantity_scale,unit_price_cents,
            gross_total_cents,allocated_discount_cents,final_gross_cents,
            final_net_cents,final_tax_cents,vat_rate_id_snapshot,
            vat_code_snapshot,vat_rate_basis_points_snapshot,
            vat_nature_code_snapshot,price_list_id_snapshot,note,sort_order
          ) VALUES(
            $1,$2,$3,$4,$5,NULL,$6,$7,NULL,NULL,NULL,NULL,
            $8,$9,$10,'EACH',1,0,$11,$11,0,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
          )
        `,
        [
          itemId,
          organizationId,
          orderId,
          dto.clientItemId,
          productId,
          MANUAL_CODE,
          description,
          categoryId,
          MANUAL_CODE,
          MANUAL_CATEGORY_NAME,
          dto.amountCents,
          vatAmounts.netCents,
          vatAmounts.taxCents,
          vat.id,
          vat.code,
          vat.rateBasisPoints,
          vat.natureCode,
          priceListId,
          note,
          sortResult.rows[0]?.nextSort ?? 0,
        ],
      );

      const responseVersion = await this.recalculate(client, order);
      await client.query(
        `
          INSERT INTO order_mutations(
            id,organization_id,order_id,device_id,mutation_id,operation,
            request_hash,response_version
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          randomUUID(),
          organizationId,
          orderId,
          auth.deviceId,
          dto.mutationId,
          operation,
          requestHash,
          responseVersion,
        ],
      );
      await client.query(
        `
          INSERT INTO audit_events(
            id,organization_id,actor_user_id,action,entity_type,entity_id,payload
          ) VALUES($1,$2,$3,'order.item.manual.added','order',$4,$5::jsonb)
        `,
        [
          randomUUID(),
          organizationId,
          auth.userId,
          orderId,
          JSON.stringify({
            itemId,
            amountCents: dto.amountCents,
            description,
            vatCode: vat.code,
            vatRateBasisPoints: vat.rateBasisPoints,
          }),
        ],
      );
    });

    return this.orders.get(auth, orderId);
  }

  private async ensureManualCategory(
    client: PoolClient,
    organizationId: string,
  ): Promise<string> {
    const result = await client.query<IdRow>(
      `
        INSERT INTO categories(id,organization_id,code,name,status)
        VALUES($1,$2,$3,$4,'INACTIVE')
        ON CONFLICT(organization_id,code) DO UPDATE SET
          name=EXCLUDED.name,status='INACTIVE',updated_at=NOW()
        RETURNING id
      `,
      [randomUUID(), organizationId, MANUAL_CODE, MANUAL_CATEGORY_NAME],
    );
    return result.rows[0].id;
  }

  private async ensureManualPriceList(
    client: PoolClient,
    organizationId: string,
    currency: string,
  ): Promise<string> {
    const result = await client.query<IdRow>(
      `
        INSERT INTO price_lists(id,organization_id,code,name,currency,status)
        VALUES($1,$2,$3,$4,$5,'INACTIVE')
        ON CONFLICT(organization_id,code) DO UPDATE SET
          name=EXCLUDED.name,currency=EXCLUDED.currency,status='INACTIVE',updated_at=NOW()
        RETURNING id
      `,
      [
        randomUUID(),
        organizationId,
        MANUAL_CODE,
        MANUAL_PRICE_LIST_NAME,
        currency,
      ],
    );
    return result.rows[0].id;
  }

  private async ensureManualProduct(
    client: PoolClient,
    organizationId: string,
    categoryId: string,
    vatRateId: string,
  ): Promise<string> {
    const result = await client.query<IdRow>(
      `
        INSERT INTO products(
          id,organization_id,category_id,vat_rate_id,code,name,unit,
          quantity_scale,track_availability,status
        ) VALUES($1,$2,$3,$4,$5,$6,'EACH',0,FALSE,'INACTIVE')
        ON CONFLICT(organization_id,code) DO UPDATE SET
          category_id=EXCLUDED.category_id,
          vat_rate_id=EXCLUDED.vat_rate_id,
          name=EXCLUDED.name,
          status='INACTIVE',
          updated_at=NOW()
        RETURNING id
      `,
      [
        randomUUID(),
        organizationId,
        categoryId,
        vatRateId,
        MANUAL_CODE,
        MANUAL_PRODUCT_NAME,
      ],
    );
    return result.rows[0].id;
  }

  private async recalculate(
    client: PoolClient,
    order: OrderRow,
  ): Promise<number> {
    const [itemResult, adjustmentResult] = await Promise.all([
      client.query<CalculationItemRow>(
        `
          SELECT
            id,
            gross_total_cents AS "grossTotalCents",
            vat_rate_basis_points_snapshot AS "vatRateBasisPointsSnapshot",
            vat_nature_code_snapshot AS "vatNatureCodeSnapshot"
          FROM order_items
          WHERE organization_id=$1 AND order_id=$2
          ORDER BY sort_order,created_at,id
        `,
        [order.organizationId, order.id],
      ),
      client.query<AdjustmentRow>(
        `
          SELECT id,type,value
          FROM order_adjustments
          WHERE organization_id=$1 AND order_id=$2
          ORDER BY created_at,id
        `,
        [order.organizationId, order.id],
      ),
    ]);

    const items: CalculationItem[] = itemResult.rows.map((item) => ({
      id: item.id,
      grossCents: item.grossTotalCents,
      vatRateBasisPoints: item.vatRateBasisPointsSnapshot,
      vatNatureCode: item.vatNatureCodeSnapshot,
    }));
    const adjustments: CalculationAdjustment[] = adjustmentResult.rows.map(
      (adjustment) => ({
        id: adjustment.id,
        type: adjustment.type,
        value: adjustment.value,
      }),
    );

    let calculation: ReturnType<typeof calculateOrderTotals>;
    try {
      calculation = calculateOrderTotals(items, adjustments);
    } catch (error) {
      if (
        error instanceof RangeError &&
        error.message === 'DISCOUNT_EXCEEDS_SUBTOTAL'
      ) {
        throw new BadRequestException({
          code: 'DISCOUNT_EXCEEDS_SUBTOTAL',
          message: "Lo sconto supera il subtotale dell'ordine.",
        });
      }
      throw error;
    }

    for (const line of calculation.lines) {
      await client.query(
        `
          UPDATE order_items SET
            allocated_discount_cents=$2,
            final_gross_cents=$3,
            final_net_cents=$4,
            final_tax_cents=$5,
            updated_at=NOW()
          WHERE id=$1
        `,
        [
          line.id,
          line.allocatedDiscountCents,
          line.finalGrossCents,
          line.finalNetCents,
          line.finalTaxCents,
        ],
      );
    }

    for (const adjustment of calculation.adjustments) {
      await client.query(
        `UPDATE order_adjustments SET applied_cents=$2 WHERE id=$1`,
        [adjustment.id, adjustment.appliedCents],
      );
    }

    await client.query(
      `DELETE FROM order_vat_summaries WHERE organization_id=$1 AND order_id=$2`,
      [order.organizationId, order.id],
    );
    for (const summary of calculation.vatSummaries) {
      await client.query(
        `
          INSERT INTO order_vat_summaries(
            id,organization_id,order_id,vat_key,vat_rate_basis_points,
            vat_nature_code,gross_cents,net_cents,tax_cents
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          randomUUID(),
          order.organizationId,
          order.id,
          summary.key,
          summary.vatRateBasisPoints,
          summary.vatNatureCode,
          summary.grossCents,
          summary.netCents,
          summary.taxCents,
        ],
      );
    }

    const responseVersion = order.version + 1;
    const updated = await client.query(
      `
        UPDATE orders SET
          subtotal_cents=$4,
          discount_cents=$5,
          total_cents=$6,
          net_total_cents=$7,
          tax_total_cents=$8,
          version=$9,
          updated_at=NOW()
        WHERE id=$1 AND organization_id=$2 AND version=$3
        RETURNING id
      `,
      [
        order.id,
        order.organizationId,
        order.version,
        calculation.subtotalCents,
        calculation.discountCents,
        calculation.totalCents,
        calculation.netTotalCents,
        calculation.taxTotalCents,
        responseVersion,
      ],
    );
    if (updated.rowCount !== 1) {
      throw new ConflictException({
        code: 'ORDER_VERSION_CONFLICT',
        message: "L'ordine è stato modificato durante il ricalcolo.",
      });
    }
    return responseVersion;
  }

  private async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
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
}
