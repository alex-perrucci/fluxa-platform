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
import type { CreateKitchenStationDto } from './dto/create-kitchen-station.dto';
import type { DispatchKitchenTicketDto } from './dto/dispatch-kitchen-ticket.dto';
import type { KitchenTicketListQueryDto } from './dto/kitchen-ticket-list-query.dto';
import type { KitchenTicketMutationDto } from './dto/kitchen-ticket-mutation.dto';
import type { UpdateKitchenStationDto } from './dto/update-kitchen-station.dto';
import { HospitalityAccessService } from './hospitality-access.service';
import { hospitalityRequestHash } from './hospitality-idempotency';
import {
  assertKitchenTicketTransition,
  formatKitchenTicketNumber,
  remainingKitchenQuantity,
  type KitchenTicketState,
} from './hospitality-policy';

interface StationRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  code: string;
  name: string;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
}
interface TicketRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  orderId: string;
  stationId: string;
  number: string;
  status: KitchenTicketState;
  version: number;
  tableCodeSnapshot: string | null;
  queuedAt: Date;
}
interface OrderRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  businessDate: string;
  number: string;
  status: string;
  serviceMode: string;
}
interface DispatchItemRow extends QueryResultRow {
  id: string;
  productName: string;
  variantName: string | null;
  categoryId: string;
  quantityAmount: number;
  quantityScale: number;
  note: string | null;
  stationId: string | null;
  stationName: string | null;
  sentQuantity: number;
}
interface MutationRow extends QueryResultRow {
  operation: string;
  requestHash: string;
  responseVersion: number;
}
interface SequenceRow extends QueryResultRow {
  lastValue: number;
}
interface CategoryLookupRow extends QueryResultRow {
  id: string;
}
interface TicketStationRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
}
interface TicketItemViewRow extends QueryResultRow {
  id: string;
  orderItemId: string;
  quantityAmount: number;
  quantityScale: number;
  productName: string;
  variantName: string | null;
  note: string | null;
}
interface BatchRow extends QueryResultRow {
  id: string;
  locationId: string;
  orderId: string;
  clientBatchId: string;
  createdAt: Date;
}

@Injectable()
export class KitchenService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: HospitalityAccessService,
  ) {}

  async listStations(auth: AuthContext, locationId: string) {
    const access = await this.access.assertLocation(auth, locationId);
    const r = await this.database.pool.query<StationRow>(
      `SELECT id,organization_id AS "organizationId",location_id AS "locationId",code,name,sort_order AS "sortOrder",status FROM kitchen_stations WHERE organization_id=$1 AND location_id=$2 ORDER BY sort_order,name`,
      [access.organizationId, locationId],
    );
    return r.rows;
  }
  async createStation(auth: AuthContext, dto: CreateKitchenStationDto) {
    const access = await this.access.assertLocation(auth, dto.locationId);
    try {
      const r = await this.database.pool.query<StationRow>(
        `INSERT INTO kitchen_stations(id,organization_id,location_id,code,name,sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,organization_id AS "organizationId",location_id AS "locationId",code,name,sort_order AS "sortOrder",status`,
        [
          randomUUID(),
          access.organizationId,
          dto.locationId,
          dto.code.trim().toUpperCase(),
          dto.name.trim(),
          dto.sortOrder ?? 0,
        ],
      );
      return r.rows[0];
    } catch (error) {
      this.rethrowUnique(
        error,
        'KITCHEN_STATION_CODE_EXISTS',
        'Il codice postazione è già usato nella sede.',
      );
    }
  }
  async updateStation(
    auth: AuthContext,
    id: string,
    dto: UpdateKitchenStationDto,
  ) {
    const org = assertOrganizationScope(auth);
    const current = await this.requireStation(org, id);
    await this.access.assertLocation(auth, current.locationId);
    const r = await this.database.pool.query<StationRow>(
      `UPDATE kitchen_stations SET code=COALESCE($3,code),name=COALESCE($4,name),sort_order=COALESCE($5,sort_order),status=COALESCE($6::hospitality_status,status),updated_at=NOW() WHERE id=$1 AND organization_id=$2 RETURNING id,organization_id AS "organizationId",location_id AS "locationId",code,name,sort_order AS "sortOrder",status`,
      [
        id,
        org,
        dto.code?.trim().toUpperCase() ?? null,
        dto.name?.trim() ?? null,
        dto.sortOrder ?? null,
        dto.status ?? null,
      ],
    );
    return r.rows[0];
  }
  async routeCategory(
    auth: AuthContext,
    stationId: string,
    categoryId: string,
  ) {
    const org = assertOrganizationScope(auth);
    const station = await this.requireStation(org, stationId);
    await this.access.assertLocation(auth, station.locationId);
    const category = await this.database.pool.query<CategoryLookupRow>(
      `SELECT id FROM categories WHERE id=$1 AND organization_id=$2 AND status='ACTIVE'`,
      [categoryId, org],
    );
    if (!category.rows[0])
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Categoria attiva non trovata.',
      });
    await this.database.pool.query(
      `INSERT INTO kitchen_station_categories(id,organization_id,location_id,station_id,category_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organization_id,location_id,category_id) DO UPDATE SET station_id=EXCLUDED.station_id,updated_at=NOW()`,
      [randomUUID(), org, station.locationId, stationId, categoryId],
    );
    return { stationId, categoryId };
  }
  async unrouteCategory(
    auth: AuthContext,
    stationId: string,
    categoryId: string,
  ) {
    const org = assertOrganizationScope(auth);
    const station = await this.requireStation(org, stationId);
    await this.access.assertLocation(auth, station.locationId);
    await this.database.pool.query(
      `DELETE FROM kitchen_station_categories WHERE organization_id=$1 AND station_id=$2 AND category_id=$3`,
      [org, stationId, categoryId],
    );
    return { success: true };
  }

  async listTickets(auth: AuthContext, query: KitchenTicketListQueryDto) {
    const access = await this.access.assertLocation(auth, query.locationId);
    const r = await this.database.pool.query<TicketRow>(
      `SELECT id,organization_id AS "organizationId",location_id AS "locationId",order_id AS "orderId",station_id AS "stationId",number,status,version,table_code_snapshot AS "tableCodeSnapshot",queued_at AS "queuedAt" FROM kitchen_tickets WHERE organization_id=$1 AND location_id=$2 AND ($3::uuid IS NULL OR station_id=$3) AND ($4::text IS NULL OR status::text=$4) ORDER BY queued_at,id`,
      [
        access.organizationId,
        query.locationId,
        query.stationId ?? null,
        query.status ?? null,
      ],
    );
    return r.rows;
  }
  async getTicket(auth: AuthContext, id: string) {
    const org = assertOrganizationScope(auth);
    const ticket = await this.requireTicket(org, id);
    await this.access.assertLocation(auth, ticket.locationId);
    const [station, items] = await Promise.all([
      this.database.pool.query<TicketStationRow>(
        `SELECT id,code,name FROM kitchen_stations WHERE id=$1`,
        [ticket.stationId],
      ),
      this.database.pool.query<TicketItemViewRow>(
        `SELECT id,order_item_id AS "orderItemId",quantity_amount AS "quantityAmount",quantity_scale AS "quantityScale",product_name_snapshot AS "productName",variant_name_snapshot AS "variantName",note_snapshot AS note FROM kitchen_ticket_items WHERE organization_id=$1 AND kitchen_ticket_id=$2 ORDER BY created_at,id`,
        [org, id],
      ),
    ]);
    return { ...ticket, station: station.rows[0] ?? null, items: items.rows };
  }

  async dispatch(
    auth: AuthContext,
    orderId: string,
    dto: DispatchKitchenTicketDto,
  ) {
    const org = assertOrganizationScope(auth);
    const requestHash = hospitalityRequestHash({ orderId });
    const existing = await this.database.pool.query<
      { id: string; requestHash: string } & QueryResultRow
    >(
      `SELECT id,request_hash AS "requestHash" FROM kitchen_ticket_batches WHERE organization_id=$1 AND device_id=$2 AND client_batch_id=$3`,
      [org, auth.deviceId, dto.clientBatchId],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].requestHash !== requestHash)
        throw new ConflictException({
          code: 'CLIENT_BATCH_ID_REUSED',
          message: 'Il clientBatchId è già stato usato con dati differenti.',
        });
      return this.batchResult(auth, existing.rows[0].id);
    }
    const batchId = await this.withTransaction(async (client) => {
      const orderResult = await client.query<OrderRow>(
        `SELECT id,organization_id AS "organizationId",location_id AS "locationId",business_date AS "businessDate",number,status,service_mode AS "serviceMode" FROM orders WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [orderId, org],
      );
      const order = orderResult.rows[0];
      if (!order)
        throw new NotFoundException({
          code: 'ORDER_NOT_FOUND',
          message: 'Ordine non trovato.',
        });
      await this.access.assertLocation(auth, order.locationId);
      if (!['OPEN', 'HELD'].includes(order.status))
        throw new ConflictException({
          code: 'ORDER_NOT_DISPATCHABLE',
          message: 'Lo stato dell’ordine non consente nuove comande.',
        });
      const itemResult = await client.query<DispatchItemRow>(
        `SELECT oi.id,oi.product_name_snapshot AS "productName",oi.variant_name_snapshot AS "variantName",oi.category_id_snapshot AS "categoryId",oi.quantity_amount AS "quantityAmount",oi.quantity_scale AS "quantityScale",oi.note,ksc.station_id AS "stationId",ks.name AS "stationName",COALESCE(SUM(CASE WHEN kt.status<>'CANCELLED' THEN kti.quantity_amount ELSE 0 END),0)::int AS "sentQuantity" FROM order_items oi LEFT JOIN kitchen_station_categories ksc ON ksc.organization_id=oi.organization_id AND ksc.location_id=$3 AND ksc.category_id=oi.category_id_snapshot LEFT JOIN kitchen_stations ks ON ks.id=ksc.station_id AND ks.status='ACTIVE' LEFT JOIN kitchen_ticket_items kti ON kti.order_item_id=oi.id LEFT JOIN kitchen_tickets kt ON kt.id=kti.kitchen_ticket_id WHERE oi.organization_id=$2 AND oi.order_id=$1 GROUP BY oi.id,ksc.station_id,ks.name ORDER BY oi.sort_order,oi.created_at`,
        [orderId, org, order.locationId],
      );
      const pending = itemResult.rows
        .map((item) => ({
          ...item,
          remaining: remainingKitchenQuantity(
            item.quantityAmount,
            item.sentQuantity,
          ),
        }))
        .filter((item) => item.remaining > 0);
      if (pending.length === 0)
        throw new ConflictException({
          code: 'KITCHEN_NOTHING_TO_SEND',
          message: 'Non ci sono nuove quantità da inviare in cucina.',
        });
      const unrouted = pending.filter((item) => !item.stationId);
      if (unrouted.length > 0)
        throw new ConflictException({
          code: 'KITCHEN_CATEGORY_NOT_ROUTED',
          message:
            'Una o più categorie non sono assegnate a una postazione cucina.',
          orderItemIds: unrouted.map((item) => item.id),
        });
      const table = await client.query<
        { sessionId: string; tableCode: string } & QueryResultRow
      >(
        `SELECT ts.id AS "sessionId",dt.code AS "tableCode" FROM table_session_orders tso JOIN table_sessions ts ON ts.id=tso.table_session_id AND ts.status='OPEN' JOIN dining_tables dt ON dt.id=ts.table_id WHERE tso.order_id=$1 LIMIT 1`,
        [orderId],
      );
      const createdBatch = randomUUID();
      await client.query(
        `INSERT INTO kitchen_ticket_batches(id,organization_id,location_id,order_id,device_id,created_by_user_id,client_batch_id,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          createdBatch,
          org,
          order.locationId,
          orderId,
          auth.deviceId,
          auth.userId,
          dto.clientBatchId,
          requestHash,
        ],
      );
      const groups = new Map<string, typeof pending>();
      for (const item of pending) {
        const key = item.stationId!;
        const group = groups.get(key) ?? [];
        group.push(item);
        groups.set(key, group);
      }
      for (const [stationId, items] of groups) {
        const seq = await client.query<SequenceRow>(
          `INSERT INTO kitchen_ticket_sequences(id,organization_id,location_id,business_date,last_value,updated_at) VALUES($1,$2,$3,$4,1,NOW()) ON CONFLICT(organization_id,location_id,business_date) DO UPDATE SET last_value=kitchen_ticket_sequences.last_value+1,updated_at=NOW() RETURNING last_value AS "lastValue"`,
          [randomUUID(), org, order.locationId, order.businessDate],
        );
        const sequence = seq.rows[0]?.lastValue;
        if (!sequence)
          throw new Error('Kitchen ticket sequence allocation failed.');
        const number = formatKitchenTicketNumber(order.businessDate, sequence);
        const ticketId = randomUUID();
        await client.query(
          `INSERT INTO kitchen_tickets(id,organization_id,location_id,order_id,batch_id,station_id,number,status,version,table_session_id,table_code_snapshot,queued_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,'QUEUED',1,$8,$9,$10)`,
          [
            ticketId,
            org,
            order.locationId,
            orderId,
            createdBatch,
            stationId,
            number,
            table.rows[0]?.sessionId ?? null,
            table.rows[0]?.tableCode ?? null,
            auth.userId,
          ],
        );
        for (const item of items) {
          await client.query(
            `INSERT INTO kitchen_ticket_items(id,organization_id,kitchen_ticket_id,order_item_id,quantity_amount,quantity_scale,product_name_snapshot,variant_name_snapshot,note_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              randomUUID(),
              org,
              ticketId,
              item.id,
              item.remaining,
              item.quantityScale,
              item.productName,
              item.variantName,
              item.note,
            ],
          );
        }
        await this.outbox(client, 'kitchen.ticket.queued', ticketId, {
          orderId,
          stationId,
          number,
        });
      }
      await this.audit(
        client,
        org,
        auth.userId,
        'kitchen.batch.dispatched',
        'order',
        orderId,
        { batchId: createdBatch, ticketCount: groups.size },
      );
      return createdBatch;
    });
    return this.batchResult(auth, batchId);
  }

  async transition(
    auth: AuthContext,
    ticketId: string,
    dto: KitchenTicketMutationDto,
    next: KitchenTicketState,
  ) {
    const org = assertOrganizationScope(auth);
    await this.withTransaction(async (client) => {
      const r = await client.query<TicketRow>(
        `SELECT id,organization_id AS "organizationId",location_id AS "locationId",order_id AS "orderId",station_id AS "stationId",number,status,version,table_code_snapshot AS "tableCodeSnapshot",queued_at AS "queuedAt" FROM kitchen_tickets WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [ticketId, org],
      );
      const ticket = r.rows[0];
      if (!ticket)
        throw new NotFoundException({
          code: 'KITCHEN_TICKET_NOT_FOUND',
          message: 'Comanda non trovata.',
        });
      await this.access.assertLocation(auth, ticket.locationId);
      const hash = hospitalityRequestHash({ ticketId, next });
      const prev = await client.query<MutationRow>(
        `SELECT operation,request_hash AS "requestHash",response_version AS "responseVersion" FROM kitchen_mutations WHERE organization_id=$1 AND device_id=$2 AND mutation_id=$3`,
        [org, auth.deviceId, dto.mutationId],
      );
      const operation = `kitchen.ticket.${next.toLowerCase()}`;
      if (prev.rows[0]) {
        if (
          prev.rows[0].operation !== operation ||
          prev.rows[0].requestHash !== hash
        )
          throw new ConflictException({
            code: 'MUTATION_ID_REUSED',
            message: 'Il mutationId è già stato usato con dati differenti.',
          });
        return;
      }
      if (ticket.version !== dto.expectedVersion)
        throw new ConflictException({
          code: 'KITCHEN_TICKET_VERSION_CONFLICT',
          message: 'La comanda è stata modificata da un altro dispositivo.',
          currentVersion: ticket.version,
        });
      assertKitchenTicketTransition(ticket.status, next);
      const timestamp = {
        QUEUED: 'queued_at',
        IN_PROGRESS: 'started_at',
        READY: 'ready_at',
        SERVED: 'served_at',
        CANCELLED: 'cancelled_at',
      }[next];
      await client.query(
        `UPDATE kitchen_tickets SET status=$2::kitchen_ticket_status,version=version+1,${timestamp}=NOW(),updated_at=NOW() WHERE id=$1`,
        [ticketId, next],
      );
      await client.query(
        `INSERT INTO kitchen_mutations(id,organization_id,device_id,mutation_id,kitchen_ticket_id,operation,request_hash,response_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          randomUUID(),
          org,
          auth.deviceId,
          dto.mutationId,
          ticketId,
          operation,
          hash,
          ticket.version + 1,
        ],
      );
      await this.audit(
        client,
        org,
        auth.userId,
        operation,
        'kitchen_ticket',
        ticketId,
        { from: ticket.status, to: next },
      );
      await this.outbox(client, operation, ticketId, {
        orderId: ticket.orderId,
        status: next,
      });
    });
    return this.getTicket(auth, ticketId);
  }

  private async batchResult(auth: AuthContext, batchId: string) {
    const org = assertOrganizationScope(auth);
    const batch = await this.database.pool.query<BatchRow>(
      `SELECT id,location_id AS "locationId",order_id AS "orderId",client_batch_id AS "clientBatchId",created_at AS "createdAt" FROM kitchen_ticket_batches WHERE id=$1 AND organization_id=$2`,
      [batchId, org],
    );
    if (!batch.rows[0])
      throw new NotFoundException({
        code: 'KITCHEN_BATCH_NOT_FOUND',
        message: 'Invio cucina non trovato.',
      });
    await this.access.assertLocation(auth, batch.rows[0].locationId);
    const tickets = await this.database.pool.query<TicketRow>(
      `SELECT id,organization_id AS "organizationId",location_id AS "locationId",order_id AS "orderId",station_id AS "stationId",number,status,version,table_code_snapshot AS "tableCodeSnapshot",queued_at AS "queuedAt" FROM kitchen_tickets WHERE batch_id=$1 ORDER BY number`,
      [batchId],
    );
    return { ...batch.rows[0], tickets: tickets.rows };
  }
  private async requireStation(org: string, id: string) {
    const r = await this.database.pool.query<StationRow>(
      `SELECT id,organization_id AS "organizationId",location_id AS "locationId",code,name,sort_order AS "sortOrder",status FROM kitchen_stations WHERE id=$1 AND organization_id=$2`,
      [id, org],
    );
    if (!r.rows[0])
      throw new NotFoundException({
        code: 'KITCHEN_STATION_NOT_FOUND',
        message: 'Postazione cucina non trovata.',
      });
    return r.rows[0];
  }
  private async requireTicket(org: string, id: string) {
    const r = await this.database.pool.query<TicketRow>(
      `SELECT id,organization_id AS "organizationId",location_id AS "locationId",order_id AS "orderId",station_id AS "stationId",number,status,version,table_code_snapshot AS "tableCodeSnapshot",queued_at AS "queuedAt" FROM kitchen_tickets WHERE id=$1 AND organization_id=$2`,
      [id, org],
    );
    if (!r.rows[0])
      throw new NotFoundException({
        code: 'KITCHEN_TICKET_NOT_FOUND',
        message: 'Comanda non trovata.',
      });
    return r.rows[0];
  }
  private async audit(
    client: PoolClient,
    org: string,
    user: string,
    action: string,
    type: string,
    id: string,
    payload: unknown,
  ) {
    await client.query(
      `INSERT INTO audit_events(id,organization_id,actor_user_id,action,entity_type,entity_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [randomUUID(), org, user, action, type, id, JSON.stringify(payload)],
    );
  }
  private async outbox(
    client: PoolClient,
    topic: string,
    id: string,
    payload: unknown,
  ) {
    await client.query(
      `INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload) VALUES($1,$2,'kitchen_ticket',$3,$4::jsonb)`,
      [randomUUID(), topic, id, JSON.stringify(payload)],
    );
  }
  private async withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
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
  private rethrowUnique(error: unknown, code: string, message: string): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    )
      throw new ConflictException({ code, message });
    throw error;
  }
}
