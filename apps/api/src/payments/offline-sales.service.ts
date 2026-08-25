import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import {
  calculateGrossFromQuantity,
  calculateVatFromGross,
} from '../orders/order-calculator';
import {
  businessDateForTimezone,
  formatOrderNumber,
} from '../orders/order-number';
import type {
  OfflineSaleItemDto,
  ReplayOfflineSaleDto,
} from './dto/replay-offline-sale.dto';
import { PaymentAccessService } from './payment-access.service';
import { financialRequestHash } from './payment-idempotency';

interface ReplayRow extends QueryResultRow {
  requestHash: string;
  result: OfflineSaleReplayResult;
}

interface LocationRow extends QueryResultRow {
  timezone: string;
}

interface SequenceRow extends QueryResultRow {
  lastValue: number;
}

interface ExistingOrderRow extends QueryResultRow {
  id: string;
  locationId: string;
  serviceMode: string;
  customerNote: string | null;
  currency: string;
  status: string;
  version: number;
  number: string;
  businessDate: string;
  itemCount: number;
}

interface ProductOwnershipRow extends QueryResultRow {
  productId: string;
  variantId: string | null;
}

interface CalculatedOfflineLine {
  input: OfflineSaleItemDto;
  grossCents: number;
  netCents: number;
  taxCents: number;
}

export interface OfflineSaleReplayResult {
  status: 'SYNCED';
  saleId: string;
  orderId: string;
  orderNumber: string;
  checkoutId: string;
  paymentId: string;
  totalCents: number;
  changeCents: number;
}

@Injectable()
export class OfflineSalesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: PaymentAccessService,
  ) {}

  async replay(
    auth: AuthContext,
    dto: ReplayOfflineSaleDto,
  ): Promise<OfflineSaleReplayResult> {
    const access = await this.access.assertLocation(auth, dto.locationId);
    const normalized = this.normalize(dto);
    const requestHash = financialRequestHash({
      operation: 'offline-sale.replay',
      ...normalized,
    });

    const lines = normalized.items.map((item) => this.calculateLine(item));
    const totals = lines.reduce(
      (acc, line) => ({
        gross: acc.gross + line.grossCents,
        net: acc.net + line.netCents,
        tax: acc.tax + line.taxCents,
      }),
      { gross: 0, net: 0, tax: 0 },
    );

    if (totals.gross <= 0 || totals.net + totals.tax !== totals.gross) {
      throw new BadRequestException({
        code: 'OFFLINE_SALE_TOTAL_INVALID',
        message: 'I totali della vendita offline non sono coerenti.',
      });
    }
    if (normalized.payment.amountCents !== totals.gross) {
      throw new BadRequestException({
        code: 'OFFLINE_SALE_PAYMENT_MISMATCH',
        message: 'Il pagamento offline deve coprire esattamente la vendita.',
        expectedCents: totals.gross,
        actualCents: normalized.payment.amountCents,
      });
    }
    if (normalized.payment.tenderedCents < normalized.payment.amountCents) {
      throw new BadRequestException({
        code: 'OFFLINE_SALE_TENDERED_TOO_LOW',
        message: 'Il contante ricevuto è inferiore al totale della vendita.',
      });
    }

    return this.withTransaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`offline-sale:${access.organizationId}:${auth.deviceId}:${dto.saleId}`],
      );

      const duplicate = await client.query<ReplayRow>(
        `
          SELECT
            request_hash AS "requestHash",
            result_json AS result
          FROM offline_sale_replays
          WHERE organization_id = $1
            AND device_id = $2
            AND sale_id = $3
          FOR UPDATE
        `,
        [access.organizationId, auth.deviceId, dto.saleId],
      );
      const existingReplay = duplicate.rows[0];
      if (existingReplay) {
        if (existingReplay.requestHash !== requestHash) {
          throw new ConflictException({
            code: 'OFFLINE_SALE_IDEMPOTENCY_CONFLICT',
            message: 'Il saleId è già stato usato con dati differenti.',
          });
        }
        return existingReplay.result;
      }

      for (const line of lines) {
        await this.assertProductOwnership(
          client,
          access.organizationId,
          line.input,
        );
      }

      const location = await client.query<LocationRow>(
        `SELECT timezone FROM locations WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [access.locationId, access.organizationId],
      );
      const timezone = location.rows[0]?.timezone;
      if (!timezone) {
        throw new NotFoundException({
          code: 'LOCATION_NOT_FOUND',
          message: 'Punto vendita non trovato.',
        });
      }

      const existingOrder = await this.findExistingOrder(
        client,
        access.organizationId,
        auth.deviceId,
        normalized.clientOrderId,
      );

      let orderId: string;
      let orderNumber: string;
      let businessDate: string;

      if (existingOrder) {
        this.assertReusableOrder(existingOrder, normalized);
        orderId = existingOrder.id;
        orderNumber = existingOrder.number;
        businessDate = existingOrder.businessDate;
      } else {
        businessDate = businessDateForTimezone(
          new Date(normalized.createdAt),
          timezone,
        );
        const sequence = await client.query<SequenceRow>(
          `
            INSERT INTO location_order_sequences (
              id, organization_id, location_id, business_date, last_value, updated_at
            )
            VALUES ($1, $2, $3, $4, 1, NOW())
            ON CONFLICT (organization_id, location_id, business_date)
            DO UPDATE SET
              last_value = location_order_sequences.last_value + 1,
              updated_at = NOW()
            RETURNING last_value AS "lastValue"
          `,
          [randomUUID(), access.organizationId, access.locationId, businessDate],
        );
        const lastValue = sequence.rows[0]?.lastValue;
        if (!lastValue) throw new Error('Unable to allocate offline order sequence.');

        orderId = randomUUID();
        orderNumber = formatOrderNumber(businessDate, lastValue);
        await client.query(
          `
            INSERT INTO orders (
              id, organization_id, location_id, device_id, created_by_user_id,
              client_order_id, number, business_date, status, service_mode,
              customer_note, currency, version, subtotal_cents, discount_cents,
              total_cents, net_total_cents, tax_total_cents, created_at, updated_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,'OPEN',$9,$10,$11,1,$12,0,$12,$13,$14,$15,$15
            )
          `,
          [
            orderId,
            access.organizationId,
            access.locationId,
            auth.deviceId,
            auth.userId,
            normalized.clientOrderId,
            orderNumber,
            businessDate,
            normalized.serviceMode,
            normalized.customerNote ?? null,
            normalized.currency,
            totals.gross,
            totals.net,
            totals.tax,
            new Date(normalized.createdAt),
          ],
        );
      }

      if (existingOrder) {
        await client.query(
          `
            UPDATE orders
            SET subtotal_cents=$2, discount_cents=0, total_cents=$2,
                net_total_cents=$3, tax_total_cents=$4, updated_at=NOW()
            WHERE id=$1
          `,
          [orderId, totals.gross, totals.net, totals.tax],
        );
      }

      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        await client.query(
          `
            INSERT INTO order_items (
              id, organization_id, order_id, client_item_id, product_id, variant_id,
              product_code_snapshot, product_name_snapshot, variant_code_snapshot,
              variant_name_snapshot, sku_snapshot, barcode_snapshot,
              category_id_snapshot, category_code_snapshot, category_name_snapshot,
              unit_snapshot, quantity_amount, quantity_scale, unit_price_cents,
              gross_total_cents, allocated_discount_cents, final_gross_cents,
              final_net_cents, final_tax_cents, vat_rate_id_snapshot,
              vat_code_snapshot, vat_rate_basis_points_snapshot,
              vat_nature_code_snapshot, price_list_id_snapshot, note, sort_order
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
              $16::product_unit,$17,$18,$19,$20,0,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29
            )
          `,
          [
            randomUUID(),
            access.organizationId,
            orderId,
            line.input.clientItemId,
            line.input.productId,
            line.input.variantId ?? null,
            line.input.productCodeSnapshot,
            line.input.productNameSnapshot,
            line.input.variantCodeSnapshot ?? null,
            line.input.variantNameSnapshot ?? null,
            line.input.skuSnapshot ?? null,
            line.input.barcodeSnapshot ?? null,
            line.input.categoryIdSnapshot,
            line.input.categoryCodeSnapshot,
            line.input.categoryNameSnapshot,
            line.input.unitSnapshot,
            line.input.quantityAmount,
            line.input.quantityScale,
            line.input.unitPriceCents,
            line.grossCents,
            line.netCents,
            line.taxCents,
            line.input.vatRateIdSnapshot,
            line.input.vatCodeSnapshot,
            line.input.vatRateBasisPointsSnapshot,
            line.input.vatNatureCodeSnapshot ?? null,
            line.input.priceListIdSnapshot,
            line.input.note ?? null,
            index,
          ],
        );
      }

      const vatGroups = new Map<
        string,
        { rate: number; nature: string | null; gross: number; net: number; tax: number }
      >();
      for (const line of lines) {
        const nature = line.input.vatNatureCodeSnapshot ?? null;
        const key = `${line.input.vatRateBasisPointsSnapshot}:${nature ?? ''}`;
        const current = vatGroups.get(key) ?? {
          rate: line.input.vatRateBasisPointsSnapshot,
          nature,
          gross: 0,
          net: 0,
          tax: 0,
        };
        current.gross += line.grossCents;
        current.net += line.netCents;
        current.tax += line.taxCents;
        vatGroups.set(key, current);
      }
      for (const [key, vat] of vatGroups) {
        await client.query(
          `
            INSERT INTO order_vat_summaries (
              id, organization_id, order_id, vat_key, vat_rate_basis_points,
              vat_nature_code, gross_cents, net_cents, tax_cents
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          `,
          [
            randomUUID(),
            access.organizationId,
            orderId,
            key,
            vat.rate,
            vat.nature,
            vat.gross,
            vat.net,
            vat.tax,
          ],
        );
      }

      const checkoutId = randomUUID();
      const checkoutHash = financialRequestHash({
        operation: 'checkout.open',
        orderId,
        expectedOrderVersion: 1,
      });
      const changeCents =
        normalized.payment.tenderedCents - normalized.payment.amountCents;
      await client.query(
        `
          INSERT INTO checkout_sessions (
            id, organization_id, location_id, order_id, device_id,
            created_by_user_id, client_checkout_id, request_hash, status,
            currency, order_version_snapshot, order_total_cents, paid_cents,
            remaining_cents, change_cents, completed_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'COMPLETED',$9,1,$10,$10,0,$11,NOW())
        `,
        [
          checkoutId,
          access.organizationId,
          access.locationId,
          orderId,
          auth.deviceId,
          auth.userId,
          normalized.clientCheckoutId,
          checkoutHash,
          normalized.currency,
          totals.gross,
          changeCents,
        ],
      );

      const paymentId = randomUUID();
      const paymentHash = financialRequestHash({
        operation: 'payment.create',
        checkoutId,
        method: 'CASH',
        provider: 'CASH',
        amountCents: totals.gross,
        tenderedCents: normalized.payment.tenderedCents,
      });
      await client.query(
        `
          INSERT INTO payment_transactions (
            id, organization_id, location_id, checkout_session_id, order_id,
            device_id, created_by_user_id, client_payment_id, request_hash,
            method, provider, status, amount_cents, tendered_cents,
            change_cents, captured_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'CASH','CASH','CAPTURED',$10,$11,$12,NOW())
        `,
        [
          paymentId,
          access.organizationId,
          access.locationId,
          checkoutId,
          orderId,
          auth.deviceId,
          auth.userId,
          normalized.clientPaymentId,
          paymentHash,
          totals.gross,
          normalized.payment.tenderedCents,
          changeCents,
        ],
      );
      await this.paymentEvent(client, access.organizationId, paymentId, 'CREATED', {
        method: 'CASH',
        provider: 'CASH',
        amountCents: totals.gross,
        source: 'OFFLINE_REPLAY',
      });
      await this.paymentEvent(client, access.organizationId, paymentId, 'CAPTURED', {
        amountCents: totals.gross,
        changeCents,
        source: 'OFFLINE_REPLAY',
      });

      await client.query(
        `UPDATE orders SET status='PAID', version=3, updated_at=NOW() WHERE id=$1`,
        [orderId],
      );

      await this.audit(client, {
        organizationId: access.organizationId,
        actorUserId: auth.userId,
        action: 'offline_sale.replayed',
        entityType: 'order',
        entityId: orderId,
        payload: {
          saleId: normalized.saleId,
          checkoutId,
          paymentId,
          totalCents: totals.gross,
        },
      });
      await this.outbox(client, {
        topic: 'payment.captured',
        aggregateType: 'payment',
        aggregateId: paymentId,
        payload: {
          organizationId: access.organizationId,
          checkoutId,
          orderId,
          amountCents: totals.gross,
          source: 'OFFLINE_REPLAY',
        },
      });
      await this.outbox(client, {
        topic: 'order.paid',
        aggregateType: 'order',
        aggregateId: orderId,
        payload: {
          organizationId: access.organizationId,
          locationId: access.locationId,
          checkoutId,
          totalCents: totals.gross,
          changeCents,
          source: 'OFFLINE_REPLAY',
        },
      });

      const result: OfflineSaleReplayResult = {
        status: 'SYNCED',
        saleId: normalized.saleId,
        orderId,
        orderNumber,
        checkoutId,
        paymentId,
        totalCents: totals.gross,
        changeCents,
      };
      await client.query(
        `
          INSERT INTO offline_sale_replays (
            id, organization_id, location_id, device_id, sale_id, request_hash,
            order_id, checkout_id, payment_id, result_json
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
        `,
        [
          randomUUID(),
          access.organizationId,
          access.locationId,
          auth.deviceId,
          normalized.saleId,
          requestHash,
          orderId,
          checkoutId,
          paymentId,
          JSON.stringify(result),
        ],
      );
      return result;
    });
  }

  private normalize(dto: ReplayOfflineSaleDto): ReplayOfflineSaleDto {
    return {
      ...dto,
      currency: dto.currency.trim().toUpperCase(),
      customerNote: dto.customerNote?.trim() || undefined,
      items: dto.items.map((item) => ({
        ...item,
        productCodeSnapshot: item.productCodeSnapshot.trim(),
        productNameSnapshot: item.productNameSnapshot.trim(),
        variantCodeSnapshot: item.variantCodeSnapshot?.trim() || undefined,
        variantNameSnapshot: item.variantNameSnapshot?.trim() || undefined,
        skuSnapshot: item.skuSnapshot?.trim() || undefined,
        barcodeSnapshot: item.barcodeSnapshot?.trim() || undefined,
        categoryCodeSnapshot: item.categoryCodeSnapshot.trim(),
        categoryNameSnapshot: item.categoryNameSnapshot.trim(),
        vatCodeSnapshot: item.vatCodeSnapshot.trim(),
        vatNatureCodeSnapshot: item.vatNatureCodeSnapshot?.trim() || undefined,
        note: item.note?.trim() || undefined,
      })),
      payment: { ...dto.payment },
    };
  }

  private calculateLine(input: OfflineSaleItemDto): CalculatedOfflineLine {
    const grossCents = calculateGrossFromQuantity(
      input.unitPriceCents,
      input.quantityAmount,
      input.quantityScale,
    );
    const vat = calculateVatFromGross(
      grossCents,
      input.vatRateBasisPointsSnapshot,
    );
    return {
      input,
      grossCents,
      netCents: vat.netCents,
      taxCents: vat.taxCents,
    };
  }

  private async assertProductOwnership(
    client: PoolClient,
    organizationId: string,
    item: OfflineSaleItemDto,
  ): Promise<void> {
    const result = await client.query<ProductOwnershipRow>(
      `
        SELECT p.id AS "productId", pv.id AS "variantId"
        FROM products p
        LEFT JOIN product_variants pv
          ON pv.id = $2
         AND pv.product_id = p.id
         AND pv.organization_id = p.organization_id
        WHERE p.id = $1
          AND p.organization_id = $3
        LIMIT 1
      `,
      [item.productId, item.variantId ?? null, organizationId],
    );
    const row = result.rows[0];
    if (!row || (item.variantId && row.variantId !== item.variantId)) {
      throw new ConflictException({
        code: 'OFFLINE_SALE_PRODUCT_INVALID',
        message: 'Un prodotto della vendita offline non appartiene al tenant.',
        productId: item.productId,
      });
    }
  }

  private async findExistingOrder(
    client: PoolClient,
    organizationId: string,
    deviceId: string,
    clientOrderId: string,
  ): Promise<ExistingOrderRow | null> {
    const result = await client.query<ExistingOrderRow>(
      `
        SELECT
          o.id,
          o.location_id AS "locationId",
          o.service_mode AS "serviceMode",
          o.customer_note AS "customerNote",
          o.currency,
          o.status,
          o.version,
          o.number,
          o.business_date AS "businessDate",
          COUNT(oi.id)::int AS "itemCount"
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.organization_id = $1
          AND o.device_id = $2
          AND o.client_order_id = $3
        GROUP BY o.id
        LIMIT 1
        FOR UPDATE OF o
      `,
      [organizationId, deviceId, clientOrderId],
    );
    return result.rows[0] ?? null;
  }

  private assertReusableOrder(
    existing: ExistingOrderRow,
    dto: ReplayOfflineSaleDto,
  ): void {
    const sameNote = (existing.customerNote ?? null) === (dto.customerNote ?? null);
    if (
      existing.locationId !== dto.locationId ||
      existing.serviceMode !== dto.serviceMode ||
      existing.currency !== dto.currency ||
      !sameNote ||
      existing.status !== 'OPEN' ||
      existing.version !== 1 ||
      existing.itemCount !== 0
    ) {
      throw new ConflictException({
        code: 'OFFLINE_REPLAY_ORDER_CONFLICT',
        message:
          'Il clientOrderId esiste già in uno stato che non può essere completato come vendita offline.',
      });
    }
  }

  private async paymentEvent(
    client: PoolClient,
    organizationId: string,
    paymentId: string,
    type: 'CREATED' | 'CAPTURED',
    payload: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO payment_events (
          id, organization_id, payment_id, type, payload
        ) VALUES ($1,$2,$3,$4::payment_event_type,$5::jsonb)
      `,
      [randomUUID(), organizationId, paymentId, type, JSON.stringify(payload)],
    );
  }

  private async audit(
    client: PoolClient,
    event: {
      organizationId: string;
      actorUserId: string;
      action: string;
      entityType: string;
      entityId: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO audit_events (
          id, organization_id, actor_user_id, action, entity_type, entity_id, payload
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
      `,
      [
        randomUUID(),
        event.organizationId,
        event.actorUserId,
        event.action,
        event.entityType,
        event.entityId,
        JSON.stringify(event.payload),
      ],
    );
  }

  private async outbox(
    client: PoolClient,
    event: {
      topic: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO outbox_events (
          id, topic, aggregate_type, aggregate_id, payload
        ) VALUES ($1,$2,$3,$4,$5::jsonb)
      `,
      [
        randomUUID(),
        event.topic,
        event.aggregateType,
        event.aggregateId,
        JSON.stringify(event.payload),
      ],
    );
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
}
