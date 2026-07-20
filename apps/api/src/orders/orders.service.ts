import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import {
  DatabaseService,
  type OrderAdjustmentType,
  type OrderServiceMode,
  type OrderStatus,
} from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { AddOrderItemDto } from './dto/add-order-item.dto';
import type { CancelOrderDto } from './dto/cancel-order.dto';
import type { CreateOrderAdjustmentDto } from './dto/create-order-adjustment.dto';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { OrderListQueryDto } from './dto/order-list-query.dto';
import type { OrderMutationDto } from './dto/order-mutation.dto';
import type { UpdateOrderItemDto } from './dto/update-order-item.dto';
import {
  calculateGrossFromQuantity,
  calculateOrderTotals,
  calculateVatFromGross,
  type CalculationAdjustment,
  type CalculationItem,
} from './order-calculator';
import { OrderAccessService } from './order-access.service';
import { mutationRequestHash } from './order-idempotency';
import { businessDateForTimezone, formatOrderNumber } from './order-number';
import {
  OrderPricingService,
  type ResolvedOrderItem,
} from './order-pricing.service';

interface OrderHeaderRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  deviceId: string;
  createdByUserId: string;
  clientOrderId: string;
  number: string;
  businessDate: string;
  status: OrderStatus;
  serviceMode: OrderServiceMode;
  customerNote: string | null;
  currency: string;
  version: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  netTotalCents: number;
  taxTotalCents: number;
  heldAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface OrderItemRow extends QueryResultRow {
  id: string;
  clientItemId: string;
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
  quantityAmount: number;
  quantityScale: number;
  unitPriceCents: number;
  grossTotalCents: number;
  allocatedDiscountCents: number;
  finalGrossCents: number;
  finalNetCents: number;
  finalTaxCents: number;
  vatRateIdSnapshot: string;
  vatCodeSnapshot: string;
  vatRateBasisPointsSnapshot: number;
  vatNatureCodeSnapshot: string | null;
  priceListIdSnapshot: string;
  note: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

interface AdjustmentRow extends QueryResultRow {
  id: string;
  clientAdjustmentId: string;
  type: OrderAdjustmentType;
  value: number;
  reason: string;
  appliedCents: number;
  createdByUserId: string;
  createdAt: Date;
}

interface VatSummaryRow extends QueryResultRow {
  vatKey: string;
  vatRateBasisPoints: number;
  vatNatureCode: string | null;
  grossCents: number;
  netCents: number;
  taxCents: number;
}

interface SequenceRow extends QueryResultRow {
  lastValue: number;
}

interface MutationRow extends QueryResultRow {
  operation: string;
  requestHash: string;
  responseVersion: number;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface MutationContext {
  order: OrderHeaderRow;
  requestHash: string;
  duplicate: boolean;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: OrderAccessService,
    private readonly pricing: OrderPricingService,
  ) {}

  async list(auth: AuthContext, query: OrderListQueryDto) {
    const access = await this.access.assertLocation(auth, query.locationId);
    const offset = (query.page - 1) * query.pageSize;
    const values = [
      access.organizationId,
      access.locationId,
      query.status ?? null,
      query.pageSize,
      offset,
    ];

    const [ordersResult, countResult] = await Promise.all([
      this.database.pool.query<OrderHeaderRow>(
        `
          SELECT
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            device_id AS "deviceId",
            created_by_user_id AS "createdByUserId",
            client_order_id AS "clientOrderId",
            number,
            business_date AS "businessDate",
            status,
            service_mode AS "serviceMode",
            customer_note AS "customerNote",
            currency,
            version,
            subtotal_cents AS "subtotalCents",
            discount_cents AS "discountCents",
            total_cents AS "totalCents",
            net_total_cents AS "netTotalCents",
            tax_total_cents AS "taxTotalCents",
            held_at AS "heldAt",
            cancelled_at AS "cancelledAt",
            cancel_reason AS "cancelReason",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM orders
          WHERE organization_id = $1
            AND location_id = $2
            AND ($3::text IS NULL OR status::text = $3)
          ORDER BY created_at DESC, id DESC
          LIMIT $4 OFFSET $5
        `,
        values,
      ),
      this.database.pool.query<CountRow>(
        `
          SELECT COUNT(*)::int AS count
          FROM orders
          WHERE organization_id = $1
            AND location_id = $2
            AND ($3::text IS NULL OR status::text = $3)
        `,
        values.slice(0, 3),
      ),
    ]);

    return {
      page: query.page,
      pageSize: query.pageSize,
      total: countResult.rows[0]?.count ?? 0,
      items: ordersResult.rows,
    };
  }

  async get(auth: AuthContext, orderId: string) {
    const organizationId = assertOrganizationScope(auth);
    const order = await this.findOrder(organizationId, orderId);

    if (!order) {
      throw this.orderNotFound();
    }

    await this.access.assertLocation(auth, order.locationId);

    const [items, adjustments, vatSummaries] = await Promise.all([
      this.database.pool.query<OrderItemRow>(
        `
          SELECT
            id,
            client_item_id AS "clientItemId",
            product_id AS "productId",
            variant_id AS "variantId",
            product_code_snapshot AS "productCodeSnapshot",
            product_name_snapshot AS "productNameSnapshot",
            variant_code_snapshot AS "variantCodeSnapshot",
            variant_name_snapshot AS "variantNameSnapshot",
            sku_snapshot AS "skuSnapshot",
            barcode_snapshot AS "barcodeSnapshot",
            category_id_snapshot AS "categoryIdSnapshot",
            category_code_snapshot AS "categoryCodeSnapshot",
            category_name_snapshot AS "categoryNameSnapshot",
            unit_snapshot AS "unitSnapshot",
            quantity_amount AS "quantityAmount",
            quantity_scale AS "quantityScale",
            unit_price_cents AS "unitPriceCents",
            gross_total_cents AS "grossTotalCents",
            allocated_discount_cents AS "allocatedDiscountCents",
            final_gross_cents AS "finalGrossCents",
            final_net_cents AS "finalNetCents",
            final_tax_cents AS "finalTaxCents",
            vat_rate_id_snapshot AS "vatRateIdSnapshot",
            vat_code_snapshot AS "vatCodeSnapshot",
            vat_rate_basis_points_snapshot AS "vatRateBasisPointsSnapshot",
            vat_nature_code_snapshot AS "vatNatureCodeSnapshot",
            price_list_id_snapshot AS "priceListIdSnapshot",
            note,
            sort_order AS "sortOrder",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM order_items
          WHERE organization_id = $1
            AND order_id = $2
          ORDER BY sort_order ASC, created_at ASC, id ASC
        `,
        [organizationId, orderId],
      ),
      this.database.pool.query<AdjustmentRow>(
        `
          SELECT
            id,
            client_adjustment_id AS "clientAdjustmentId",
            type,
            value,
            reason,
            applied_cents AS "appliedCents",
            created_by_user_id AS "createdByUserId",
            created_at AS "createdAt"
          FROM order_adjustments
          WHERE organization_id = $1
            AND order_id = $2
          ORDER BY created_at ASC, id ASC
        `,
        [organizationId, orderId],
      ),
      this.database.pool.query<VatSummaryRow>(
        `
          SELECT
            vat_key AS "vatKey",
            vat_rate_basis_points AS "vatRateBasisPoints",
            vat_nature_code AS "vatNatureCode",
            gross_cents AS "grossCents",
            net_cents AS "netCents",
            tax_cents AS "taxCents"
          FROM order_vat_summaries
          WHERE organization_id = $1
            AND order_id = $2
          ORDER BY vat_rate_basis_points ASC, vat_key ASC
        `,
        [organizationId, orderId],
      ),
    ]);

    return {
      ...order,
      items: items.rows,
      adjustments: adjustments.rows,
      vatSummaries: vatSummaries.rows,
    };
  }

  async create(auth: AuthContext, dto: CreateOrderDto) {
    const access = await this.access.assertLocation(auth, dto.locationId);
    const existing = await this.findByClientOrderId(
      access.organizationId,
      auth.deviceId,
      dto.clientOrderId,
    );

    if (existing) {
      this.assertEquivalentCreate(existing, dto);
      return this.get(auth, existing.id);
    }

    const businessDate = businessDateForTimezone(new Date(), access.timezone);

    try {
      const orderId = await this.withTransaction(async (client) => {
        const sequenceResult = await client.query<SequenceRow>(
          `
            INSERT INTO location_order_sequences (
              id,
              organization_id,
              location_id,
              business_date,
              last_value,
              updated_at
            )
            VALUES ($1, $2, $3, $4, 1, NOW())
            ON CONFLICT (organization_id, location_id, business_date)
            DO UPDATE SET
              last_value = location_order_sequences.last_value + 1,
              updated_at = NOW()
            RETURNING last_value AS "lastValue"
          `,
          [
            randomUUID(),
            access.organizationId,
            access.locationId,
            businessDate,
          ],
        );

        const sequence = sequenceResult.rows[0]?.lastValue;

        if (!sequence) {
          throw new Error('Unable to allocate the order sequence.');
        }

        const orderNumber = formatOrderNumber(businessDate, sequence);
        const id = randomUUID();

        await client.query(
          `
            INSERT INTO orders (
              id,
              organization_id,
              location_id,
              device_id,
              created_by_user_id,
              client_order_id,
              number,
              business_date,
              status,
              service_mode,
              customer_note,
              currency,
              version
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              'OPEN', $9, $10, 'EUR', 1
            )
          `,
          [
            id,
            access.organizationId,
            access.locationId,
            auth.deviceId,
            auth.userId,
            dto.clientOrderId,
            orderNumber,
            businessDate,
            dto.serviceMode,
            dto.customerNote?.trim() || null,
          ],
        );

        await this.audit(client, {
          organizationId: access.organizationId,
          actorUserId: auth.userId,
          action: 'order.created',
          orderId: id,
          payload: {
            locationId: access.locationId,
            number: orderNumber,
            clientOrderId: dto.clientOrderId,
          },
        });
        await this.outbox(client, {
          topic: 'order.created',
          orderId: id,
          payload: {
            organizationId: access.organizationId,
            locationId: access.locationId,
            orderNumber,
          },
        });

        return id;
      });

      return this.get(auth, orderId);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const duplicate = await this.findByClientOrderId(
          access.organizationId,
          auth.deviceId,
          dto.clientOrderId,
        );

        if (duplicate) {
          this.assertEquivalentCreate(duplicate, dto);
          return this.get(auth, duplicate.id);
        }
      }

      throw error;
    }
  }

  async addItem(auth: AuthContext, orderId: string, dto: AddOrderItemDto) {
    const order = await this.requireAccessibleOrder(auth, orderId);

    await this.withTransaction(async (client) => {
      const mutation = await this.beginMutation(
        client,
        auth,
        orderId,
        'order.item.add',
        dto.mutationId,
        dto.expectedVersion,
        {
          clientItemId: dto.clientItemId,
          productId: dto.productId,
          variantId: dto.variantId ?? null,
          quantityAmount: dto.quantityAmount,
          note: dto.note?.trim() || null,
        },
        ['OPEN'],
      );

      if (mutation.duplicate) return true;

      const existingItem = await client.query<OrderItemRow>(
        `
          SELECT
            id,
            client_item_id AS "clientItemId",
            product_id AS "productId",
            variant_id AS "variantId",
            quantity_amount AS "quantityAmount",
            note
          FROM order_items
          WHERE order_id = $1
            AND client_item_id = $2
          LIMIT 1
        `,
        [orderId, dto.clientItemId],
      );

      if (existingItem.rows[0]) {
        throw new ConflictException({
          code: 'CLIENT_ITEM_ID_ALREADY_USED',
          message: "Il clientItemId è già stato usato per un'altra riga.",
        });
      }

      const resolved = await this.pricing.resolve(client, {
        organizationId: order.organizationId,
        locationId: order.locationId,
        productId: dto.productId,
        variantId: dto.variantId,
        quantityAmount: dto.quantityAmount,
      });

      if (mutation.order.currency !== resolved.currency) {
        if (
          mutation.order.subtotalCents > 0 ||
          mutation.order.discountCents > 0
        ) {
          throw new ConflictException({
            code: 'ORDER_CURRENCY_CONFLICT',
            message: "Il prezzo usa una valuta diversa da quella dell'ordine.",
          });
        }

        await client.query(`UPDATE orders SET currency = $2 WHERE id = $1`, [
          orderId,
          resolved.currency,
        ]);
      }

      const sortResult = await client.query<CountRow>(
        `
          SELECT COUNT(*)::int AS count
          FROM order_items
          WHERE order_id = $1
        `,
        [orderId],
      );
      const itemId = randomUUID();

      await this.insertResolvedItem(client, {
        id: itemId,
        orderId,
        organizationId: order.organizationId,
        clientItemId: dto.clientItemId,
        quantityAmount: dto.quantityAmount,
        note: dto.note?.trim() || null,
        sortOrder: sortResult.rows[0]?.count ?? 0,
        resolved,
      });

      const responseVersion = await this.recalculate(client, mutation.order);
      await this.recordMutation(
        client,
        auth,
        orderId,
        dto.mutationId,
        'order.item.add',
        mutation.requestHash,
        responseVersion,
      );
      await this.audit(client, {
        organizationId: order.organizationId,
        actorUserId: auth.userId,
        action: 'order.item.added',
        orderId,
        payload: {
          itemId,
          productId: dto.productId,
          variantId: dto.variantId ?? null,
          quantityAmount: dto.quantityAmount,
        },
      });

      return false;
    });

    return this.get(auth, orderId);
  }

  async updateItem(
    auth: AuthContext,
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemDto,
  ) {
    const order = await this.requireAccessibleOrder(auth, orderId);

    if (dto.quantityAmount === undefined && dto.note === undefined) {
      throw new BadRequestException({
        code: 'ORDER_ITEM_UPDATE_EMPTY',
        message: 'Indica almeno quantità o nota da aggiornare.',
      });
    }

    await this.withTransaction(async (client) => {
      const mutation = await this.beginMutation(
        client,
        auth,
        orderId,
        'order.item.update',
        dto.mutationId,
        dto.expectedVersion,
        {
          itemId,
          quantityAmount: dto.quantityAmount,
          note: dto.note,
        },
        ['OPEN'],
      );

      if (mutation.duplicate) return;

      const itemResult = await client.query<OrderItemRow>(
        `
          SELECT
            id,
            quantity_amount AS "quantityAmount",
            quantity_scale AS "quantityScale",
            unit_price_cents AS "unitPriceCents",
            vat_rate_basis_points_snapshot AS "vatRateBasisPointsSnapshot",
            note
          FROM order_items
          WHERE id = $1
            AND order_id = $2
            AND organization_id = $3
          LIMIT 1
        `,
        [itemId, orderId, order.organizationId],
      );
      const item = itemResult.rows[0];

      if (!item) {
        throw new NotFoundException({
          code: 'ORDER_ITEM_NOT_FOUND',
          message: "Riga d'ordine non trovata.",
        });
      }

      const quantityAmount = dto.quantityAmount ?? item.quantityAmount;
      const grossTotalCents = calculateGrossFromQuantity(
        item.unitPriceCents,
        quantityAmount,
        item.quantityScale,
      );
      const vat = calculateVatFromGross(
        grossTotalCents,
        item.vatRateBasisPointsSnapshot,
      );

      await client.query(
        `
          UPDATE order_items
          SET
            quantity_amount = $4,
            gross_total_cents = $5,
            allocated_discount_cents = 0,
            final_gross_cents = $5,
            final_net_cents = $6,
            final_tax_cents = $7,
            note = $8,
            updated_at = NOW()
          WHERE id = $1
            AND order_id = $2
            AND organization_id = $3
        `,
        [
          itemId,
          orderId,
          order.organizationId,
          quantityAmount,
          grossTotalCents,
          vat.netCents,
          vat.taxCents,
          dto.note !== undefined ? dto.note.trim() || null : item.note,
        ],
      );

      const responseVersion = await this.recalculate(client, mutation.order);
      await this.recordMutation(
        client,
        auth,
        orderId,
        dto.mutationId,
        'order.item.update',
        mutation.requestHash,
        responseVersion,
      );
      await this.audit(client, {
        organizationId: order.organizationId,
        actorUserId: auth.userId,
        action: 'order.item.updated',
        orderId,
        payload: { itemId, quantityAmount },
      });
    });

    return this.get(auth, orderId);
  }

  async deleteItem(
    auth: AuthContext,
    orderId: string,
    itemId: string,
    dto: OrderMutationDto,
  ) {
    const order = await this.requireAccessibleOrder(auth, orderId);

    await this.withTransaction(async (client) => {
      const mutation = await this.beginMutation(
        client,
        auth,
        orderId,
        'order.item.delete',
        dto.mutationId,
        dto.expectedVersion,
        { itemId },
        ['OPEN'],
      );

      if (mutation.duplicate) return;

      const deleted = await client.query(
        `
          DELETE FROM order_items
          WHERE id = $1
            AND order_id = $2
            AND organization_id = $3
          RETURNING id
        `,
        [itemId, orderId, order.organizationId],
      );

      if (deleted.rowCount !== 1) {
        throw new NotFoundException({
          code: 'ORDER_ITEM_NOT_FOUND',
          message: "Riga d'ordine non trovata.",
        });
      }

      const responseVersion = await this.recalculate(client, mutation.order);
      await this.recordMutation(
        client,
        auth,
        orderId,
        dto.mutationId,
        'order.item.delete',
        mutation.requestHash,
        responseVersion,
      );
      await this.audit(client, {
        organizationId: order.organizationId,
        actorUserId: auth.userId,
        action: 'order.item.deleted',
        orderId,
        payload: { itemId },
      });
    });

    return this.get(auth, orderId);
  }

  async addAdjustment(
    auth: AuthContext,
    orderId: string,
    dto: CreateOrderAdjustmentDto,
  ) {
    const order = await this.requireAccessibleOrder(auth, orderId);

    await this.withTransaction(async (client) => {
      const mutation = await this.beginMutation(
        client,
        auth,
        orderId,
        'order.adjustment.add',
        dto.mutationId,
        dto.expectedVersion,
        {
          clientAdjustmentId: dto.clientAdjustmentId,
          type: dto.type,
          value: dto.value,
          reason: dto.reason.trim(),
        },
        ['OPEN'],
      );

      if (mutation.duplicate) return;

      if (mutation.order.subtotalCents <= 0) {
        throw new ConflictException({
          code: 'ORDER_EMPTY',
          message: 'Non è possibile applicare sconti a un ordine vuoto.',
        });
      }

      const existing = await client.query(
        `
          SELECT id
          FROM order_adjustments
          WHERE order_id = $1
            AND client_adjustment_id = $2
          LIMIT 1
        `,
        [orderId, dto.clientAdjustmentId],
      );

      if (existing.rowCount) {
        throw new ConflictException({
          code: 'CLIENT_ADJUSTMENT_ID_ALREADY_USED',
          message:
            "Il clientAdjustmentId è già stato usato per un'altra rettifica.",
        });
      }

      const adjustmentId = randomUUID();

      await client.query(
        `
          INSERT INTO order_adjustments (
            id,
            organization_id,
            order_id,
            client_adjustment_id,
            type,
            value,
            reason,
            applied_cents,
            created_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)
        `,
        [
          adjustmentId,
          order.organizationId,
          orderId,
          dto.clientAdjustmentId,
          dto.type,
          dto.value,
          dto.reason.trim(),
          auth.userId,
        ],
      );

      const responseVersion = await this.recalculate(client, mutation.order);
      await this.recordMutation(
        client,
        auth,
        orderId,
        dto.mutationId,
        'order.adjustment.add',
        mutation.requestHash,
        responseVersion,
      );
      await this.audit(client, {
        organizationId: order.organizationId,
        actorUserId: auth.userId,
        action: 'order.adjustment.added',
        orderId,
        payload: {
          adjustmentId,
          type: dto.type,
          value: dto.value,
          reason: dto.reason.trim(),
        },
      });
    });

    return this.get(auth, orderId);
  }

  async deleteAdjustment(
    auth: AuthContext,
    orderId: string,
    adjustmentId: string,
    dto: OrderMutationDto,
  ) {
    const order = await this.requireAccessibleOrder(auth, orderId);

    await this.withTransaction(async (client) => {
      const mutation = await this.beginMutation(
        client,
        auth,
        orderId,
        'order.adjustment.delete',
        dto.mutationId,
        dto.expectedVersion,
        { adjustmentId },
        ['OPEN'],
      );

      if (mutation.duplicate) return;

      const deleted = await client.query(
        `
          DELETE FROM order_adjustments
          WHERE id = $1
            AND order_id = $2
            AND organization_id = $3
          RETURNING id
        `,
        [adjustmentId, orderId, order.organizationId],
      );

      if (deleted.rowCount !== 1) {
        throw new NotFoundException({
          code: 'ORDER_ADJUSTMENT_NOT_FOUND',
          message: 'Rettifica non trovata.',
        });
      }

      const responseVersion = await this.recalculate(client, mutation.order);
      await this.recordMutation(
        client,
        auth,
        orderId,
        dto.mutationId,
        'order.adjustment.delete',
        mutation.requestHash,
        responseVersion,
      );
      await this.audit(client, {
        organizationId: order.organizationId,
        actorUserId: auth.userId,
        action: 'order.adjustment.deleted',
        orderId,
        payload: { adjustmentId },
      });
    });

    return this.get(auth, orderId);
  }

  async hold(auth: AuthContext, orderId: string, dto: OrderMutationDto) {
    return this.transition(auth, orderId, {
      operation: 'order.hold',
      mutationId: dto.mutationId,
      expectedVersion: dto.expectedVersion,
      from: ['OPEN'],
      to: 'HELD',
      auditAction: 'order.held',
      requireItems: true,
    });
  }

  async resume(auth: AuthContext, orderId: string, dto: OrderMutationDto) {
    return this.transition(auth, orderId, {
      operation: 'order.resume',
      mutationId: dto.mutationId,
      expectedVersion: dto.expectedVersion,
      from: ['HELD'],
      to: 'OPEN',
      auditAction: 'order.resumed',
      requireItems: false,
    });
  }

  async cancel(auth: AuthContext, orderId: string, dto: CancelOrderDto) {
    const result = await this.transition(auth, orderId, {
      operation: 'order.cancel',
      mutationId: dto.mutationId,
      expectedVersion: dto.expectedVersion,
      from: ['OPEN', 'HELD'],
      to: 'CANCELLED',
      auditAction: 'order.cancelled',
      requireItems: false,
      reason: dto.reason.trim(),
    });

    return result;
  }

  private async transition(
    auth: AuthContext,
    orderId: string,
    options: {
      operation: string;
      mutationId: string;
      expectedVersion: number;
      from: OrderStatus[];
      to: OrderStatus;
      auditAction: string;
      requireItems: boolean;
      reason?: string;
    },
  ) {
    const order = await this.requireAccessibleOrder(auth, orderId);

    await this.withTransaction(async (client) => {
      const mutation = await this.beginMutation(
        client,
        auth,
        orderId,
        options.operation,
        options.mutationId,
        options.expectedVersion,
        { to: options.to, reason: options.reason ?? null },
        options.from,
      );

      if (mutation.duplicate) return;

      if (options.requireItems) {
        const count = await client.query<CountRow>(
          `SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = $1`,
          [orderId],
        );

        if ((count.rows[0]?.count ?? 0) === 0) {
          throw new ConflictException({
            code: 'ORDER_EMPTY',
            message: 'Un ordine vuoto non può essere messo in attesa.',
          });
        }
      }

      const nextVersion = mutation.order.version + 1;
      const heldAt = options.to === 'HELD' ? new Date() : null;
      const cancelledAt = options.to === 'CANCELLED' ? new Date() : null;

      await client.query(
        `
          UPDATE orders
          SET
            status = $4,
            version = $5,
            held_at = $6,
            cancelled_at = $7,
            cancelled_by_user_id = $8,
            cancel_reason = $9,
            updated_at = NOW()
          WHERE id = $1
            AND organization_id = $2
            AND version = $3
        `,
        [
          orderId,
          order.organizationId,
          mutation.order.version,
          options.to,
          nextVersion,
          heldAt,
          cancelledAt,
          options.to === 'CANCELLED' ? auth.userId : null,
          options.reason ?? null,
        ],
      );

      await this.recordMutation(
        client,
        auth,
        orderId,
        options.mutationId,
        options.operation,
        mutation.requestHash,
        nextVersion,
      );
      await this.audit(client, {
        organizationId: order.organizationId,
        actorUserId: auth.userId,
        action: options.auditAction,
        orderId,
        payload: {
          from: mutation.order.status,
          to: options.to,
          reason: options.reason ?? null,
          version: nextVersion,
        },
      });

      if (options.to === 'CANCELLED') {
        await this.outbox(client, {
          topic: 'order.cancelled',
          orderId,
          payload: {
            organizationId: order.organizationId,
            locationId: order.locationId,
            reason: options.reason,
          },
        });
      }
    });

    return this.get(auth, orderId);
  }

  private async requireAccessibleOrder(
    auth: AuthContext,
    orderId: string,
  ): Promise<OrderHeaderRow> {
    const organizationId = assertOrganizationScope(auth);
    const order = await this.findOrder(organizationId, orderId);

    if (!order) throw this.orderNotFound();
    await this.access.assertLocation(auth, order.locationId);
    return order;
  }

  private async beginMutation(
    client: PoolClient,
    auth: AuthContext,
    orderId: string,
    operation: string,
    mutationId: string,
    expectedVersion: number,
    payload: unknown,
    allowedStatuses: OrderStatus[],
  ): Promise<MutationContext> {
    const requestHash = mutationRequestHash({
      operation,
      expectedVersion,
      payload,
    });
    const orderResult = await client.query<OrderHeaderRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          device_id AS "deviceId",
          created_by_user_id AS "createdByUserId",
          client_order_id AS "clientOrderId",
          number,
          business_date AS "businessDate",
          status,
          service_mode AS "serviceMode",
          customer_note AS "customerNote",
          currency,
          version,
          subtotal_cents AS "subtotalCents",
          discount_cents AS "discountCents",
          total_cents AS "totalCents",
          net_total_cents AS "netTotalCents",
          tax_total_cents AS "taxTotalCents",
          held_at AS "heldAt",
          cancelled_at AS "cancelledAt",
          cancel_reason AS "cancelReason",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM orders
        WHERE id = $1
          AND organization_id = $2
        FOR UPDATE
      `,
      [orderId, assertOrganizationScope(auth)],
    );
    const order = orderResult.rows[0];

    if (!order) throw this.orderNotFound();

    const mutationResult = await client.query<MutationRow>(
      `
        SELECT
          operation,
          request_hash AS "requestHash",
          response_version AS "responseVersion"
        FROM order_mutations
        WHERE order_id = $1
          AND device_id = $2
          AND mutation_id = $3
        LIMIT 1
      `,
      [orderId, auth.deviceId, mutationId],
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

      return { order, requestHash, duplicate: true };
    }

    if (order.version !== expectedVersion) {
      throw new ConflictException({
        code: 'ORDER_VERSION_CONFLICT',
        message: "L'ordine è stato modificato da un altro dispositivo.",
        currentVersion: order.version,
        expectedVersion,
      });
    }

    if (!allowedStatuses.includes(order.status)) {
      throw new ConflictException({
        code: 'ORDER_NOT_MUTABLE',
        message: `Operazione non consentita quando l'ordine è ${order.status}.`,
        status: order.status,
      });
    }

    return { order, requestHash, duplicate: false };
  }

  private async recalculate(
    client: PoolClient,
    order: OrderHeaderRow,
  ): Promise<number> {
    const [itemResult, adjustmentResult] = await Promise.all([
      client.query<OrderItemRow>(
        `
          SELECT
            id,
            gross_total_cents AS "grossTotalCents",
            vat_rate_basis_points_snapshot AS "vatRateBasisPointsSnapshot",
            vat_nature_code_snapshot AS "vatNatureCodeSnapshot"
          FROM order_items
          WHERE organization_id = $1
            AND order_id = $2
          ORDER BY sort_order ASC, created_at ASC, id ASC
        `,
        [order.organizationId, order.id],
      ),
      client.query<AdjustmentRow>(
        `
          SELECT
            id,
            type,
            value
          FROM order_adjustments
          WHERE organization_id = $1
            AND order_id = $2
          ORDER BY created_at ASC, id ASC
        `,
        [order.organizationId, order.id],
      ),
    ]);

    const calculationItems: CalculationItem[] = itemResult.rows.map((item) => ({
      id: item.id,
      grossCents: item.grossTotalCents,
      vatRateBasisPoints: item.vatRateBasisPointsSnapshot,
      vatNatureCode: item.vatNatureCodeSnapshot,
    }));
    const calculationAdjustments: CalculationAdjustment[] =
      adjustmentResult.rows.map((adjustment) => ({
        id: adjustment.id,
        type: adjustment.type,
        value: adjustment.value,
      }));

    let calculation: ReturnType<typeof calculateOrderTotals>;

    try {
      calculation = calculateOrderTotals(
        calculationItems,
        calculationAdjustments,
      );
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
          UPDATE order_items
          SET
            allocated_discount_cents = $2,
            final_gross_cents = $3,
            final_net_cents = $4,
            final_tax_cents = $5,
            updated_at = NOW()
          WHERE id = $1
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
        `
          UPDATE order_adjustments
          SET applied_cents = $2
          WHERE id = $1
        `,
        [adjustment.id, adjustment.appliedCents],
      );
    }

    await client.query(
      `
        DELETE FROM order_vat_summaries
        WHERE organization_id = $1
          AND order_id = $2
      `,
      [order.organizationId, order.id],
    );

    for (const summary of calculation.vatSummaries) {
      await client.query(
        `
          INSERT INTO order_vat_summaries (
            id,
            organization_id,
            order_id,
            vat_key,
            vat_rate_basis_points,
            vat_nature_code,
            gross_cents,
            net_cents,
            tax_cents
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
        UPDATE orders
        SET
          subtotal_cents = $4,
          discount_cents = $5,
          total_cents = $6,
          net_total_cents = $7,
          tax_total_cents = $8,
          version = $9,
          updated_at = NOW()
        WHERE id = $1
          AND organization_id = $2
          AND version = $3
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

  private async insertResolvedItem(
    client: PoolClient,
    input: {
      id: string;
      organizationId: string;
      orderId: string;
      clientItemId: string;
      quantityAmount: number;
      note: string | null;
      sortOrder: number;
      resolved: ResolvedOrderItem;
    },
  ): Promise<void> {
    const item = input.resolved;

    await client.query(
      `
        INSERT INTO order_items (
          id,
          organization_id,
          order_id,
          client_item_id,
          product_id,
          variant_id,
          product_code_snapshot,
          product_name_snapshot,
          variant_code_snapshot,
          variant_name_snapshot,
          sku_snapshot,
          barcode_snapshot,
          category_id_snapshot,
          category_code_snapshot,
          category_name_snapshot,
          unit_snapshot,
          quantity_amount,
          quantity_scale,
          unit_price_cents,
          gross_total_cents,
          allocated_discount_cents,
          final_gross_cents,
          final_net_cents,
          final_tax_cents,
          vat_rate_id_snapshot,
          vat_code_snapshot,
          vat_rate_basis_points_snapshot,
          vat_nature_code_snapshot,
          price_list_id_snapshot,
          note,
          sort_order
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          0, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29
        )
      `,
      [
        input.id,
        input.organizationId,
        input.orderId,
        input.clientItemId,
        item.productId,
        item.variantId,
        item.productCodeSnapshot,
        item.productNameSnapshot,
        item.variantCodeSnapshot,
        item.variantNameSnapshot,
        item.skuSnapshot,
        item.barcodeSnapshot,
        item.categoryIdSnapshot,
        item.categoryCodeSnapshot,
        item.categoryNameSnapshot,
        item.unitSnapshot,
        input.quantityAmount,
        item.quantityScale,
        item.unitPriceCents,
        item.grossTotalCents,
        item.netTotalCents,
        item.taxTotalCents,
        item.vatRateIdSnapshot,
        item.vatCodeSnapshot,
        item.vatRateBasisPointsSnapshot,
        item.vatNatureCodeSnapshot,
        item.priceListIdSnapshot,
        input.note,
        input.sortOrder,
      ],
    );
  }

  private async recordMutation(
    client: PoolClient,
    auth: AuthContext,
    orderId: string,
    mutationId: string,
    operation: string,
    requestHash: string,
    responseVersion: number,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO order_mutations (
          id,
          organization_id,
          order_id,
          device_id,
          mutation_id,
          operation,
          request_hash,
          response_version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        randomUUID(),
        assertOrganizationScope(auth),
        orderId,
        auth.deviceId,
        mutationId,
        operation,
        requestHash,
        responseVersion,
      ],
    );
  }

  private async audit(
    client: PoolClient,
    event: {
      organizationId: string;
      actorUserId: string;
      action: string;
      orderId: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
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
        VALUES ($1, $2, $3, $4, 'order', $5, $6::jsonb)
      `,
      [
        randomUUID(),
        event.organizationId,
        event.actorUserId,
        event.action,
        event.orderId,
        JSON.stringify(event.payload),
      ],
    );
  }

  private async outbox(
    client: PoolClient,
    event: {
      topic: string;
      orderId: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO outbox_events (
          id,
          topic,
          aggregate_type,
          aggregate_id,
          payload
        )
        VALUES ($1, $2, 'order', $3, $4::jsonb)
      `,
      [randomUUID(), event.topic, event.orderId, JSON.stringify(event.payload)],
    );
  }

  private async findOrder(
    organizationId: string,
    orderId: string,
  ): Promise<OrderHeaderRow | null> {
    const result = await this.database.pool.query<OrderHeaderRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          device_id AS "deviceId",
          created_by_user_id AS "createdByUserId",
          client_order_id AS "clientOrderId",
          number,
          business_date AS "businessDate",
          status,
          service_mode AS "serviceMode",
          customer_note AS "customerNote",
          currency,
          version,
          subtotal_cents AS "subtotalCents",
          discount_cents AS "discountCents",
          total_cents AS "totalCents",
          net_total_cents AS "netTotalCents",
          tax_total_cents AS "taxTotalCents",
          held_at AS "heldAt",
          cancelled_at AS "cancelledAt",
          cancel_reason AS "cancelReason",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM orders
        WHERE id = $1
          AND organization_id = $2
        LIMIT 1
      `,
      [orderId, organizationId],
    );

    return result.rows[0] ?? null;
  }

  private async findByClientOrderId(
    organizationId: string,
    deviceId: string,
    clientOrderId: string,
  ): Promise<OrderHeaderRow | null> {
    const result = await this.database.pool.query<OrderHeaderRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          device_id AS "deviceId",
          created_by_user_id AS "createdByUserId",
          client_order_id AS "clientOrderId",
          number,
          business_date AS "businessDate",
          status,
          service_mode AS "serviceMode",
          customer_note AS "customerNote",
          currency,
          version,
          subtotal_cents AS "subtotalCents",
          discount_cents AS "discountCents",
          total_cents AS "totalCents",
          net_total_cents AS "netTotalCents",
          tax_total_cents AS "taxTotalCents",
          held_at AS "heldAt",
          cancelled_at AS "cancelledAt",
          cancel_reason AS "cancelReason",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM orders
        WHERE organization_id = $1
          AND device_id = $2
          AND client_order_id = $3
        LIMIT 1
      `,
      [organizationId, deviceId, clientOrderId],
    );

    return result.rows[0] ?? null;
  }

  private assertEquivalentCreate(
    existing: OrderHeaderRow,
    dto: CreateOrderDto,
  ): void {
    if (
      existing.locationId !== dto.locationId ||
      existing.serviceMode !== dto.serviceMode ||
      existing.customerNote !== (dto.customerNote?.trim() || null)
    ) {
      throw new ConflictException({
        code: 'CLIENT_ORDER_ID_REUSED',
        message: 'Il clientOrderId è già stato usato con dati differenti.',
      });
    }
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
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original error.
      }

      throw error;
    } finally {
      client.release();
    }
  }

  private orderNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'ORDER_NOT_FOUND',
      message: 'Ordine non trovato.',
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
