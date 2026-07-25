import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { RequestPrintDto } from './dto/request-print.dto';
import { assertPrinterSupportsDocument } from './print-policy';
import { renderPaymentReceipt } from './print-renderer';
import { PrintingAccessService } from './printing-access.service';

interface CheckoutHeaderRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  orderNumber: string;
  currency: string;
  totalCents: number;
  paidCents: number;
  changeCents: number;
}

interface PaymentRow extends QueryResultRow {
  method: string;
  amountCents: number;
  status: string;
}

interface PrinterOptionRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  purpose: 'RECEIPT' | 'GENERIC';
}

interface InsertedJobRow extends QueryResultRow {
  id: string;
}

@Injectable()
export class PaymentReceiptPrinterService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: PrintingAccessService,
  ) {}

  async listOptions(auth: AuthContext, checkoutId: string) {
    const organizationId = assertOrganizationScope(auth);
    const header = await this.checkoutHeader(organizationId, checkoutId);
    await this.access.assertLocation(auth, header.locationId);

    const [printers, route] = await Promise.all([
      this.database.pool.query<PrinterOptionRow>(
        `
          SELECT id,code,name,purpose
          FROM printers
          WHERE organization_id=$1 AND location_id=$2
            AND status='ACTIVE' AND purpose IN ('RECEIPT','GENERIC')
            AND agent_device_id=$3
          ORDER BY name,id
        `,
        [organizationId, header.locationId, auth.deviceId],
      ),
      this.database.pool.query<{ configured: boolean } & QueryResultRow>(
        `
          SELECT EXISTS(
            SELECT 1
            FROM printer_routes pr
            JOIN printers p ON p.id=pr.printer_id
              AND p.organization_id=pr.organization_id
              AND p.location_id=pr.location_id
            WHERE pr.organization_id=$1 AND pr.location_id=$2
              AND pr.route_key='PAYMENT_RECEIPT:DEFAULT'
              AND pr.active=TRUE AND p.status='ACTIVE'
          ) AS configured
        `,
        [organizationId, header.locationId],
      ),
    ]);

    return {
      checkoutId,
      locationId: header.locationId,
      defaultRouteConfigured: route.rows[0]?.configured === true,
      printers: printers.rows,
    };
  }

  async requestExplicit(
    auth: AuthContext,
    checkoutId: string,
    dto: RequestPrintDto,
  ) {
    const printerId = dto.printerId;
    if (!printerId) {
      throw new ConflictException({
        code: 'PRINTER_SELECTION_REQUIRED',
        message: 'Seleziona una stampante per il riepilogo pagamento.',
      });
    }

    const organizationId = assertOrganizationScope(auth);
    const header = await this.checkoutHeader(organizationId, checkoutId);
    await this.access.assertLocation(auth, header.locationId);

    const printer = await this.access.printer(organizationId, printerId);
    if (printer.locationId !== header.locationId) {
      throw new ConflictException({
        code: 'PRINTER_LOCATION_MISMATCH',
        message: 'La stampante selezionata appartiene a una sede diversa.',
      });
    }
    if (printer.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'PRINTER_NOT_ACTIVE',
        message: 'La stampante selezionata non è attiva.',
      });
    }
    if (printer.agentDeviceId !== auth.deviceId) {
      throw new ForbiddenException({
        code: 'PRINTER_AGENT_DEVICE_MISMATCH',
        message: 'La stampante selezionata non è assegnata a questo POS.',
      });
    }
    assertPrinterSupportsDocument(printer.purpose, 'PAYMENT_RECEIPT');

    const payments = await this.database.pool.query<PaymentRow>(
      `SELECT method,amount_cents AS "amountCents",status
       FROM payment_transactions WHERE organization_id=$1
         AND checkout_session_id=$2 ORDER BY created_at,id`,
      [organizationId, checkoutId],
    );
    const renderedText = renderPaymentReceipt({
      orderNumber: header.orderNumber,
      checkoutId,
      currency: header.currency,
      totalCents: header.totalCents,
      paidCents: header.paidCents,
      changeCents: header.changeCents,
      payments: payments.rows,
    });

    const jobId = await this.withTransaction((client) =>
      this.insertJob(client, {
        organizationId,
        locationId: header.locationId,
        printerId,
        checkoutId,
        clientRequestId: dto.clientRequestId,
        renderedText,
        copies: dto.copies ?? 1,
        requestedByUserId: auth.userId,
        requestedByDeviceId: auth.deviceId,
        payload: { checkout: header, payments: payments.rows },
      }),
    );

    return {
      jobs: [
        {
          id: jobId,
          status: 'QUEUED',
          printerId,
          documentType: 'PAYMENT_RECEIPT',
        },
      ],
    };
  }

  private async checkoutHeader(
    organizationId: string,
    checkoutId: string,
  ): Promise<CheckoutHeaderRow> {
    const result = await this.database.pool.query<CheckoutHeaderRow>(
      `
        SELECT cs.id,cs.organization_id AS "organizationId",
          cs.location_id AS "locationId",o.number AS "orderNumber",
          cs.currency,cs.order_total_cents AS "totalCents",
          cs.paid_cents AS "paidCents",cs.change_cents AS "changeCents"
        FROM checkout_sessions cs
        JOIN orders o ON o.id=cs.order_id
        WHERE cs.id=$1 AND cs.organization_id=$2 LIMIT 1
      `,
      [checkoutId, organizationId],
    );
    const header = result.rows[0];
    if (!header) {
      throw new NotFoundException({
        code: 'CHECKOUT_NOT_FOUND',
        message: 'Checkout non trovato.',
      });
    }
    return header;
  }

  private async insertJob(
    client: PoolClient,
    input: {
      organizationId: string;
      locationId: string;
      printerId: string;
      checkoutId: string;
      clientRequestId: string;
      renderedText: string;
      copies: number;
      requestedByUserId: string;
      requestedByDeviceId: string;
      payload: Record<string, unknown>;
    },
  ): Promise<string> {
    const dedupeKey = `PAYMENT_RECEIPT:${input.checkoutId}:${input.clientRequestId}`;
    const inserted = await client.query<InsertedJobRow>(
      `
        INSERT INTO print_jobs(
          id,organization_id,location_id,printer_id,document_type,
          source_entity_type,source_entity_id,dedupe_key,payload,rendered_text,
          copies,status,requested_by_user_id,requested_by_device_id,
          client_request_id
        ) VALUES($1,$2,$3,$4,'PAYMENT_RECEIPT',$5,$6,$7,$8::jsonb,$9,
          $10,'QUEUED',$11,$12,$13)
        ON CONFLICT(organization_id,printer_id,dedupe_key) DO NOTHING
        RETURNING id
      `,
      [
        randomUUID(),
        input.organizationId,
        input.locationId,
        input.printerId,
        'checkout',
        input.checkoutId,
        dedupeKey,
        JSON.stringify(input.payload),
        input.renderedText,
        input.copies,
        input.requestedByUserId,
        input.requestedByDeviceId,
        input.clientRequestId,
      ],
    );

    let jobId = inserted.rows[0]?.id;
    if (!jobId) {
      const existing = await client.query<InsertedJobRow>(
        `SELECT id FROM print_jobs WHERE organization_id=$1 AND printer_id=$2
         AND dedupe_key=$3 LIMIT 1`,
        [input.organizationId, input.printerId, dedupeKey],
      );
      jobId = existing.rows[0]?.id;
    }
    if (!jobId) {
      throw new Error('Idempotent payment receipt job lookup failed.');
    }

    if (inserted.rows[0]?.id) {
      const eventPayload = {
        organizationId: input.organizationId,
        locationId: input.locationId,
        printerId: input.printerId,
        documentType: 'PAYMENT_RECEIPT',
      };
      await client.query(
        `INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload)
         VALUES($1,'print.job.queued','print_job',$2,$3::jsonb)`,
        [randomUUID(), jobId, JSON.stringify(eventPayload)],
      );
      await client.query(
        `INSERT INTO audit_events(
          id,organization_id,actor_user_id,action,entity_type,entity_id,payload
         ) VALUES($1,$2,$3,'print.job.queued','print_job',$4,$5::jsonb)`,
        [
          randomUUID(),
          input.organizationId,
          input.requestedByUserId,
          jobId,
          JSON.stringify(eventPayload),
        ],
      );
    }

    return jobId;
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
