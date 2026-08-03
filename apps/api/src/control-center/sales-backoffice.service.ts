import { Injectable, NotFoundException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { LocationAccessService } from '../auth/location-access.service';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type {
  FiscalBackofficeQueryDto,
  PaymentBackofficeQueryDto,
  SalesListQueryDto,
  SalesReportQueryDto,
} from './dto/sales-backoffice-query.dto';

interface LocationRow extends QueryResultRow {
  id: string;
  name: string;
  timezone: string;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface OrderDetailRow extends QueryResultRow {
  id: string;
  locationId: string;
  locationName: string;
  number: string;
  businessDate: string;
  status: string;
  serviceMode: string;
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

interface ReportTotalRow extends QueryResultRow {
  todayCents: string;
  weekCents: string;
  monthCents: string;
  bookingDepositsCents: string;
  paidOrders: number;
}

interface ReportLocationRow extends QueryResultRow {
  locationId: string;
  locationName: string;
  orders: number;
  posRevenueCents: string;
}

interface ReportMethodRow extends QueryResultRow {
  method: string;
  payments: number;
  orders: number;
  posRevenueCents: string;
}

interface ReportDailyRow extends QueryResultRow {
  date: string;
  orders: number;
  posRevenueCents: string;
}

@Injectable()
export class SalesBackofficeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly locationAccess: LocationAccessService,
  ) {}

  async orders(auth: AuthContext, query: SalesListQueryDto) {
    const scope = await this.scope(auth, query.locationId);
    const offset = (query.page - 1) * query.pageSize;
    const values = [
      scope.organizationId,
      scope.locationIds,
      query.status ?? null,
      query.q?.trim() || null,
      query.from ?? null,
      query.to ?? null,
      query.pageSize,
      offset,
    ];

    const where = `
      o.organization_id=$1
      AND o.location_id=ANY($2::uuid[])
      AND ($3::text IS NULL OR o.status::text=$3)
      AND (
        $4::text IS NULL
        OR o.number ILIKE '%' || $4 || '%'
        OR o.customer_note ILIKE '%' || $4 || '%'
      )
      AND ($5::date IS NULL OR o.business_date::date >= $5::date)
      AND ($6::date IS NULL OR o.business_date::date <= $6::date)
    `;

    const [items, count] = await Promise.all([
      this.database.pool.query(
        `SELECT
           o.id,o.location_id AS "locationId",l.name AS "locationName",
           o.number,o.business_date AS "businessDate",o.status,
           o.service_mode AS "serviceMode",o.customer_note AS "customerNote",
           o.currency,o.subtotal_cents AS "subtotalCents",
           o.discount_cents AS "discountCents",o.total_cents AS "totalCents",
           o.net_total_cents AS "netTotalCents",o.tax_total_cents AS "taxTotalCents",
           o.created_at AS "createdAt",o.updated_at AS "updatedAt",
           COALESCE((SELECT SUM(pt.amount_cents)::int FROM payment_transactions pt
             WHERE pt.order_id=o.id AND pt.status='CAPTURED'),0) AS "paidCents",
           COALESCE((SELECT string_agg(DISTINCT pt.method::text, ', ' ORDER BY pt.method::text)
             FROM payment_transactions pt WHERE pt.order_id=o.id AND pt.status='CAPTURED'),'') AS "paymentMethods",
           fd.status AS "fiscalStatus",fd.document_number AS "fiscalDocumentNumber"
         FROM orders o
         JOIN locations l ON l.id=o.location_id
         LEFT JOIN LATERAL (
           SELECT status,document_number
           FROM fiscal_documents
           WHERE order_id=o.id AND type='SALE'
           ORDER BY created_at DESC LIMIT 1
         ) fd ON TRUE
         WHERE ${where}
         ORDER BY o.created_at DESC,o.id DESC
         LIMIT $7 OFFSET $8`,
        values,
      ),
      this.database.pool.query<CountRow>(
        `SELECT COUNT(*)::int AS count FROM orders o WHERE ${where}`,
        values.slice(0, 6),
      ),
    ]);

    return {
      scope: scope.view,
      page: query.page,
      pageSize: query.pageSize,
      total: count.rows[0]?.count ?? 0,
      items: items.rows,
    };
  }

  async order(auth: AuthContext, orderId: string) {
    const scope = await this.scope(auth);
    const order = await this.database.pool.query<OrderDetailRow>(
      `SELECT
         o.id,o.location_id AS "locationId",l.name AS "locationName",o.number,
         o.business_date AS "businessDate",o.status,o.service_mode AS "serviceMode",
         o.customer_note AS "customerNote",o.currency,o.version,
         o.subtotal_cents AS "subtotalCents",o.discount_cents AS "discountCents",
         o.total_cents AS "totalCents",o.net_total_cents AS "netTotalCents",
         o.tax_total_cents AS "taxTotalCents",o.held_at AS "heldAt",
         o.cancelled_at AS "cancelledAt",o.cancel_reason AS "cancelReason",
         o.created_at AS "createdAt",o.updated_at AS "updatedAt"
       FROM orders o JOIN locations l ON l.id=o.location_id
       WHERE o.id=$1 AND o.organization_id=$2 AND o.location_id=ANY($3::uuid[])
       LIMIT 1`,
      [orderId, scope.organizationId, scope.locationIds],
    );
    const selectedOrder = order.rows[0];

    if (!selectedOrder) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Ordine non trovato nel perimetro autorizzato.',
      });
    }

    const [items, adjustments, vats, payments, fiscalDocuments] =
      await Promise.all([
        this.database.pool.query(
          `SELECT id,product_name_snapshot AS "productName",
             variant_name_snapshot AS "variantName",quantity_amount AS "quantityAmount",
             quantity_scale AS "quantityScale",unit_price_cents AS "unitPriceCents",
             gross_total_cents AS "grossTotalCents",
             allocated_discount_cents AS "discountCents",
             final_gross_cents AS "finalGrossCents",final_net_cents AS "finalNetCents",
             final_tax_cents AS "finalTaxCents",vat_code_snapshot AS "vatCode",
             vat_rate_basis_points_snapshot AS "vatRateBasisPoints",note
           FROM order_items WHERE organization_id=$1 AND order_id=$2
           ORDER BY sort_order,created_at`,
          [scope.organizationId, orderId],
        ),
        this.database.pool.query(
          `SELECT id,type,value,reason,applied_cents AS "appliedCents",created_at AS "createdAt"
           FROM order_adjustments WHERE organization_id=$1 AND order_id=$2
           ORDER BY created_at`,
          [scope.organizationId, orderId],
        ),
        this.database.pool.query(
          `SELECT vat_key AS "vatKey",vat_rate_basis_points AS "vatRateBasisPoints",
             vat_nature_code AS "vatNatureCode",gross_cents AS "grossCents",
             net_cents AS "netCents",tax_cents AS "taxCents"
           FROM order_vat_summaries WHERE organization_id=$1 AND order_id=$2
           ORDER BY vat_rate_basis_points`,
          [scope.organizationId, orderId],
        ),
        this.database.pool.query(
          `SELECT id,method,provider,status,amount_cents AS "amountCents",
             tendered_cents AS "tenderedCents",change_cents AS "changeCents",
             provider_reference AS "providerReference",failure_code AS "failureCode",
             failure_message AS "failureMessage",captured_at AS "capturedAt",
             created_at AS "createdAt"
           FROM payment_transactions WHERE organization_id=$1 AND order_id=$2
           ORDER BY created_at`,
          [scope.organizationId, orderId],
        ),
        this.database.pool.query(
          `SELECT id,type,status,provider,environment,total_cents AS "totalCents",
             document_number AS "documentNumber",document_date AS "documentDate",
             external_status AS "externalStatus",error_code AS "errorCode",
             error_message AS "errorMessage",issued_at AS "issuedAt",created_at AS "createdAt"
           FROM fiscal_documents WHERE organization_id=$1 AND order_id=$2
           ORDER BY created_at DESC`,
          [scope.organizationId, orderId],
        ),
      ]);

    return {
      ...selectedOrder,
      items: items.rows,
      adjustments: adjustments.rows,
      vatSummaries: vats.rows,
      payments: payments.rows,
      fiscalDocuments: fiscalDocuments.rows,
    };
  }

  async payments(auth: AuthContext, query: PaymentBackofficeQueryDto) {
    const scope = await this.scope(auth, query.locationId);
    const offset = (query.page - 1) * query.pageSize;
    const values = [
      scope.organizationId,
      scope.locationIds,
      query.method ?? null,
      query.status ?? null,
      query.q?.trim() || null,
      query.from ?? null,
      query.to ?? null,
      query.pageSize,
      offset,
    ];
    const where = `
      pt.organization_id=$1 AND pt.location_id=ANY($2::uuid[])
      AND ($3::text IS NULL OR pt.method::text=$3)
      AND ($4::text IS NULL OR pt.status::text=$4)
      AND ($5::text IS NULL OR o.number ILIKE '%' || $5 || '%'
        OR COALESCE(pt.provider_reference,'') ILIKE '%' || $5 || '%')
      AND ($6::date IS NULL OR pt.created_at::date >= $6::date)
      AND ($7::date IS NULL OR pt.created_at::date <= $7::date)
    `;
    const [items, count] = await Promise.all([
      this.database.pool.query(
        `SELECT pt.id,pt.location_id AS "locationId",l.name AS "locationName",
           pt.order_id AS "orderId",o.number AS "orderNumber",pt.method,pt.provider,
           pt.status,pt.amount_cents AS "amountCents",pt.tendered_cents AS "tenderedCents",
           pt.change_cents AS "changeCents",pt.provider_reference AS "providerReference",
           pt.failure_code AS "failureCode",pt.failure_message AS "failureMessage",
           pt.captured_at AS "capturedAt",pt.created_at AS "createdAt"
         FROM payment_transactions pt
         JOIN orders o ON o.id=pt.order_id JOIN locations l ON l.id=pt.location_id
         WHERE ${where} ORDER BY pt.created_at DESC,pt.id DESC LIMIT $8 OFFSET $9`,
        values,
      ),
      this.database.pool.query<CountRow>(
        `SELECT COUNT(*)::int AS count FROM payment_transactions pt
         JOIN orders o ON o.id=pt.order_id WHERE ${where}`,
        values.slice(0, 7),
      ),
    ]);
    return {
      scope: scope.view,
      page: query.page,
      pageSize: query.pageSize,
      total: count.rows[0]?.count ?? 0,
      items: items.rows,
    };
  }

  async fiscalDocuments(auth: AuthContext, query: FiscalBackofficeQueryDto) {
    const scope = await this.scope(auth, query.locationId);
    const offset = (query.page - 1) * query.pageSize;
    const values = [
      scope.organizationId,
      scope.locationIds,
      query.status ?? null,
      query.type ?? null,
      query.q?.trim() || null,
      query.from ?? null,
      query.to ?? null,
      query.pageSize,
      offset,
    ];
    const where = `
      fd.organization_id=$1 AND fd.location_id=ANY($2::uuid[])
      AND ($3::text IS NULL OR fd.status::text=$3)
      AND ($4::text IS NULL OR fd.type::text=$4)
      AND ($5::text IS NULL OR o.number ILIKE '%' || $5 || '%'
        OR COALESCE(fd.document_number,'') ILIKE '%' || $5 || '%')
      AND ($6::date IS NULL OR fd.created_at::date >= $6::date)
      AND ($7::date IS NULL OR fd.created_at::date <= $7::date)
    `;
    const [items, count] = await Promise.all([
      this.database.pool.query(
        `SELECT fd.id,fd.location_id AS "locationId",l.name AS "locationName",
           fd.order_id AS "orderId",o.number AS "orderNumber",fd.type,fd.status,
           fd.provider,fd.environment,fd.currency,fd.total_cents AS "totalCents",
           fd.cash_payment_cents AS "cashPaymentCents",
           fd.electronic_payment_cents AS "electronicPaymentCents",
           fd.document_number AS "documentNumber",fd.document_date AS "documentDate",
           fd.external_status AS "externalStatus",fd.error_code AS "errorCode",
           fd.error_message AS "errorMessage",fd.attempts,fd.issued_at AS "issuedAt",
           fd.created_at AS "createdAt"
         FROM fiscal_documents fd JOIN orders o ON o.id=fd.order_id
         JOIN locations l ON l.id=fd.location_id
         WHERE ${where} ORDER BY fd.created_at DESC,fd.id DESC LIMIT $8 OFFSET $9`,
        values,
      ),
      this.database.pool.query<CountRow>(
        `SELECT COUNT(*)::int AS count FROM fiscal_documents fd
         JOIN orders o ON o.id=fd.order_id WHERE ${where}`,
        values.slice(0, 7),
      ),
    ]);
    return {
      scope: scope.view,
      page: query.page,
      pageSize: query.pageSize,
      total: count.rows[0]?.count ?? 0,
      items: items.rows,
    };
  }

  async report(auth: AuthContext, query: SalesReportQueryDto) {
    const scope = await this.scope(auth, query.locationId);
    const values = [
      scope.organizationId,
      scope.locationIds,
      query.method ?? null,
      query.from ?? null,
      query.to ?? null,
    ];
    const paymentWhere = `
      pt.organization_id=$1 AND pt.location_id=ANY($2::uuid[])
      AND pt.status='CAPTURED' AND ($3::text IS NULL OR pt.method::text=$3)
      AND ($4::date IS NULL OR pt.captured_at::date >= $4::date)
      AND ($5::date IS NULL OR pt.captured_at::date <= $5::date)
    `;
    const [totals, byLocation, byMethod, daily] = await Promise.all([
      this.database.pool.query<ReportTotalRow>(
        `SELECT
           COALESCE(SUM(pt.amount_cents) FILTER (WHERE pt.captured_at::date=CURRENT_DATE),0)::text AS "todayCents",
           COALESCE(SUM(pt.amount_cents) FILTER (WHERE pt.captured_at>=date_trunc('week',NOW())),0)::text AS "weekCents",
           COALESCE(SUM(pt.amount_cents) FILTER (WHERE pt.captured_at>=date_trunc('month',NOW())),0)::text AS "monthCents",
           (SELECT COALESCE(SUM(rp.amount_cents),0)::text FROM reservation_payments rp
             WHERE rp.organization_id=$1 AND rp.location_id=ANY($2::uuid[]) AND rp.status='PAID'
             AND ($4::date IS NULL OR rp.created_at::date >= $4::date)
             AND ($5::date IS NULL OR rp.created_at::date <= $5::date)) AS "bookingDepositsCents",
           COUNT(DISTINCT pt.order_id)::int AS "paidOrders"
         FROM payment_transactions pt WHERE ${paymentWhere}`,
        values,
      ),
      this.database.pool.query<ReportLocationRow>(
        `SELECT l.id AS "locationId",l.name AS "locationName",
           COUNT(DISTINCT pt.order_id)::int AS orders,
           COALESCE(SUM(pt.amount_cents),0)::text AS "posRevenueCents"
         FROM payment_transactions pt JOIN locations l ON l.id=pt.location_id
         WHERE ${paymentWhere} GROUP BY l.id,l.name ORDER BY l.name`,
        values,
      ),
      this.database.pool.query<ReportMethodRow>(
        `SELECT pt.method,COUNT(*)::int AS payments,
           COUNT(DISTINCT pt.order_id)::int AS orders,
           COALESCE(SUM(pt.amount_cents),0)::text AS "posRevenueCents"
         FROM payment_transactions pt WHERE ${paymentWhere}
         GROUP BY pt.method ORDER BY pt.method`,
        values,
      ),
      this.database.pool.query<ReportDailyRow>(
        `SELECT pt.captured_at::date::text AS date,
           COUNT(DISTINCT pt.order_id)::int AS orders,
           COALESCE(SUM(pt.amount_cents),0)::text AS "posRevenueCents"
         FROM payment_transactions pt WHERE ${paymentWhere}
         GROUP BY pt.captured_at::date ORDER BY pt.captured_at::date DESC LIMIT 92`,
        values,
      ),
    ]);
    return {
      scope: scope.view,
      totals: totals.rows[0] ?? {
        todayCents: '0',
        weekCents: '0',
        monthCents: '0',
        bookingDepositsCents: '0',
        paidOrders: 0,
      },
      byLocation: byLocation.rows,
      byMethod: byMethod.rows,
      daily: daily.rows,
    };
  }

  private async scope(auth: AuthContext, requestedLocationId?: string) {
    const organizationId = assertOrganizationScope(auth);
    if (requestedLocationId) {
      await this.locationAccess.assert(auth, requestedLocationId);
    }
    const globallyScoped = auth.role === 'OWNER' || auth.role === 'ADMIN';
    const locations = await this.database.pool.query<LocationRow>(
      `SELECT l.id,l.name,l.timezone FROM locations l
       LEFT JOIN location_lifecycle ll ON ll.location_id=l.id
       LEFT JOIN organization_membership_locations oml
         ON oml.organization_id=l.organization_id AND oml.location_id=l.id
         AND oml.membership_id=$2 AND oml.active=TRUE
       WHERE l.organization_id=$1 AND l.status='ACTIVE'
         AND COALESCE(ll.lifecycle_status::text,l.status::text)='ACTIVE'
         AND ($3::boolean OR oml.id IS NOT NULL)
         AND ($4::uuid IS NULL OR l.id=$4)
       ORDER BY l.name`,
      [
        organizationId,
        auth.membershipId,
        globallyScoped,
        requestedLocationId ?? null,
      ],
    );
    const locationIds = locations.rows.map((location) => location.id);
    return {
      organizationId,
      locationIds,
      view: {
        kind: requestedLocationId ? ('LOCATION' as const) : ('ALL' as const),
        location: requestedLocationId ? (locations.rows[0] ?? null) : null,
        locations: locations.rows,
      },
    };
  }
}
