import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { CreateRefundFiscalVoidDto } from './dto/create-refund-fiscal-void.dto';
import { FiscalAccessService } from './fiscal-access.service';
import { fiscalRequestHash } from './fiscal-idempotency';
import { FiscalQueueService } from './fiscal-queue.service';

interface RefundRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  orderId: string;
  status: string;
}

interface OrderRefundStateRow extends QueryResultRow {
  orderTotalCents: number;
  refundedCents: number;
}

interface SaleDocumentRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  orderId: string;
  provider: string;
  environment: string;
  fiscalId: string;
  currency: string;
  totalCents: number;
  cashPaymentCents: number;
  electronicPaymentCents: number;
  externalId: string;
  version: number;
}

interface VoidDocumentRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  orderId: string;
  paymentRefundId: string;
  parentDocumentId: string;
  type: 'VOID';
  status: string;
  provider: string;
  environment: string;
  currency: string;
  totalCents: number;
  requestHash: string;
  createdAt: Date;
}

@Injectable()
export class RefundFiscalVoidService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: FiscalAccessService,
    private readonly queue: FiscalQueueService,
  ) {}

  async create(
    auth: AuthContext,
    refundId: string,
    dto: CreateRefundFiscalVoidDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const refund = await this.findRefund(organizationId, refundId);
    if (!refund) throw this.refundNotFound();
    await this.access.assertLocation(auth, refund.locationId);

    const reason = dto.reason.trim();
    const requestHash = fiscalRequestHash({
      operation: 'fiscal.refund-void',
      refundId,
      mutationId: dto.mutationId,
      reason,
    });
    let documentId = '';
    let shouldQueue = false;

    await this.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `fiscal-refund-void:${organizationId}:${refundId}`,
      ]);
      const lockedRefund = await this.lockRefund(client, organizationId, refundId);
      if (lockedRefund.status !== 'SUCCEEDED') {
        throw new ConflictException({
          code: 'REFUND_NOT_COMPLETED',
          message: 'Lo storno fiscale richiede un rimborso riuscito.',
          status: lockedRefund.status,
        });
      }

      const existing = await this.findVoidByRefund(client, organizationId, refundId);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException({
            code: 'REFUND_FISCAL_VOID_ALREADY_EXISTS',
            message: 'Il rimborso è già collegato a uno storno fiscale diverso.',
            documentId: existing.id,
          });
        }
        documentId = existing.id;
        return;
      }

      const refundState = await this.orderRefundState(
        client,
        organizationId,
        lockedRefund.orderId,
      );
      if (refundState.refundedCents < refundState.orderTotalCents) {
        throw new ConflictException({
          code: 'PARTIAL_REFUND_CANNOT_VOID_FISCAL_DOCUMENT',
          message:
            'Un rimborso parziale non può annullare l’intero documento fiscale.',
          orderTotalCents: refundState.orderTotalCents,
          refundedCents: refundState.refundedCents,
        });
      }

      const sale = await this.lockIssuedSale(
        client,
        organizationId,
        lockedRefund.orderId,
      );
      const id = randomUUID();
      await client.query(
        `INSERT INTO fiscal_documents (
           id,organization_id,location_id,order_id,parent_document_id,
           payment_refund_id,type,status,provider,environment,fiscal_id_snapshot,
           currency,total_cents,cash_payment_cents,electronic_payment_cents,
           payload,request_hash,requested_by_user_id,requested_by_device_id,
           client_request_id,max_attempts,next_attempt_at,version
         ) VALUES (
           $1,$2,$3,$4,$5,$6,'VOID','QUEUED',$7::fiscal_provider,
           $8::fiscal_environment,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,
           $18,5,NOW(),1
         )`,
        [
          id,
          organizationId,
          sale.locationId,
          sale.orderId,
          sale.id,
          refundId,
          sale.provider,
          sale.environment,
          sale.fiscalId,
          sale.currency,
          sale.totalCents,
          sale.cashPaymentCents,
          sale.electronicPaymentCents,
          JSON.stringify({
            externalId: sale.externalId,
            reason,
            paymentRefundId: refundId,
            mutationId: dto.mutationId,
          }),
          requestHash,
          auth.userId,
          auth.deviceId,
          dto.mutationId,
        ],
      );
      await this.auditAndOutbox(client, {
        organizationId,
        actorUserId: auth.userId,
        documentId: id,
        refundId,
        paymentId: await this.refundPaymentId(client, refundId),
        orderId: sale.orderId,
        reason,
      });
      documentId = id;
      shouldQueue = true;
    });

    if (shouldQueue) await this.queue.enqueue(documentId);
    const document = await this.findVoid(organizationId, documentId);
    if (!document) throw this.documentNotFound();
    return document;
  }

  private findRefund(organizationId: string, refundId: string) {
    return this.database.pool
      .query<RefundRow>(
        `SELECT id,organization_id AS "organizationId",
           location_id AS "locationId",order_id AS "orderId",status::text
         FROM payment_refunds WHERE organization_id=$1 AND id=$2 LIMIT 1`,
        [organizationId, refundId],
      )
      .then((result) => result.rows[0] ?? null);
  }

  private async lockRefund(
    client: PoolClient,
    organizationId: string,
    refundId: string,
  ) {
    const result = await client.query<RefundRow>(
      `SELECT id,organization_id AS "organizationId",
         location_id AS "locationId",order_id AS "orderId",status::text
       FROM payment_refunds WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
      [organizationId, refundId],
    );
    const refund = result.rows[0];
    if (!refund) throw this.refundNotFound();
    return refund;
  }

  private async orderRefundState(
    client: PoolClient,
    organizationId: string,
    orderId: string,
  ) {
    const result = await client.query<OrderRefundStateRow>(
      `SELECT o.total_cents AS "orderTotalCents",
         COALESCE(SUM(pr.amount_cents) FILTER (WHERE pr.status='SUCCEEDED'),0)::int
           AS "refundedCents"
       FROM orders o
       LEFT JOIN payment_refunds pr
         ON pr.organization_id=o.organization_id AND pr.order_id=o.id
       WHERE o.organization_id=$1 AND o.id=$2
       GROUP BY o.id,o.total_cents`,
      [organizationId, orderId],
    );
    const state = result.rows[0];
    if (!state) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Ordine del rimborso non trovato.',
      });
    }
    return state;
  }

  private async lockIssuedSale(
    client: PoolClient,
    organizationId: string,
    orderId: string,
  ) {
    const result = await client.query<SaleDocumentRow>(
      `SELECT id,organization_id AS "organizationId",
         location_id AS "locationId",order_id AS "orderId",provider::text,
         environment::text,fiscal_id_snapshot AS "fiscalId",currency,
         total_cents AS "totalCents",cash_payment_cents AS "cashPaymentCents",
         electronic_payment_cents AS "electronicPaymentCents",
         external_id AS "externalId",version
       FROM fiscal_documents
       WHERE organization_id=$1 AND order_id=$2 AND type='SALE'
         AND status='ISSUED' AND external_id IS NOT NULL
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [organizationId, orderId],
    );
    const sale = result.rows[0];
    if (!sale) {
      throw new ConflictException({
        code: 'ISSUED_FISCAL_SALE_NOT_FOUND',
        message: 'Non esiste un documento fiscale emesso da stornare.',
      });
    }
    return sale;
  }

  private findVoidByRefund(
    client: PoolClient,
    organizationId: string,
    refundId: string,
  ) {
    return client
      .query<VoidDocumentRow>(
        `${this.voidSelect()}
         WHERE fd.organization_id=$1 AND fd.payment_refund_id=$2 LIMIT 1`,
        [organizationId, refundId],
      )
      .then((result) => result.rows[0] ?? null);
  }

  private findVoid(organizationId: string, documentId: string) {
    return this.database.pool
      .query<VoidDocumentRow>(
        `${this.voidSelect()}
         WHERE fd.organization_id=$1 AND fd.id=$2 LIMIT 1`,
        [organizationId, documentId],
      )
      .then((result) => result.rows[0] ?? null);
  }

  private voidSelect() {
    return `SELECT fd.id,fd.organization_id AS "organizationId",
      fd.location_id AS "locationId",fd.order_id AS "orderId",
      fd.payment_refund_id AS "paymentRefundId",
      fd.parent_document_id AS "parentDocumentId",fd.type::text,fd.status::text,
      fd.provider::text,fd.environment::text,fd.currency,
      fd.total_cents AS "totalCents",fd.request_hash AS "requestHash",
      fd.created_at AS "createdAt" FROM fiscal_documents fd`;
  }

  private async refundPaymentId(client: PoolClient, refundId: string) {
    const result = await client.query<{ paymentId: string } & QueryResultRow>(
      `SELECT payment_id AS "paymentId" FROM payment_refunds WHERE id=$1`,
      [refundId],
    );
    return result.rows[0]?.paymentId ?? '';
  }

  private auditAndOutbox(
    client: PoolClient,
    input: {
      organizationId: string;
      actorUserId: string;
      documentId: string;
      refundId: string;
      paymentId: string;
      orderId: string;
      reason: string;
    },
  ) {
    const payload = {
      organizationId: input.organizationId,
      documentId: input.documentId,
      paymentRefundId: input.refundId,
      paymentId: input.paymentId,
      orderId: input.orderId,
      reason: input.reason,
    };
    return Promise.all([
      client.query(
        `INSERT INTO audit_events
         (id,organization_id,actor_user_id,action,entity_type,entity_id,payload)
         VALUES ($1,$2,$3,'fiscal.refund-void.queued','fiscal_document',$4,$5::jsonb)`,
        [
          randomUUID(),
          input.organizationId,
          input.actorUserId,
          input.documentId,
          JSON.stringify(payload),
        ],
      ),
      client.query(
        `INSERT INTO outbox_events
         (id,topic,aggregate_type,aggregate_id,payload)
         VALUES ($1,'fiscal.refund-void.queued','fiscal_document',$2,$3::jsonb)`,
        [randomUUID(), input.documentId, JSON.stringify(payload)],
      ),
    ]);
  }

  private refundNotFound() {
    return new NotFoundException({
      code: 'PAYMENT_REFUND_NOT_FOUND',
      message: 'Rimborso non trovato.',
    });
  }

  private documentNotFound() {
    return new NotFoundException({
      code: 'FISCAL_DOCUMENT_NOT_FOUND',
      message: 'Documento fiscale non trovato.',
    });
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
