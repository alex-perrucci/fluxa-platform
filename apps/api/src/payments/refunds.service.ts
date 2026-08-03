import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { CreateRefundDto } from './dto/create-refund.dto';
import { PaymentAccessService } from './payment-access.service';
import { financialRequestHash } from './payment-idempotency';
import { assertRefundAmount, calculateRefundQuote } from './refund-policy';
import { RefundProviderService } from './refund-provider.service';

interface RefundablePaymentRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  orderId: string;
  status: string;
  method: 'CASH' | 'CARD' | 'OTHER';
  provider: 'CASH' | 'MANUAL_TERMINAL' | 'EXTERNAL_TERMINAL';
  amountCents: number;
  currency: string;
  providerReference: string | null;
}

interface RefundTotalsRow extends QueryResultRow {
  refundedCents: number;
  pendingRefundCents: number;
}

export interface PaymentRefundRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  paymentId: string;
  orderId: string;
  clientRefundId: string;
  method: 'CASH' | 'CARD';
  provider: 'CASH' | 'MANUAL_TERMINAL' | 'EXTERNAL_TERMINAL';
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  amountCents: number;
  currency: string;
  reason: string;
  providerReference: string | null;
  providerEventId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  version: number;
  requestedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type IdempotentRefundRow = PaymentRefundRow & { requestHash: string };

@Injectable()
export class RefundsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: PaymentAccessService,
    private readonly providers: RefundProviderService,
  ) {}

  async quote(auth: AuthContext, paymentId: string) {
    const payment = await this.requireAccessiblePayment(auth, paymentId);
    const totals = await this.refundTotals(this.database.pool, paymentId);
    return {
      paymentId,
      method: payment.method,
      provider: payment.provider,
      currency: payment.currency,
      ...calculateRefundQuote({
        status: payment.status,
        amountCents: payment.amountCents,
        refundedCents: totals.refundedCents,
        pendingRefundCents: totals.pendingRefundCents,
        method: payment.method,
      }),
    };
  }

  async list(auth: AuthContext, paymentId: string) {
    const payment = await this.requireAccessiblePayment(auth, paymentId);
    const result = await this.database.pool.query<PaymentRefundRow>(
      `${this.refundSelect()}
       WHERE pr.organization_id=$1 AND pr.payment_id=$2
       ORDER BY pr.created_at DESC,pr.id DESC`,
      [payment.organizationId, paymentId],
    );
    return result.rows;
  }

  async create(auth: AuthContext, paymentId: string, dto: CreateRefundDto) {
    const payment = await this.requireAccessiblePayment(auth, paymentId);
    const reason = dto.reason.trim();
    const requestHash = financialRequestHash({
      operation: 'payment.refund',
      paymentId,
      amountCents: dto.amountCents,
      reason,
      providerReference: dto.providerReference?.trim() || null,
      providerEventId: dto.providerEventId?.trim() || null,
    });

    const existing = await this.findByClientRefundId(
      payment.organizationId,
      auth.deviceId,
      dto.clientRefundId,
    );
    if (existing) {
      this.assertEquivalent(existing, paymentId, requestHash);
      return this.response(auth, payment, existing.id);
    }

    let refundId = '';
    try {
      refundId = await this.withTransaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `payment-refund:${payment.organizationId}:${paymentId}`,
        ]);
        const lockedPayment = await this.lockPayment(
          client,
          payment.organizationId,
          paymentId,
        );
        const repeated = await this.findByClientRefundIdWithClient(
          client,
          payment.organizationId,
          auth.deviceId,
          dto.clientRefundId,
        );
        if (repeated) {
          this.assertEquivalent(repeated, paymentId, requestHash);
          return repeated.id;
        }

        const totals = await this.refundTotals(client, paymentId);
        const quote = calculateRefundQuote({
          status: lockedPayment.status,
          amountCents: lockedPayment.amountCents,
          refundedCents: totals.refundedCents,
          pendingRefundCents: totals.pendingRefundCents,
          method: lockedPayment.method,
        });
        assertRefundAmount(dto.amountCents, quote.refundableCents);

        if (lockedPayment.method === 'OTHER') {
          throw new ConflictException({
            code: 'PAYMENT_METHOD_NOT_REFUNDABLE',
            message: 'Il metodo OTHER non supporta rimborsi automatici.',
          });
        }

        const id = randomUUID();
        const providerResult = await this.providers.refund({
          refundId: id,
          paymentId,
          method: lockedPayment.method,
          provider: lockedPayment.provider,
          amountCents: dto.amountCents,
          currency: lockedPayment.currency,
          originalProviderReference: lockedPayment.providerReference,
          requestedProviderReference: dto.providerReference?.trim() || null,
          providerEventId: dto.providerEventId?.trim() || null,
        });

        await client.query(
          `INSERT INTO payment_refunds (
             id,organization_id,location_id,payment_id,order_id,
             requested_by_user_id,requested_by_device_id,client_refund_id,
             request_hash,method,provider,status,amount_cents,currency,reason,
             provider_reference,provider_event_id,completed_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::payment_method,$11::payment_provider,
             $12::payment_refund_status,$13,$14,$15,$16,$17,
             CASE WHEN $12='SUCCEEDED' THEN NOW() ELSE NULL END
           )`,
          [
            id,
            lockedPayment.organizationId,
            lockedPayment.locationId,
            paymentId,
            lockedPayment.orderId,
            auth.userId,
            auth.deviceId,
            dto.clientRefundId,
            requestHash,
            lockedPayment.method,
            lockedPayment.provider,
            providerResult.status,
            dto.amountCents,
            lockedPayment.currency,
            reason,
            providerResult.providerReference,
            providerResult.providerEventId,
          ],
        );

        await this.insertPaymentEvent(client, {
          organizationId: lockedPayment.organizationId,
          paymentId,
          type: 'REFUND_REQUESTED',
          providerEventId: providerResult.providerEventId,
          payload: { refundId: id, amountCents: dto.amountCents, reason },
        });

        if (providerResult.status === 'SUCCEEDED') {
          await this.insertPaymentEvent(client, {
            organizationId: lockedPayment.organizationId,
            paymentId,
            type: 'REFUND_SUCCEEDED',
            payload: {
              refundId: id,
              amountCents: dto.amountCents,
              providerReference: providerResult.providerReference,
            },
          });
          await this.refreshPaymentStatus(client, lockedPayment);
        }

        await this.auditAndOutbox(client, {
          organizationId: lockedPayment.organizationId,
          actorUserId: auth.userId,
          refundId: id,
          paymentId,
          orderId: lockedPayment.orderId,
          topic:
            providerResult.status === 'SUCCEEDED'
              ? 'payment.refund.succeeded'
              : 'payment.refund.requested',
          payload: {
            amountCents: dto.amountCents,
            method: lockedPayment.method,
            provider: lockedPayment.provider,
            reason,
          },
        });
        return id;
      });
    } catch (error) {
      if (this.isConstraint(error, 'payment_refunds_org_device_client_uq')) {
        const repeated = await this.findByClientRefundId(
          payment.organizationId,
          auth.deviceId,
          dto.clientRefundId,
        );
        if (repeated) {
          this.assertEquivalent(repeated, paymentId, requestHash);
          return this.response(auth, payment, repeated.id);
        }
      }
      throw error;
    }

    return this.response(auth, payment, refundId);
  }

  private async response(
    auth: AuthContext,
    payment: RefundablePaymentRow,
    refundId: string,
  ) {
    const refund = await this.findRefund(payment.organizationId, refundId);
    if (!refund) throw this.refundNotFound();
    const quote = await this.quote(auth, payment.id);
    return { refund, quote };
  }

  private async requireAccessiblePayment(auth: AuthContext, paymentId: string) {
    const organizationId = assertOrganizationScope(auth);
    const payment = await this.findPayment(organizationId, paymentId);
    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Pagamento non trovato.',
      });
    }
    await this.access.assertLocation(auth, payment.locationId);
    return payment;
  }

  private findPayment(organizationId: string, paymentId: string) {
    return this.database.pool
      .query<RefundablePaymentRow>(
        `${this.paymentSelect()}
         WHERE pt.organization_id=$1 AND pt.id=$2 LIMIT 1`,
        [organizationId, paymentId],
      )
      .then((result) => result.rows[0] ?? null);
  }

  private async lockPayment(
    client: PoolClient,
    organizationId: string,
    paymentId: string,
  ) {
    const result = await client.query<RefundablePaymentRow>(
      `${this.paymentSelect()}
       WHERE pt.organization_id=$1 AND pt.id=$2 FOR UPDATE OF pt`,
      [organizationId, paymentId],
    );
    const payment = result.rows[0];
    if (!payment) throw this.refundNotFound();
    return payment;
  }

  private paymentSelect() {
    return `SELECT pt.id,pt.organization_id AS "organizationId",
      pt.location_id AS "locationId",pt.order_id AS "orderId",
      pt.status::text,pt.method::text,pt.provider::text,
      pt.amount_cents AS "amountCents",cs.currency,
      pt.provider_reference AS "providerReference"
      FROM payment_transactions pt
      INNER JOIN checkout_sessions cs ON cs.id=pt.checkout_session_id`;
  }

  private async refundTotals(
    queryable: Pool | PoolClient,
    paymentId: string,
  ): Promise<RefundTotalsRow> {
    const result = await queryable.query<RefundTotalsRow>(
      `SELECT
         COALESCE(SUM(amount_cents) FILTER (WHERE status='SUCCEEDED'),0)::int AS "refundedCents",
         COALESCE(SUM(amount_cents) FILTER (WHERE status='PENDING'),0)::int AS "pendingRefundCents"
       FROM payment_refunds WHERE payment_id=$1`,
      [paymentId],
    );
    return result.rows[0] ?? { refundedCents: 0, pendingRefundCents: 0 };
  }

  private async refreshPaymentStatus(
    client: PoolClient,
    payment: RefundablePaymentRow,
  ): Promise<void> {
    const totals = await this.refundTotals(client, payment.id);
    const status =
      totals.refundedCents >= payment.amountCents
        ? 'REFUNDED'
        : 'PARTIALLY_REFUNDED';
    await client.query(
      `UPDATE payment_transactions SET status=$2::payment_status,updated_at=NOW()
       WHERE id=$1`,
      [payment.id, status],
    );
  }

  private insertPaymentEvent(
    client: PoolClient,
    input: {
      organizationId: string;
      paymentId: string;
      type: string;
      providerEventId?: string | null;
      payload: Record<string, unknown>;
    },
  ) {
    return client.query(
      `INSERT INTO payment_events
       (id,organization_id,payment_id,type,provider_event_id,payload)
       VALUES ($1,$2,$3,$4::payment_event_type,$5,$6::jsonb)`,
      [
        randomUUID(),
        input.organizationId,
        input.paymentId,
        input.type,
        input.providerEventId ?? null,
        JSON.stringify(input.payload),
      ],
    );
  }

  private auditAndOutbox(
    client: PoolClient,
    input: {
      organizationId: string;
      actorUserId: string;
      refundId: string;
      paymentId: string;
      orderId: string;
      topic: string;
      payload: Record<string, unknown>;
    },
  ) {
    const payload = {
      organizationId: input.organizationId,
      refundId: input.refundId,
      paymentId: input.paymentId,
      orderId: input.orderId,
      ...input.payload,
    };
    return Promise.all([
      client.query(
        `INSERT INTO audit_events
         (id,organization_id,actor_user_id,action,entity_type,entity_id,payload)
         VALUES ($1,$2,$3,$4,'payment_refund',$5,$6::jsonb)`,
        [
          randomUUID(),
          input.organizationId,
          input.actorUserId,
          input.topic,
          input.refundId,
          JSON.stringify(payload),
        ],
      ),
      client.query(
        `INSERT INTO outbox_events
         (id,topic,aggregate_type,aggregate_id,payload)
         VALUES ($1,$2,'payment_refund',$3,$4::jsonb)`,
        [randomUUID(), input.topic, input.refundId, JSON.stringify(payload)],
      ),
    ]);
  }

  private findByClientRefundId(
    organizationId: string,
    deviceId: string,
    clientRefundId: string,
  ) {
    return this.database.pool
      .query<IdempotentRefundRow>(
        `${this.refundSelect(true)}
         WHERE pr.organization_id=$1 AND pr.requested_by_device_id=$2
           AND pr.client_refund_id=$3 LIMIT 1`,
        [organizationId, deviceId, clientRefundId],
      )
      .then((result) => result.rows[0] ?? null);
  }

  private findByClientRefundIdWithClient(
    client: PoolClient,
    organizationId: string,
    deviceId: string,
    clientRefundId: string,
  ) {
    return client
      .query<IdempotentRefundRow>(
        `${this.refundSelect(true)}
         WHERE pr.organization_id=$1 AND pr.requested_by_device_id=$2
           AND pr.client_refund_id=$3 LIMIT 1`,
        [organizationId, deviceId, clientRefundId],
      )
      .then((result) => result.rows[0] ?? null);
  }

  private findRefund(organizationId: string, refundId: string) {
    return this.database.pool
      .query<PaymentRefundRow>(
        `${this.refundSelect()} WHERE pr.organization_id=$1 AND pr.id=$2 LIMIT 1`,
        [organizationId, refundId],
      )
      .then((result) => result.rows[0] ?? null);
  }

  private assertEquivalent(
    refund: IdempotentRefundRow,
    paymentId: string,
    requestHash: string,
  ) {
    if (refund.paymentId !== paymentId || refund.requestHash !== requestHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'clientRefundId riutilizzato con dati diversi.',
      });
    }
  }

  private refundSelect(includeRequestHash = false) {
    return `SELECT pr.id,pr.organization_id AS "organizationId",
      pr.location_id AS "locationId",pr.payment_id AS "paymentId",
      pr.order_id AS "orderId",pr.client_refund_id AS "clientRefundId",
      pr.method::text,pr.provider::text,pr.status::text,
      pr.amount_cents AS "amountCents",pr.currency,pr.reason,
      pr.provider_reference AS "providerReference",
      pr.provider_event_id AS "providerEventId",
      pr.failure_code AS "failureCode",pr.failure_message AS "failureMessage",
      pr.version,pr.requested_at AS "requestedAt",
      pr.completed_at AS "completedAt",pr.failed_at AS "failedAt",
      pr.created_at AS "createdAt",pr.updated_at AS "updatedAt"
      ${includeRequestHash ? ',pr.request_hash AS "requestHash"' : ''}
      FROM payment_refunds pr`;
  }

  private refundNotFound() {
    return new NotFoundException({
      code: 'PAYMENT_REFUND_NOT_FOUND',
      message: 'Rimborso non trovato.',
    });
  }

  private isConstraint(error: unknown, constraint: string) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'constraint' in error &&
      (error as { constraint?: unknown }).constraint === constraint
    );
  }

  private async withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
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
