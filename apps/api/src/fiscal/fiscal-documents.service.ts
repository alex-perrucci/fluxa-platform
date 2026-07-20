import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { FiscalDocumentListQueryDto } from './dto/fiscal-document-list-query.dto';
import type {
  FiscalMutationDto,
  VoidFiscalDocumentDto,
} from './dto/fiscal-mutation.dto';
import type { IssueFiscalDocumentDto } from './dto/issue-fiscal-document.dto';
import { FiscalAccessService } from './fiscal-access.service';
import { fiscalRequestHash } from './fiscal-idempotency';
import {
  acubeVatRateCode,
  allocateFiscalPayments,
  assertOrderFiscalizable,
  centsToDecimal,
  scaledQuantity,
} from './fiscal-policy';
import { FiscalQueueService } from './fiscal-queue.service';

interface ProfileRow extends QueryResultRow {
  id: string;
  provider: 'MOCK' | 'ACUBE_SMART_RECEIPTS';
  environment: 'SANDBOX' | 'PRODUCTION';
  fiscalId: string;
  enabled: boolean;
  receiptEmail: string | null;
}
interface OrderRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  status: string;
  number: string;
  currency: string;
  totalCents: number;
  version: number;
}
interface ItemRow extends QueryResultRow {
  id: string;
  productName: string;
  variantName: string | null;
  quantityAmount: number;
  quantityScale: number;
  unitPriceCents: number;
  grossTotalCents: number;
  discountCents: number;
  finalGrossCents: number;
  vatRateBasisPoints: number;
  vatNatureCode: string | null;
}
interface VatRow extends QueryResultRow {
  vatKey: string;
  vatRateBasisPoints: number;
  vatNatureCode: string | null;
  grossCents: number;
  netCents: number;
  taxCents: number;
}
interface PaymentRow extends QueryResultRow {
  method: string;
  amountCents: number;
}
interface CountRow extends QueryResultRow {
  count: number;
}
interface MutationRow extends QueryResultRow {
  requestHash: string;
  responseVersion: number;
}
interface FiscalItemViewRow extends QueryResultRow {
  id: string;
  fiscal_document_id: string;
  line_no: number;
  description: string;
  quantity_amount: number;
  quantity_scale: number;
  unit_price_cents: number;
  gross_cents: number;
  discount_cents: number;
  final_gross_cents: number;
  vat_rate_basis_points: number;
  vat_nature_code: string | null;
  vat_rate_code: string;
}
interface FiscalVatViewRow extends QueryResultRow {
  id: string;
  vat_key: string;
  vat_rate_basis_points: number;
  vat_nature_code: string | null;
  gross_cents: number;
  net_cents: number;
  tax_cents: number;
}
interface FiscalAttemptViewRow extends QueryResultRow {
  attemptNo: number;
  outcome: string;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}
export interface FiscalDocumentRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  orderId: string;
  parentDocumentId: string | null;
  type: 'SALE' | 'VOID';
  status: string;
  provider: string;
  environment: string;
  fiscalId: string;
  currency: string;
  totalCents: number;
  cashPaymentCents: number;
  electronicPaymentCents: number;
  externalId: string | null;
  externalStatus: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  version: number;
  payload: Record<string, unknown>;
  providerResponse: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  issuedAt: Date | null;
  voidedAt: Date | null;
}

@Injectable()
export class FiscalDocumentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: FiscalAccessService,
    private readonly queue: FiscalQueueService,
  ) {}

  async list(auth: AuthContext, query: FiscalDocumentListQueryDto) {
    const scope = await this.access.assertLocation(auth, query.locationId);
    const offset = (query.page - 1) * query.pageSize;
    const values = [
      scope.organizationId,
      query.locationId,
      query.type ?? null,
      query.status ?? null,
      query.pageSize,
      offset,
    ];
    const [items, count] = await Promise.all([
      this.database.pool.query<FiscalDocumentRow>(
        `${this.selectDocumentSql()} WHERE organization_id=$1 AND location_id=$2
         AND ($3::text IS NULL OR type::text=$3) AND ($4::text IS NULL OR status::text=$4)
         ORDER BY created_at DESC, id DESC LIMIT $5 OFFSET $6`,
        values,
      ),
      this.database.pool.query<CountRow>(
        `SELECT COUNT(*)::int AS count FROM fiscal_documents WHERE organization_id=$1 AND location_id=$2
         AND ($3::text IS NULL OR type::text=$3) AND ($4::text IS NULL OR status::text=$4)`,
        values.slice(0, 4),
      ),
    ]);
    return {
      page: query.page,
      pageSize: query.pageSize,
      total: count.rows[0]?.count ?? 0,
      items: items.rows,
    };
  }

  async get(auth: AuthContext, documentId: string) {
    const organizationId = assertOrganizationScope(auth);
    const document = await this.findDocument(organizationId, documentId);
    if (!document) throw this.notFound();
    await this.access.assertLocation(auth, document.locationId);
    const [items, vats, attempts] = await Promise.all([
      this.database.pool.query<FiscalItemViewRow>(
        `SELECT * FROM fiscal_document_items WHERE fiscal_document_id=$1 ORDER BY line_no`,
        [documentId],
      ),
      this.database.pool.query<FiscalVatViewRow>(
        `SELECT * FROM fiscal_document_vat_summaries WHERE fiscal_document_id=$1 ORDER BY vat_rate_basis_points`,
        [documentId],
      ),
      this.database.pool.query<FiscalAttemptViewRow>(
        `SELECT attempt_no AS "attemptNo", outcome, error_code AS "errorCode", error_message AS "errorMessage", started_at AS "startedAt", finished_at AS "finishedAt" FROM fiscal_attempts WHERE fiscal_document_id=$1 ORDER BY attempt_no`,
        [documentId],
      ),
    ]);
    return {
      ...document,
      items: items.rows,
      vatSummaries: vats.rows,
      attempts: attempts.rows,
    };
  }

  async issue(auth: AuthContext, orderId: string, dto: IssueFiscalDocumentDto) {
    const organizationId = assertOrganizationScope(auth);
    const requestHash = fiscalRequestHash({
      orderId,
      lotteryCode: dto.lotteryCode ?? null,
    });
    let documentId = '';
    let duplicate = false;
    await this.withTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `fiscal-order:${orderId}`,
      ]);
      const existingRequest = await client.query<FiscalDocumentRow>(
        `${this.selectDocumentSql()} WHERE organization_id=$1 AND requested_by_device_id=$2 AND client_request_id=$3 LIMIT 1`,
        [organizationId, auth.deviceId, dto.clientRequestId],
      );
      if (existingRequest.rows[0]) {
        if (existingRequest.rows[0].orderId !== orderId) {
          throw new ConflictException({
            code: 'FISCAL_CLIENT_REQUEST_REUSED',
            message: 'clientRequestId già usato per un altro ordine.',
          });
        }
        documentId = existingRequest.rows[0].id;
        duplicate = true;
        return;
      }
      const existingSale = await client.query<{ id: string } & QueryResultRow>(
        `SELECT id FROM fiscal_documents WHERE organization_id=$1 AND order_id=$2 AND type='SALE' LIMIT 1`,
        [organizationId, orderId],
      );
      if (existingSale.rows[0]) {
        documentId = existingSale.rows[0].id;
        duplicate = true;
        return;
      }
      const orderResult = await client.query<OrderRow>(
        `SELECT id, organization_id AS "organizationId", location_id AS "locationId", status,
          number, currency, total_cents AS "totalCents", version
         FROM orders WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [orderId, organizationId],
      );
      const order = orderResult.rows[0];
      if (!order)
        throw new NotFoundException({
          code: 'ORDER_NOT_FOUND',
          message: 'Ordine non trovato.',
        });
      await this.access.assertLocation(auth, order.locationId);
      const [profileResult, itemResult, vatResult, paymentResult] =
        await Promise.all([
          client.query<ProfileRow>(
            `SELECT id, provider, environment, fiscal_id AS "fiscalId", enabled, receipt_email AS "receiptEmail" FROM fiscal_profiles WHERE organization_id=$1 AND location_id=$2 LIMIT 1`,
            [organizationId, order.locationId],
          ),
          client.query<ItemRow>(
            `SELECT id, product_name_snapshot AS "productName", variant_name_snapshot AS "variantName",
          quantity_amount AS "quantityAmount", quantity_scale AS "quantityScale", unit_price_cents AS "unitPriceCents",
          gross_total_cents AS "grossTotalCents", allocated_discount_cents AS "discountCents",
          final_gross_cents AS "finalGrossCents", vat_rate_basis_points_snapshot AS "vatRateBasisPoints",
          vat_nature_code_snapshot AS "vatNatureCode" FROM order_items WHERE order_id=$1 ORDER BY sort_order, created_at`,
            [orderId],
          ),
          client.query<VatRow>(
            `SELECT vat_key AS "vatKey", vat_rate_basis_points AS "vatRateBasisPoints", vat_nature_code AS "vatNatureCode", gross_cents AS "grossCents", net_cents AS "netCents", tax_cents AS "taxCents" FROM order_vat_summaries WHERE order_id=$1 ORDER BY vat_rate_basis_points`,
            [orderId],
          ),
          client.query<PaymentRow>(
            `SELECT method, amount_cents AS "amountCents" FROM payment_transactions WHERE organization_id=$1 AND order_id=$2 AND status='CAPTURED' ORDER BY created_at`,
            [organizationId, orderId],
          ),
        ]);
      const profile = profileResult.rows[0];
      if (!profile || !profile.enabled)
        throw new ConflictException({
          code: 'FISCAL_PROFILE_NOT_ENABLED',
          message: 'Profilo fiscale non configurato o disabilitato.',
        });
      assertOrderFiscalizable({
        status: order.status,
        totalCents: order.totalCents,
        itemCount: itemResult.rows.length,
      });
      const payments = allocateFiscalPayments(
        order.totalCents,
        paymentResult.rows,
      );
      const providerItems = itemResult.rows.map((item) => ({
        quantity: scaledQuantity(item.quantityAmount, item.quantityScale),
        description: item.variantName
          ? `${item.productName} - ${item.variantName}`
          : item.productName,
        unit_price: centsToDecimal(item.unitPriceCents),
        vat_rate_code: acubeVatRateCode(
          item.vatRateBasisPoints,
          item.vatNatureCode,
        ),
        ...(item.discountCents > 0
          ? { discount: centsToDecimal(item.discountCents) }
          : {}),
      }));
      const payload: Record<string, unknown> = {
        fiscal_id: profile.fiscalId,
        items: providerItems,
        cash_payment_amount: centsToDecimal(payments.cashCents),
        electronic_payment_amount: centsToDecimal(payments.electronicCents),
        ...(dto.lotteryCode
          ? { lottery_code: dto.lotteryCode.toUpperCase() }
          : {}),
        ...(profile.receiptEmail ? { email: profile.receiptEmail } : {}),
      };
      documentId = randomUUID();
      await client.query(
        `INSERT INTO fiscal_documents (
          id, organization_id, location_id, order_id, type, status, provider,
          environment, fiscal_id_snapshot, currency, total_cents,
          cash_payment_cents, electronic_payment_cents, payload,
          request_hash, requested_by_user_id, requested_by_device_id,
          client_request_id, max_attempts, next_attempt_at, version
        ) VALUES ($1,$2,$3,$4,'SALE','QUEUED',$5::fiscal_provider,$6::fiscal_environment,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,5,NOW(),1)`,
        [
          documentId,
          organizationId,
          order.locationId,
          orderId,
          profile.provider,
          profile.environment,
          profile.fiscalId,
          order.currency,
          order.totalCents,
          payments.cashCents,
          payments.electronicCents,
          JSON.stringify(payload),
          requestHash,
          auth.userId,
          auth.deviceId,
          dto.clientRequestId,
        ],
      );
      let lineNo = 1;
      for (const item of itemResult.rows) {
        await client.query(
          `INSERT INTO fiscal_document_items (id, organization_id, fiscal_document_id, order_item_id, line_no,
            description, quantity_amount, quantity_scale, unit_price_cents, gross_cents, discount_cents,
            final_gross_cents, vat_rate_basis_points, vat_nature_code, vat_rate_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            randomUUID(),
            organizationId,
            documentId,
            item.id,
            lineNo++,
            item.variantName
              ? `${item.productName} - ${item.variantName}`
              : item.productName,
            item.quantityAmount,
            item.quantityScale,
            item.unitPriceCents,
            item.grossTotalCents,
            item.discountCents,
            item.finalGrossCents,
            item.vatRateBasisPoints,
            item.vatNatureCode,
            acubeVatRateCode(item.vatRateBasisPoints, item.vatNatureCode),
          ],
        );
      }
      for (const vat of vatResult.rows) {
        await client.query(
          `INSERT INTO fiscal_document_vat_summaries (id, organization_id, fiscal_document_id, vat_key, vat_rate_basis_points, vat_nature_code, gross_cents, net_cents, tax_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            randomUUID(),
            organizationId,
            documentId,
            vat.vatKey,
            vat.vatRateBasisPoints,
            vat.vatNatureCode,
            vat.grossCents,
            vat.netCents,
            vat.taxCents,
          ],
        );
      }
      await this.auditAndOutbox(
        client,
        organizationId,
        auth.userId,
        documentId,
        'fiscal.document.queued',
        { orderId, provider: profile.provider },
      );
    });
    if (!duplicate) await this.queue.enqueue(documentId);
    return this.get(auth, documentId);
  }

  async retry(auth: AuthContext, documentId: string, dto: FiscalMutationDto) {
    const document = await this.requireDocument(auth, documentId);
    const hash = fiscalRequestHash({ action: 'retry' });
    let shouldQueue = false;
    await this.withTransaction(async (client) => {
      const current = await this.lockDocument(
        client,
        document.organizationId,
        documentId,
      );
      const duplicate = await this.beginMutation(
        client,
        auth,
        current,
        dto,
        'fiscal.retry',
        hash,
      );
      if (duplicate) return;
      if (!['RETRY', 'REJECTED'].includes(current.status))
        throw new ConflictException({
          code: 'FISCAL_RETRY_NOT_ALLOWED',
          message: `Retry non consentito per stato ${current.status}.`,
        });
      const result = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE fiscal_documents SET status='QUEUED', error_code=NULL, error_message=NULL, next_attempt_at=NOW(), version=version+1, updated_at=NOW() WHERE id=$1 RETURNING version`,
        [documentId],
      );
      await this.recordMutation(
        client,
        auth,
        documentId,
        dto.mutationId,
        'fiscal.retry',
        hash,
        result.rows[0].version,
      );
      shouldQueue = true;
    });
    if (shouldQueue) await this.queue.enqueue(documentId);
    return this.get(auth, documentId);
  }

  async void(
    auth: AuthContext,
    documentId: string,
    dto: VoidFiscalDocumentDto,
  ) {
    const sale = await this.requireDocument(auth, documentId);
    if (sale.type !== 'SALE' || sale.status !== 'ISSUED' || !sale.externalId) {
      throw new ConflictException({
        code: 'FISCAL_VOID_NOT_ALLOWED',
        message: 'È annullabile solo un documento fiscale emesso.',
      });
    }
    const hash = fiscalRequestHash({
      parentDocumentId: documentId,
      reason: dto.reason.trim(),
    });
    let voidId = '';
    let shouldQueue = false;
    await this.withTransaction(async (client) => {
      const current = await this.lockDocument(
        client,
        sale.organizationId,
        documentId,
      );
      const duplicateMutation = await this.beginMutation(
        client,
        auth,
        current,
        dto,
        'fiscal.void',
        hash,
      );
      if (duplicateMutation) {
        const found = await client.query<{ id: string } & QueryResultRow>(
          `SELECT id FROM fiscal_documents WHERE parent_document_id=$1 AND type='VOID' LIMIT 1`,
          [documentId],
        );
        voidId = found.rows[0]?.id ?? documentId;
        return;
      }
      const existing = await client.query<{ id: string } & QueryResultRow>(
        `SELECT id FROM fiscal_documents WHERE parent_document_id=$1 AND type='VOID' LIMIT 1`,
        [documentId],
      );
      if (existing.rows[0]) {
        voidId = existing.rows[0].id;
        return;
      }
      voidId = randomUUID();
      await client.query(
        `INSERT INTO fiscal_documents (
        id, organization_id, location_id, order_id, parent_document_id, type, status,
        provider, environment, fiscal_id_snapshot, currency, total_cents,
        cash_payment_cents, electronic_payment_cents, payload, request_hash,
        requested_by_user_id, requested_by_device_id, max_attempts, next_attempt_at, version
      ) VALUES ($1,$2,$3,$4,$5,'VOID','QUEUED',$6::fiscal_provider,$7::fiscal_environment,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,5,NOW(),1)`,
        [
          voidId,
          sale.organizationId,
          sale.locationId,
          sale.orderId,
          sale.id,
          sale.provider,
          sale.environment,
          sale.fiscalId,
          sale.currency,
          sale.totalCents,
          sale.cashPaymentCents,
          sale.electronicPaymentCents,
          JSON.stringify({
            externalId: sale.externalId,
            reason: dto.reason.trim(),
          }),
          hash,
          auth.userId,
          auth.deviceId,
        ],
      );
      const result = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE fiscal_documents SET version=version+1, updated_at=NOW() WHERE id=$1 RETURNING version`,
        [documentId],
      );
      await this.recordMutation(
        client,
        auth,
        documentId,
        dto.mutationId,
        'fiscal.void',
        hash,
        result.rows[0].version,
      );
      await this.auditAndOutbox(
        client,
        sale.organizationId,
        auth.userId,
        voidId,
        'fiscal.void.queued',
        { parentDocumentId: documentId, reason: dto.reason.trim() },
      );
      shouldQueue = true;
    });
    if (shouldQueue) await this.queue.enqueue(voidId);
    return this.get(auth, voidId);
  }

  private async requireDocument(auth: AuthContext, documentId: string) {
    const organizationId = assertOrganizationScope(auth);
    const document = await this.findDocument(organizationId, documentId);
    if (!document) throw this.notFound();
    await this.access.assertLocation(auth, document.locationId);
    return document;
  }
  private findDocument(organizationId: string, documentId: string) {
    return this.database.pool
      .query<FiscalDocumentRow>(
        `${this.selectDocumentSql()} WHERE id=$1 AND organization_id=$2 LIMIT 1`,
        [documentId, organizationId],
      )
      .then((r) => r.rows[0] ?? null);
  }
  private selectDocumentSql() {
    return `SELECT id, organization_id AS "organizationId", location_id AS "locationId", order_id AS "orderId",
      parent_document_id AS "parentDocumentId", type, status, provider, environment,
      fiscal_id_snapshot AS "fiscalId", currency, total_cents AS "totalCents",
      cash_payment_cents AS "cashPaymentCents", electronic_payment_cents AS "electronicPaymentCents",
      external_id AS "externalId", external_status AS "externalStatus", document_number AS "documentNumber",
      document_date AS "documentDate", error_code AS "errorCode", error_message AS "errorMessage",
      attempts, max_attempts AS "maxAttempts", next_attempt_at AS "nextAttemptAt", version,
      payload, provider_response AS "providerResponse", created_at AS "createdAt", updated_at AS "updatedAt",
      issued_at AS "issuedAt", voided_at AS "voidedAt" FROM fiscal_documents`;
  }
  private async lockDocument(
    client: PoolClient,
    organizationId: string,
    id: string,
  ) {
    const result = await client.query<FiscalDocumentRow>(
      `${this.selectDocumentSql()} WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
      [id, organizationId],
    );
    const document = result.rows[0];
    if (!document) throw this.notFound();
    return document;
  }
  private async beginMutation(
    client: PoolClient,
    auth: AuthContext,
    document: FiscalDocumentRow,
    dto: FiscalMutationDto,
    operation: string,
    hash: string,
  ) {
    const found = await client.query<MutationRow>(
      `SELECT request_hash AS "requestHash", response_version AS "responseVersion" FROM fiscal_mutations WHERE fiscal_document_id=$1 AND device_id=$2 AND mutation_id=$3 LIMIT 1`,
      [document.id, auth.deviceId, dto.mutationId],
    );
    if (found.rows[0]) {
      if (found.rows[0].requestHash !== hash)
        throw new ConflictException({
          code: 'IDEMPOTENCY_KEY_REUSED',
          message: 'mutationId riutilizzato con un contenuto diverso.',
        });
      return true;
    }
    if (document.version !== dto.expectedVersion)
      throw new ConflictException({
        code: 'FISCAL_VERSION_CONFLICT',
        message: 'Versione documento fiscale non aggiornata.',
        currentVersion: document.version,
      });
    return false;
  }
  private recordMutation(
    client: PoolClient,
    auth: AuthContext,
    id: string,
    mutationId: string,
    operation: string,
    hash: string,
    version: number,
  ) {
    return client.query(
      `INSERT INTO fiscal_mutations (id, organization_id, fiscal_document_id, device_id, mutation_id, operation, request_hash, response_version) SELECT $1, organization_id, id, $2, $3, $4, $5, $6 FROM fiscal_documents WHERE id=$7`,
      [randomUUID(), auth.deviceId, mutationId, operation, hash, version, id],
    );
  }
  private auditAndOutbox(
    client: PoolClient,
    organizationId: string,
    userId: string,
    documentId: string,
    topic: string,
    payload: Record<string, unknown>,
  ) {
    return Promise.all([
      client.query(
        `INSERT INTO audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload) VALUES ($1,$2,$3,$4,'fiscal_document',$5,$6::jsonb)`,
        [
          randomUUID(),
          organizationId,
          userId,
          topic,
          documentId,
          JSON.stringify(payload),
        ],
      ),
      client.query(
        `INSERT INTO outbox_events (id, topic, aggregate_type, aggregate_id, payload) VALUES ($1,$2,'fiscal_document',$3,$4::jsonb)`,
        [
          randomUUID(),
          topic,
          documentId,
          JSON.stringify({ organizationId, documentId, ...payload }),
        ],
      ),
    ]);
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
  private notFound() {
    return new NotFoundException({
      code: 'FISCAL_DOCUMENT_NOT_FOUND',
      message: 'Documento fiscale non trovato.',
    });
  }
}
