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
import type { RequestPrintDto } from './dto/request-print.dto';
import { buildPrintRouteKey } from './print-policy';
import {
  renderKitchenTicket,
  renderOrderReceipt,
  renderPaymentReceipt,
  renderTestPage,
} from './print-renderer';
import { PrintingAccessService } from './printing-access.service';
import type { PrintDocumentType } from './printing.constants';

interface RouteTargetRow extends QueryResultRow {
  printerId: string;
  copies: number;
}

interface TicketHeaderRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  stationId: string;
  stationName: string;
  ticketNumber: string;
  orderNumber: string;
  tableCode: string | null;
  queuedAt: Date;
}

interface TicketItemRow extends QueryResultRow {
  quantityAmount: number;
  quantityScale: number;
  name: string;
  variantName: string | null;
  note: string | null;
}

interface OrderHeaderRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  number: string;
  businessDate: string;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  taxTotalCents: number;
}

interface OrderItemRow extends QueryResultRow {
  quantityAmount: number;
  quantityScale: number;
  name: string;
  variantName: string | null;
  note: string | null;
  totalCents: number;
}

interface CheckoutHeaderRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  orderId: string;
  orderNumber: string;
  businessDate: string;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  taxTotalCents: number;
  paidCents: number;
  changeCents: number;
  completedAt: Date | null;
  merchantLegalName: string;
  merchantTradeName: string | null;
  merchantVatNumber: string;
  merchantTaxCode: string | null;
  locationName: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  countryCode: string;
  timezone: string;
}

interface PaymentRow extends QueryResultRow {
  method: string;
  amountCents: number;
  tenderedCents: number | null;
  changeCents: number;
  status: string;
}

interface ReceiptItemRow extends QueryResultRow {
  quantityAmount: number;
  quantityScale: number;
  name: string;
  variantName: string | null;
  note: string | null;
  unitPriceCents: number;
  grossTotalCents: number;
  allocatedDiscountCents: number;
  finalGrossCents: number;
  vatRateBasisPoints: number;
  vatNatureCode: string | null;
}

interface VatSummaryRow extends QueryResultRow {
  vatRateBasisPoints: number;
  vatNatureCode: string | null;
  grossCents: number;
  netCents: number;
  taxCents: number;
}

interface InsertedJobRow extends QueryResultRow {
  id: string;
}

export interface KitchenPrintRequest {
  organizationId: string;
  locationId: string;
  ticketId: string;
  requestedByUserId: string;
  requestedByDeviceId: string;
  clientRequestId?: string | null;
  copiesOverride?: number;
  requireRoute?: boolean;
}

@Injectable()
export class PrintProducerService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: PrintingAccessService,
  ) {}

  async enqueueKitchenTicket(
    client: PoolClient,
    input: KitchenPrintRequest,
  ): Promise<string[]> {
    const headerResult = await client.query<TicketHeaderRow>(
      `
        SELECT kt.id,kt.organization_id AS "organizationId",
          kt.location_id AS "locationId",kt.station_id AS "stationId",
          ks.name AS "stationName",kt.number AS "ticketNumber",
          o.number AS "orderNumber",kt.table_code_snapshot AS "tableCode",
          kt.queued_at AS "queuedAt"
        FROM kitchen_tickets kt
        JOIN kitchen_stations ks ON ks.id=kt.station_id
        JOIN orders o ON o.id=kt.order_id
        WHERE kt.id=$1 AND kt.organization_id=$2 AND kt.location_id=$3
        LIMIT 1
      `,
      [input.ticketId, input.organizationId, input.locationId],
    );
    const header = headerResult.rows[0];
    if (!header) {
      throw new NotFoundException({
        code: 'KITCHEN_TICKET_NOT_FOUND',
        message: 'Comanda non trovata.',
      });
    }
    const itemResult = await client.query<TicketItemRow>(
      `
        SELECT quantity_amount AS "quantityAmount",
          quantity_scale AS "quantityScale",
          product_name_snapshot AS name,
          variant_name_snapshot AS "variantName",note_snapshot AS note
        FROM kitchen_ticket_items
        WHERE organization_id=$1 AND kitchen_ticket_id=$2
        ORDER BY created_at,id
      `,
      [input.organizationId, input.ticketId],
    );
    const renderedText = renderKitchenTicket({
      ticketNumber: header.ticketNumber,
      stationName: header.stationName,
      orderNumber: header.orderNumber,
      tableCode: header.tableCode,
      queuedAt: header.queuedAt,
      items: itemResult.rows,
    });
    const suffix = input.clientRequestId
      ? `REPRINT:${input.clientRequestId}`
      : 'AUTO:V1';
    return this.enqueueRouted(client, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      routeKey: buildPrintRouteKey('KITCHEN_TICKET', header.stationId),
      documentType: 'KITCHEN_TICKET',
      sourceEntityType: 'kitchen_ticket',
      sourceEntityId: input.ticketId,
      dedupeSeed: `KITCHEN_TICKET:${input.ticketId}:${suffix}`,
      renderedText,
      payload: {
        ticket: header,
        items: itemResult.rows,
      },
      requestedByUserId: input.requestedByUserId,
      requestedByDeviceId: input.requestedByDeviceId,
      clientRequestId: input.clientRequestId ?? null,
      copiesOverride: input.copiesOverride,
      requireRoute: input.requireRoute ?? false,
    });
  }

  async requestKitchenTicket(
    auth: AuthContext,
    ticketId: string,
    dto: RequestPrintDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const locationResult = await this.database.pool.query<
      { locationId: string } & QueryResultRow
    >(
      `SELECT location_id AS "locationId" FROM kitchen_tickets
       WHERE id=$1 AND organization_id=$2 LIMIT 1`,
      [ticketId, organizationId],
    );
    const locationId = locationResult.rows[0]?.locationId;
    if (!locationId) {
      throw new NotFoundException({
        code: 'KITCHEN_TICKET_NOT_FOUND',
        message: 'Comanda non trovata.',
      });
    }
    await this.access.assertLocation(auth, locationId);
    const ids = await this.withTransaction((client) =>
      this.enqueueKitchenTicket(client, {
        organizationId,
        locationId,
        ticketId,
        requestedByUserId: auth.userId,
        requestedByDeviceId: auth.deviceId,
        clientRequestId: dto.clientRequestId,
        copiesOverride: dto.copies,
        requireRoute: true,
      }),
    );
    return this.readJobs(auth, ids);
  }

  async requestOrderReceipt(
    auth: AuthContext,
    orderId: string,
    dto: RequestPrintDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const result = await this.withTransaction(async (client) => {
      const headerResult = await client.query<OrderHeaderRow>(
        `
          SELECT id,organization_id AS "organizationId",
            location_id AS "locationId",number,
            business_date AS "businessDate",currency,
            subtotal_cents AS "subtotalCents",discount_cents AS "discountCents",
            total_cents AS "totalCents",tax_total_cents AS "taxTotalCents"
          FROM orders WHERE id=$1 AND organization_id=$2 LIMIT 1
        `,
        [orderId, organizationId],
      );
      const header = headerResult.rows[0];
      if (!header) {
        throw new NotFoundException({
          code: 'ORDER_NOT_FOUND',
          message: 'Ordine non trovato.',
        });
      }
      await this.access.assertLocation(auth, header.locationId);
      const itemResult = await client.query<OrderItemRow>(
        `
          SELECT quantity_amount AS "quantityAmount",
            quantity_scale AS "quantityScale",
            product_name_snapshot AS name,
            variant_name_snapshot AS "variantName",note,
            final_gross_cents AS "totalCents"
          FROM order_items WHERE organization_id=$1 AND order_id=$2
          ORDER BY sort_order,created_at,id
        `,
        [organizationId, orderId],
      );
      const renderedText = renderOrderReceipt({
        orderNumber: header.number,
        businessDate: header.businessDate,
        currency: header.currency,
        items: itemResult.rows,
        subtotalCents: header.subtotalCents,
        discountCents: header.discountCents,
        totalCents: header.totalCents,
        taxTotalCents: header.taxTotalCents,
      });
      return this.enqueueRouted(client, {
        organizationId,
        locationId: header.locationId,
        routeKey: buildPrintRouteKey('ORDER_RECEIPT'),
        documentType: 'ORDER_RECEIPT',
        sourceEntityType: 'order',
        sourceEntityId: orderId,
        dedupeSeed: `ORDER_RECEIPT:${orderId}:${dto.clientRequestId}`,
        renderedText,
        payload: { order: header, items: itemResult.rows },
        requestedByUserId: auth.userId,
        requestedByDeviceId: auth.deviceId,
        clientRequestId: dto.clientRequestId,
        copiesOverride: dto.copies,
        requireRoute: true,
      });
    });
    return this.readJobs(auth, result);
  }

  async requestPaymentReceipt(
    auth: AuthContext,
    checkoutId: string,
    dto: RequestPrintDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const ids = await this.withTransaction(async (client) => {
      const headerResult = await client.query<CheckoutHeaderRow>(
        `
          SELECT
            cs.id,
            cs.organization_id AS "organizationId",
            cs.location_id AS "locationId",
            cs.order_id AS "orderId",
            o.number AS "orderNumber",
            o.business_date AS "businessDate",
            cs.currency,
            o.subtotal_cents AS "subtotalCents",
            o.discount_cents AS "discountCents",
            cs.order_total_cents AS "totalCents",
            o.tax_total_cents AS "taxTotalCents",
            cs.paid_cents AS "paidCents",
            cs.change_cents AS "changeCents",
            cs.completed_at AS "completedAt",
            m.legal_name AS "merchantLegalName",
            m.trade_name AS "merchantTradeName",
            m.vat_number AS "merchantVatNumber",
            m.tax_code AS "merchantTaxCode",
            l.name AS "locationName",
            l.address_line_1 AS "addressLine1",
            l.address_line_2 AS "addressLine2",
            l.postal_code AS "postalCode",
            l.city,
            l.province,
            l.country_code AS "countryCode",
            l.timezone
          FROM checkout_sessions cs
          JOIN orders o
            ON o.id=cs.order_id AND o.organization_id=cs.organization_id
          JOIN locations l
            ON l.id=cs.location_id AND l.organization_id=cs.organization_id
          JOIN merchants m
            ON m.id=l.merchant_id AND m.organization_id=cs.organization_id
          WHERE cs.id=$1 AND cs.organization_id=$2
          LIMIT 1
        `,
        [checkoutId, organizationId],
      );
      const header = headerResult.rows[0];
      if (!header) {
        throw new NotFoundException({
          code: 'CHECKOUT_NOT_FOUND',
          message: 'Checkout non trovato.',
        });
      }
      await this.access.assertLocation(auth, header.locationId);

      const [paymentResult, itemResult, vatSummaryResult] = await Promise.all([
        client.query<PaymentRow>(
          `
            SELECT
              method,
              amount_cents AS "amountCents",
              tendered_cents AS "tenderedCents",
              change_cents AS "changeCents",
              status
            FROM payment_transactions
            WHERE organization_id=$1 AND checkout_session_id=$2
            ORDER BY created_at,id
          `,
          [organizationId, checkoutId],
        ),
        client.query<ReceiptItemRow>(
          `
            SELECT
              quantity_amount AS "quantityAmount",
              quantity_scale AS "quantityScale",
              product_name_snapshot AS name,
              variant_name_snapshot AS "variantName",
              note,
              unit_price_cents AS "unitPriceCents",
              gross_total_cents AS "grossTotalCents",
              allocated_discount_cents AS "allocatedDiscountCents",
              final_gross_cents AS "finalGrossCents",
              vat_rate_basis_points_snapshot AS "vatRateBasisPoints",
              vat_nature_code_snapshot AS "vatNatureCode"
            FROM order_items
            WHERE organization_id=$1 AND order_id=$2
            ORDER BY sort_order,created_at,id
          `,
          [organizationId, header.orderId],
        ),
        client.query<VatSummaryRow>(
          `
            SELECT
              vat_rate_basis_points AS "vatRateBasisPoints",
              vat_nature_code AS "vatNatureCode",
              gross_cents AS "grossCents",
              net_cents AS "netCents",
              tax_cents AS "taxCents"
            FROM order_vat_summaries
            WHERE organization_id=$1 AND order_id=$2
            ORDER BY vat_rate_basis_points DESC,vat_nature_code NULLS FIRST
          `,
          [organizationId, header.orderId],
        ),
      ]);

      const renderedText = renderPaymentReceipt({
        merchant: {
          legalName: header.merchantLegalName,
          tradeName: header.merchantTradeName,
          vatNumber: header.merchantVatNumber,
          taxCode: header.merchantTaxCode,
        },
        location: {
          name: header.locationName,
          addressLine1: header.addressLine1,
          addressLine2: header.addressLine2,
          postalCode: header.postalCode,
          city: header.city,
          province: header.province,
          countryCode: header.countryCode,
          timezone: header.timezone,
        },
        orderNumber: header.orderNumber,
        businessDate: header.businessDate,
        completedAt: header.completedAt,
        currency: header.currency,
        subtotalCents: header.subtotalCents,
        discountCents: header.discountCents,
        totalCents: header.totalCents,
        taxTotalCents: header.taxTotalCents,
        paidCents: header.paidCents,
        changeCents: header.changeCents,
        items: itemResult.rows,
        vatSummaries: vatSummaryResult.rows,
        payments: paymentResult.rows,
      });
      return this.enqueueRouted(client, {
        organizationId,
        locationId: header.locationId,
        routeKey: buildPrintRouteKey('PAYMENT_RECEIPT'),
        documentType: 'PAYMENT_RECEIPT',
        sourceEntityType: 'checkout',
        sourceEntityId: checkoutId,
        dedupeSeed: `PAYMENT_RECEIPT:${checkoutId}:${dto.clientRequestId}`,
        renderedText,
        payload: {
          checkout: header,
          items: itemResult.rows,
          vatSummaries: vatSummaryResult.rows,
          payments: paymentResult.rows,
        },
        requestedByUserId: auth.userId,
        requestedByDeviceId: auth.deviceId,
        clientRequestId: dto.clientRequestId,
        copiesOverride: dto.copies,
        requireRoute: true,
      });
    });
    return this.readJobs(auth, ids);
  }

  async requestTestPage(
    auth: AuthContext,
    printerId: string,
    dto: RequestPrintDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const printer = await this.access.printer(organizationId, printerId);
    await this.access.assertLocation(auth, printer.locationId);
    if (printer.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'PRINTER_NOT_ACTIVE',
        message: 'La stampante non è attiva.',
      });
    }
    const renderedText = renderTestPage({
      printerName: printer.name,
      code: printer.code,
      deviceId: auth.deviceId,
      generatedAt: new Date(),
    });
    const ids = await this.withTransaction(async (client) => {
      const id = await this.insertJob(client, {
        organizationId,
        locationId: printer.locationId,
        printerId,
        documentType: 'TEST_PAGE',
        sourceEntityType: 'printer',
        sourceEntityId: printerId,
        dedupeKey: `TEST_PAGE:${dto.clientRequestId}`,
        renderedText,
        payload: { printerId, printerCode: printer.code },
        copies: dto.copies ?? 1,
        requestedByUserId: auth.userId,
        requestedByDeviceId: auth.deviceId,
        clientRequestId: dto.clientRequestId,
      });
      return [id];
    });
    return this.readJobs(auth, ids);
  }

  private async enqueueRouted(
    client: PoolClient,
    input: {
      organizationId: string;
      locationId: string;
      routeKey: string;
      documentType: PrintDocumentType;
      sourceEntityType: string;
      sourceEntityId: string;
      dedupeSeed: string;
      renderedText: string;
      payload: Record<string, unknown>;
      requestedByUserId: string;
      requestedByDeviceId: string;
      clientRequestId: string | null;
      copiesOverride?: number;
      requireRoute: boolean;
    },
  ): Promise<string[]> {
    const routes = await client.query<RouteTargetRow>(
      `
        SELECT pr.printer_id AS "printerId",pr.copies
        FROM printer_routes pr
        JOIN printers p ON p.id=pr.printer_id
          AND p.organization_id=pr.organization_id
          AND p.location_id=pr.location_id
        WHERE pr.organization_id=$1 AND pr.location_id=$2
          AND pr.route_key=$3 AND pr.active=TRUE AND p.status='ACTIVE'
        ORDER BY p.name,p.id
      `,
      [input.organizationId, input.locationId, input.routeKey],
    );
    if (routes.rows.length === 0 && input.requireRoute) {
      throw new ConflictException({
        code: 'PRINT_ROUTE_NOT_CONFIGURED',
        message: 'Nessuna stampante attiva configurata per questo documento.',
      });
    }
    const ids: string[] = [];
    for (const route of routes.rows) {
      const id = await this.insertJob(client, {
        organizationId: input.organizationId,
        locationId: input.locationId,
        printerId: route.printerId,
        documentType: input.documentType,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        dedupeKey: input.dedupeSeed,
        renderedText: input.renderedText,
        payload: input.payload,
        copies: input.copiesOverride ?? route.copies,
        requestedByUserId: input.requestedByUserId,
        requestedByDeviceId: input.requestedByDeviceId,
        clientRequestId: input.clientRequestId,
      });
      ids.push(id);
    }
    return ids;
  }

  private async insertJob(
    client: PoolClient,
    input: {
      organizationId: string;
      locationId: string;
      printerId: string;
      documentType: PrintDocumentType;
      sourceEntityType: string;
      sourceEntityId: string;
      dedupeKey: string;
      renderedText: string;
      payload: Record<string, unknown>;
      copies: number;
      requestedByUserId: string;
      requestedByDeviceId: string;
      clientRequestId: string | null;
    },
  ): Promise<string> {
    const id = randomUUID();
    const values = [
      id,
      input.organizationId,
      input.locationId,
      input.printerId,
      input.documentType,
      input.sourceEntityType,
      input.sourceEntityId,
      input.dedupeKey,
      JSON.stringify(input.payload),
      input.renderedText,
      input.copies,
      input.requestedByUserId,
      input.requestedByDeviceId,
      input.clientRequestId,
    ];
    const inserted = await client.query<InsertedJobRow>(
      `
        INSERT INTO print_jobs(
          id,organization_id,location_id,printer_id,document_type,
          source_entity_type,source_entity_id,dedupe_key,payload,rendered_text,
          copies,status,requested_by_user_id,requested_by_device_id,
          client_request_id
        ) VALUES($1,$2,$3,$4,$5::print_document_type,$6,$7,$8,$9::jsonb,$10,
          $11,'QUEUED',$12,$13,$14)
        ON CONFLICT(organization_id,printer_id,dedupe_key) DO NOTHING
        RETURNING id
      `,
      values,
    );
    const createdId = inserted.rows[0]?.id;
    if (createdId) {
      const eventPayload = {
        organizationId: input.organizationId,
        locationId: input.locationId,
        printerId: input.printerId,
        documentType: input.documentType,
      };
      await client.query(
        `INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload)
         VALUES($1,'print.job.queued','print_job',$2,$3::jsonb)`,
        [randomUUID(), createdId, JSON.stringify(eventPayload)],
      );
      await client.query(
        `INSERT INTO audit_events(
          id,organization_id,actor_user_id,action,entity_type,entity_id,payload
         ) VALUES($1,$2,$3,'print.job.queued','print_job',$4,$5::jsonb)`,
        [
          randomUUID(),
          input.organizationId,
          input.requestedByUserId,
          createdId,
          JSON.stringify(eventPayload),
        ],
      );
      return createdId;
    }
    const existing = await client.query<InsertedJobRow>(
      `SELECT id FROM print_jobs WHERE organization_id=$1 AND printer_id=$2
       AND dedupe_key=$3 LIMIT 1`,
      [input.organizationId, input.printerId, input.dedupeKey],
    );
    const existingId = existing.rows[0]?.id;
    if (!existingId) throw new Error('Idempotent print job lookup failed.');
    return existingId;
  }

  private async readJobs(auth: AuthContext, ids: string[]) {
    if (ids.length === 0) return { jobs: [] };
    const organizationId = assertOrganizationScope(auth);
    const result = await this.database.pool.query<
      {
        id: string;
        status: string;
        printerId: string;
        documentType: string;
      } & QueryResultRow
    >(
      `SELECT id,status,printer_id AS "printerId",
        document_type AS "documentType" FROM print_jobs
       WHERE organization_id=$1 AND id=ANY($2::uuid[]) ORDER BY created_at,id`,
      [organizationId, ids],
    );
    return { jobs: result.rows };
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
