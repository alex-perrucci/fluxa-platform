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
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { AttachOrderDto } from './dto/attach-order.dto';
import type { CloseTableSessionDto } from './dto/close-table-session.dto';
import type { CreateDiningAreaDto } from './dto/create-dining-area.dto';
import type { CreateDiningTableDto } from './dto/create-dining-table.dto';
import type { MoveTableSessionDto } from './dto/move-table-session.dto';
import type { OpenTableSessionDto } from './dto/open-table-session.dto';
import type { TableSessionListQueryDto } from './dto/table-session-list-query.dto';
import type { UpdateDiningAreaDto } from './dto/update-dining-area.dto';
import type { UpdateDiningTableDto } from './dto/update-dining-table.dto';
import type { UpdateTableSessionDto } from './dto/update-table-session.dto';
import { HospitalityAccessService } from './hospitality-access.service';
import { hospitalityRequestHash } from './hospitality-idempotency';
import {
  assertTableSessionTransition,
  buildActiveTableKey,
} from './hospitality-policy';

interface AreaRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  code: string;
  name: string;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
}
interface TableRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  areaId: string;
  code: string;
  name: string;
  capacity: number;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
}
interface SessionRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  tableId: string;
  deviceId: string;
  clientSessionId: string;
  requestHash: string;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  guestCount: number;
  note: string | null;
  version: number;
  openedAt: Date;
  closedAt: Date | null;
  cancelledAt: Date | null;
}
interface MutationRow extends QueryResultRow {
  operation: string;
  requestHash: string;
  responseVersion: number;
}
interface CountRow extends QueryResultRow {
  count: number;
}
interface TableListRow extends QueryResultRow {
  id: string;
  areaId: string;
  code: string;
  name: string;
  capacity: number;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  areaCode: string;
  areaName: string;
}
interface SessionTableRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  capacity: number;
  areaId: string;
  areaCode: string;
  areaName: string;
}
interface AttachedOrderRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  deviceId: string;
  createdByUserId: string;
  clientOrderId: string;
  number: string;
  businessDate: string;
  status: 'OPEN' | 'HELD' | 'AWAITING_PAYMENT' | 'PAID' | 'CANCELLED';
  serviceMode: 'COUNTER' | 'TAKEAWAY' | 'DELIVERY' | 'TABLE';
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
  cancelledByUserId: string | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class HospitalityService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: HospitalityAccessService,
  ) {}

  async listAreas(auth: AuthContext, locationId: string) {
    const access = await this.access.assertLocation(auth, locationId);
    const result = await this.database.pool.query<AreaRow>(
      `SELECT id, organization_id AS "organizationId", location_id AS "locationId", code, name,
        sort_order AS "sortOrder", status, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM dining_areas WHERE organization_id=$1 AND location_id=$2 ORDER BY sort_order, name`,
      [access.organizationId, locationId],
    );
    return result.rows;
  }

  async createArea(
    auth: AuthContext,
    locationId: string,
    dto: CreateDiningAreaDto,
  ) {
    const access = await this.access.assertLocation(auth, locationId);
    try {
      const result = await this.database.pool.query<AreaRow>(
        `INSERT INTO dining_areas (id,organization_id,location_id,code,name,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, organization_id AS "organizationId", location_id AS "locationId", code, name,
           sort_order AS "sortOrder", status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          randomUUID(),
          access.organizationId,
          locationId,
          dto.code.trim().toUpperCase(),
          dto.name.trim(),
          dto.sortOrder ?? 0,
        ],
      );
      const area = result.rows[0];
      if (!area) throw new Error('Dining area insert returned no row.');
      await this.simpleAudit(
        access.organizationId,
        auth.userId,
        'dining_area.created',
        'dining_area',
        area.id,
        { locationId },
      );
      return area;
    } catch (error) {
      this.rethrowUnique(
        error,
        'DINING_AREA_CODE_EXISTS',
        'Il codice sala è già usato in questa sede.',
      );
    }
  }

  async updateArea(
    auth: AuthContext,
    areaId: string,
    dto: UpdateDiningAreaDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireArea(organizationId, areaId);
    await this.access.assertLocation(auth, current.locationId);
    const result = await this.database.pool.query<AreaRow>(
      `UPDATE dining_areas SET code=COALESCE($3,code), name=COALESCE($4,name), sort_order=COALESCE($5,sort_order),
       status=COALESCE($6::hospitality_status,status), updated_at=NOW()
       WHERE id=$1 AND organization_id=$2 RETURNING id, organization_id AS "organizationId", location_id AS "locationId", code,name,sort_order AS "sortOrder",status,created_at AS "createdAt",updated_at AS "updatedAt"`,
      [
        areaId,
        organizationId,
        dto.code?.trim().toUpperCase() ?? null,
        dto.name?.trim() ?? null,
        dto.sortOrder ?? null,
        dto.status ?? null,
      ],
    );
    return result.rows[0];
  }

  async listTables(auth: AuthContext, locationId: string) {
    const access = await this.access.assertLocation(auth, locationId);
    const result = await this.database.pool.query<TableListRow>(
      `SELECT t.id,t.area_id AS "areaId",t.code,t.name,t.capacity,t.sort_order AS "sortOrder",t.status,
        a.code AS "areaCode",a.name AS "areaName"
       FROM dining_tables t JOIN dining_areas a ON a.id=t.area_id
       WHERE t.organization_id=$1 AND t.location_id=$2 ORDER BY a.sort_order,t.sort_order,t.name`,
      [access.organizationId, locationId],
    );
    return result.rows;
  }

  async createTable(auth: AuthContext, dto: CreateDiningTableDto) {
    const access = await this.access.assertLocation(auth, dto.locationId);
    await this.requireAreaAtLocation(
      access.organizationId,
      dto.areaId,
      dto.locationId,
    );
    try {
      const result = await this.database.pool.query<TableRow>(
        `INSERT INTO dining_tables (id,organization_id,location_id,area_id,code,name,capacity,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,organization_id AS "organizationId",location_id AS "locationId",area_id AS "areaId",code,name,capacity,sort_order AS "sortOrder",status`,
        [
          randomUUID(),
          access.organizationId,
          dto.locationId,
          dto.areaId,
          dto.code.trim().toUpperCase(),
          dto.name.trim(),
          dto.capacity,
          dto.sortOrder ?? 0,
        ],
      );
      return result.rows[0];
    } catch (error) {
      this.rethrowUnique(
        error,
        'DINING_TABLE_CODE_EXISTS',
        'Il codice tavolo è già usato in questa sede.',
      );
    }
  }

  async updateTable(
    auth: AuthContext,
    tableId: string,
    dto: UpdateDiningTableDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireTable(organizationId, tableId);
    await this.access.assertLocation(auth, current.locationId);
    if (dto.areaId)
      await this.requireAreaAtLocation(
        organizationId,
        dto.areaId,
        current.locationId,
      );
    if (dto.status === 'INACTIVE') {
      const active = await this.database.pool.query<CountRow>(
        `SELECT COUNT(*)::int AS count FROM table_sessions WHERE organization_id=$1 AND table_id=$2 AND status='OPEN'`,
        [organizationId, tableId],
      );
      if ((active.rows[0]?.count ?? 0) > 0)
        throw new ConflictException({
          code: 'TABLE_HAS_OPEN_SESSION',
          message: 'Non puoi disattivare un tavolo occupato.',
        });
    }
    const result = await this.database.pool.query<TableRow>(
      `UPDATE dining_tables SET area_id=COALESCE($3,area_id),code=COALESCE($4,code),name=COALESCE($5,name),capacity=COALESCE($6,capacity),sort_order=COALESCE($7,sort_order),status=COALESCE($8::hospitality_status,status),updated_at=NOW()
       WHERE id=$1 AND organization_id=$2 RETURNING id,organization_id AS "organizationId",location_id AS "locationId",area_id AS "areaId",code,name,capacity,sort_order AS "sortOrder",status`,
      [
        tableId,
        organizationId,
        dto.areaId ?? null,
        dto.code?.trim().toUpperCase() ?? null,
        dto.name?.trim() ?? null,
        dto.capacity ?? null,
        dto.sortOrder ?? null,
        dto.status ?? null,
      ],
    );
    return result.rows[0];
  }

  async floor(auth: AuthContext, locationId: string) {
    const access = await this.access.assertLocation(auth, locationId);
    const result = await this.database.pool.query(
      `SELECT a.id AS "areaId",a.code AS "areaCode",a.name AS "areaName",a.sort_order AS "areaSortOrder",
        t.id AS "tableId",t.code AS "tableCode",t.name AS "tableName",t.capacity,t.sort_order AS "tableSortOrder",t.status AS "tableStatus",
        s.id AS "sessionId",s.guest_count AS "guestCount",s.opened_at AS "openedAt",s.version AS "sessionVersion",
        COALESCE(SUM(CASE WHEN o.status NOT IN ('CANCELLED') THEN o.total_cents ELSE 0 END),0)::int AS "openTotalCents",
        COUNT(DISTINCT tso.order_id)::int AS "orderCount"
       FROM dining_areas a JOIN dining_tables t ON t.area_id=a.id
       LEFT JOIN table_sessions s ON s.table_id=t.id AND s.status='OPEN'
       LEFT JOIN table_session_orders tso ON tso.table_session_id=s.id
       LEFT JOIN orders o ON o.id=tso.order_id
       WHERE a.organization_id=$1 AND a.location_id=$2 AND a.status='ACTIVE' AND t.status='ACTIVE'
       GROUP BY a.id,t.id,s.id ORDER BY a.sort_order,t.sort_order,t.name`,
      [access.organizationId, locationId],
    );
    const areas = new Map<
      string,
      {
        id: string;
        code: string;
        name: string;
        sortOrder: number;
        tables: unknown[];
      }
    >();
    for (const row of result.rows as Array<Record<string, unknown>>) {
      const areaId = String(row.areaId);
      const area = areas.get(areaId) ?? {
        id: areaId,
        code: String(row.areaCode),
        name: String(row.areaName),
        sortOrder: Number(row.areaSortOrder),
        tables: [],
      };
      area.tables.push({
        id: row.tableId,
        code: row.tableCode,
        name: row.tableName,
        capacity: row.capacity,
        sortOrder: row.tableSortOrder,
        occupied: Boolean(row.sessionId),
        session: row.sessionId
          ? {
              id: row.sessionId,
              guestCount: row.guestCount,
              openedAt: row.openedAt,
              version: row.sessionVersion,
              openTotalCents: row.openTotalCents,
              orderCount: row.orderCount,
            }
          : null,
      });
      areas.set(areaId, area);
    }
    return { locationId, areas: Array.from(areas.values()) };
  }

  async listSessions(auth: AuthContext, query: TableSessionListQueryDto) {
    const access = await this.access.assertLocation(auth, query.locationId);
    const result = await this.database.pool.query<SessionRow>(
      `SELECT id,organization_id AS "organizationId",location_id AS "locationId",table_id AS "tableId",device_id AS "deviceId",client_session_id AS "clientSessionId",request_hash AS "requestHash",status,guest_count AS "guestCount",note,version,opened_at AS "openedAt",closed_at AS "closedAt",cancelled_at AS "cancelledAt"
       FROM table_sessions WHERE organization_id=$1 AND location_id=$2 AND ($3::text IS NULL OR status::text=$3) ORDER BY opened_at DESC`,
      [access.organizationId, query.locationId, query.status ?? null],
    );
    return result.rows;
  }

  async getSession(auth: AuthContext, sessionId: string) {
    const organizationId = assertOrganizationScope(auth);
    const session = await this.requireSession(organizationId, sessionId);
    await this.access.assertLocation(auth, session.locationId);
    const [table, orders] = await Promise.all([
      this.database.pool.query<SessionTableRow>(
        `SELECT t.id,t.code,t.name,t.capacity,a.id AS "areaId",a.code AS "areaCode",a.name AS "areaName" FROM dining_tables t JOIN dining_areas a ON a.id=t.area_id WHERE t.id=$1`,
        [session.tableId],
      ),
      this.database.pool.query<AttachedOrderRow>(
        `SELECT
          o.id,
          o.organization_id AS "organizationId",
          o.location_id AS "locationId",
          o.device_id AS "deviceId",
          o.created_by_user_id AS "createdByUserId",
          o.client_order_id AS "clientOrderId",
          o.number,
          o.business_date AS "businessDate",
          o.status,
          o.service_mode AS "serviceMode",
          o.customer_note AS "customerNote",
          o.currency,
          o.version,
          o.subtotal_cents AS "subtotalCents",
          o.discount_cents AS "discountCents",
          o.total_cents AS "totalCents",
          o.net_total_cents AS "netTotalCents",
          o.tax_total_cents AS "taxTotalCents",
          o.held_at AS "heldAt",
          o.cancelled_at AS "cancelledAt",
          o.cancelled_by_user_id AS "cancelledByUserId",
          o.cancel_reason AS "cancelReason",
          o.created_at AS "createdAt",
          o.updated_at AS "updatedAt"
         FROM table_session_orders tso
         JOIN orders o ON o.id=tso.order_id
         WHERE tso.organization_id=$1 AND tso.table_session_id=$2
         ORDER BY tso.attached_at`,
        [organizationId, sessionId],
      ),
    ]);
    return { ...session, table: table.rows[0] ?? null, orders: orders.rows };
  }

  async openSession(auth: AuthContext, dto: OpenTableSessionDto) {
    const organizationId = assertOrganizationScope(auth);
    const table = await this.requireTable(organizationId, dto.tableId);
    await this.access.assertLocation(auth, table.locationId);
    if (table.status !== 'ACTIVE')
      throw new NotFoundException({
        code: 'DINING_TABLE_NOT_FOUND',
        message: 'Tavolo attivo non trovato.',
      });
    const requestHash = hospitalityRequestHash({
      tableId: dto.tableId,
      guestCount: dto.guestCount,
      note: dto.note?.trim() || null,
    });
    const duplicate = await this.database.pool.query<SessionRow>(
      `SELECT id,organization_id AS "organizationId",location_id AS "locationId",table_id AS "tableId",device_id AS "deviceId",client_session_id AS "clientSessionId",request_hash AS "requestHash",status,guest_count AS "guestCount",note,version,opened_at AS "openedAt",closed_at AS "closedAt",cancelled_at AS "cancelledAt" FROM table_sessions WHERE organization_id=$1 AND device_id=$2 AND client_session_id=$3 LIMIT 1`,
      [organizationId, auth.deviceId, dto.clientSessionId],
    );
    if (duplicate.rows[0]) {
      if (duplicate.rows[0].requestHash !== requestHash)
        throw new ConflictException({
          code: 'CLIENT_SESSION_ID_REUSED',
          message: 'Il clientSessionId è già stato usato con dati differenti.',
        });
      return this.getSession(auth, duplicate.rows[0].id);
    }
    try {
      const id = await this.withTransaction(async (client) => {
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
          [buildActiveTableKey(organizationId, dto.tableId)],
        );
        const createdId = randomUUID();
        await client.query(
          `INSERT INTO table_sessions (id,organization_id,location_id,table_id,device_id,opened_by_user_id,client_session_id,request_hash,status,guest_count,note,active_table_key,version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'OPEN',$9,$10,$11,1)`,
          [
            createdId,
            organizationId,
            table.locationId,
            dto.tableId,
            auth.deviceId,
            auth.userId,
            dto.clientSessionId,
            requestHash,
            dto.guestCount,
            dto.note?.trim() || null,
            buildActiveTableKey(organizationId, dto.tableId),
          ],
        );
        await this.audit(
          client,
          organizationId,
          auth.userId,
          'table_session.opened',
          'table_session',
          createdId,
          { tableId: dto.tableId, guestCount: dto.guestCount },
        );
        return createdId;
      });
      return this.getSession(auth, id);
    } catch (error) {
      this.rethrowUnique(
        error,
        'TABLE_ALREADY_OCCUPIED',
        'Il tavolo ha già una sessione aperta.',
      );
    }
  }

  async updateSession(
    auth: AuthContext,
    sessionId: string,
    dto: UpdateTableSessionDto,
  ) {
    if (dto.guestCount === undefined && dto.note === undefined)
      throw new BadRequestException({
        code: 'TABLE_SESSION_UPDATE_EMPTY',
        message: 'Indica almeno coperti o nota.',
      });
    return this.mutateSession(
      auth,
      sessionId,
      'table_session.update',
      dto.mutationId,
      dto.expectedVersion,
      { guestCount: dto.guestCount, note: dto.note },
      async (client, session) => {
        await client.query(
          `UPDATE table_sessions SET guest_count=COALESCE($2,guest_count),note=CASE WHEN $3::boolean THEN $4 ELSE note END,version=version+1,updated_at=NOW() WHERE id=$1`,
          [
            sessionId,
            dto.guestCount ?? null,
            dto.note !== undefined,
            dto.note?.trim() || null,
          ],
        );
        return session.version + 1;
      },
    );
  }

  async attachOrder(auth: AuthContext, sessionId: string, dto: AttachOrderDto) {
    return this.mutateSession(
      auth,
      sessionId,
      'table_session.order.attach',
      dto.mutationId,
      dto.expectedVersion,
      { orderId: dto.orderId },
      async (client, session) => {
        const order = await client.query<
          {
            id: string;
            organizationId: string;
            locationId: string;
            serviceMode: string;
            status: string;
          } & QueryResultRow
        >(
          `SELECT id,organization_id AS "organizationId",location_id AS "locationId",service_mode AS "serviceMode",status FROM orders WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
          [dto.orderId, session.organizationId],
        );
        const row = order.rows[0];
        if (!row || row.locationId !== session.locationId)
          throw new NotFoundException({
            code: 'ORDER_NOT_FOUND',
            message: 'Ordine non trovato nella sede corrente.',
          });
        if (row.serviceMode !== 'TABLE')
          throw new ConflictException({
            code: 'ORDER_NOT_TABLE_SERVICE',
            message:
              'Solo gli ordini TABLE possono essere collegati a un tavolo.',
          });
        if (!['OPEN', 'HELD'].includes(row.status))
          throw new ConflictException({
            code: 'ORDER_NOT_ATTACHABLE',
            message:
              'Lo stato dell’ordine non consente il collegamento al tavolo.',
          });
        try {
          await client.query(
            `INSERT INTO table_session_orders (id,organization_id,table_session_id,order_id,attached_by_user_id) VALUES ($1,$2,$3,$4,$5)`,
            [
              randomUUID(),
              session.organizationId,
              sessionId,
              dto.orderId,
              auth.userId,
            ],
          );
        } catch (error) {
          this.rethrowUnique(
            error,
            'ORDER_ALREADY_ATTACHED',
            'L’ordine è già collegato a una sessione tavolo.',
          );
        }
        await client.query(
          `UPDATE table_sessions SET version=version+1,updated_at=NOW() WHERE id=$1`,
          [sessionId],
        );
        return session.version + 1;
      },
    );
  }

  async moveSession(
    auth: AuthContext,
    sessionId: string,
    dto: MoveTableSessionDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const target = await this.requireTable(organizationId, dto.tableId);
    await this.access.assertLocation(auth, target.locationId);
    if (target.status !== 'ACTIVE')
      throw new NotFoundException({
        code: 'DINING_TABLE_NOT_FOUND',
        message: 'Tavolo di destinazione non disponibile.',
      });
    return this.mutateSession(
      auth,
      sessionId,
      'table_session.move',
      dto.mutationId,
      dto.expectedVersion,
      { tableId: dto.tableId },
      async (client, session) => {
        if (target.locationId !== session.locationId)
          throw new ConflictException({
            code: 'TABLE_LOCATION_MISMATCH',
            message: 'Il tavolo di destinazione appartiene a un’altra sede.',
          });
        const keys = [
          buildActiveTableKey(organizationId, session.tableId),
          buildActiveTableKey(organizationId, dto.tableId),
        ].sort();
        for (const key of keys)
          await client.query(
            `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
            [key],
          );
        try {
          await client.query(
            `UPDATE table_sessions SET table_id=$2,active_table_key=$3,version=version+1,updated_at=NOW() WHERE id=$1`,
            [
              sessionId,
              dto.tableId,
              buildActiveTableKey(organizationId, dto.tableId),
            ],
          );
        } catch (error) {
          this.rethrowUnique(
            error,
            'TABLE_ALREADY_OCCUPIED',
            'Il tavolo di destinazione è già occupato.',
          );
        }
        return session.version + 1;
      },
    );
  }

  async closeSession(
    auth: AuthContext,
    sessionId: string,
    dto: CloseTableSessionDto,
  ) {
    return this.finishSession(auth, sessionId, dto, 'CLOSED');
  }
  async cancelSession(
    auth: AuthContext,
    sessionId: string,
    dto: CloseTableSessionDto,
  ) {
    return this.finishSession(auth, sessionId, dto, 'CANCELLED');
  }

  private async finishSession(
    auth: AuthContext,
    sessionId: string,
    dto: CloseTableSessionDto,
    next: 'CLOSED' | 'CANCELLED',
  ) {
    return this.mutateSession(
      auth,
      sessionId,
      `table_session.${next.toLowerCase()}`,
      dto.mutationId,
      dto.expectedVersion,
      { reason: dto.reason?.trim() || null },
      async (client, session) => {
        assertTableSessionTransition(session.status, next);
        const count = await client.query<CountRow>(
          `SELECT COUNT(*)::int AS count FROM table_session_orders tso JOIN orders o ON o.id=tso.order_id WHERE tso.table_session_id=$1 AND o.status NOT IN ('PAID','CANCELLED')`,
          [sessionId],
        );
        if ((count.rows[0]?.count ?? 0) > 0)
          throw new ConflictException({
            code: 'TABLE_SESSION_HAS_OPEN_ORDERS',
            message:
              'Chiudi o annulla tutti gli ordini prima di liberare il tavolo.',
          });
        await client.query(
          `UPDATE table_sessions SET status=$2::table_session_status,active_table_key=NULL,version=version+1,${next === 'CLOSED' ? 'closed_at' : 'cancelled_at'}=NOW(),close_reason=$3,updated_at=NOW() WHERE id=$1`,
          [sessionId, next, dto.reason?.trim() || null],
        );
        return session.version + 1;
      },
    );
  }

  private async mutateSession(
    auth: AuthContext,
    sessionId: string,
    operation: string,
    mutationId: string,
    expectedVersion: number,
    payload: unknown,
    work: (client: PoolClient, session: SessionRow) => Promise<number>,
  ) {
    const organizationId = assertOrganizationScope(auth);
    await this.withTransaction(async (client) => {
      const sessionResult = await client.query<SessionRow>(
        `SELECT id,organization_id AS "organizationId",location_id AS "locationId",table_id AS "tableId",device_id AS "deviceId",client_session_id AS "clientSessionId",request_hash AS "requestHash",status,guest_count AS "guestCount",note,version,opened_at AS "openedAt",closed_at AS "closedAt",cancelled_at AS "cancelledAt" FROM table_sessions WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [sessionId, organizationId],
      );
      const session = sessionResult.rows[0];
      if (!session)
        throw new NotFoundException({
          code: 'TABLE_SESSION_NOT_FOUND',
          message: 'Sessione tavolo non trovata.',
        });
      await this.access.assertLocation(auth, session.locationId);
      const hash = hospitalityRequestHash({ operation, payload });
      const previous = await client.query<MutationRow>(
        `SELECT operation,request_hash AS "requestHash",response_version AS "responseVersion" FROM hospitality_mutations WHERE organization_id=$1 AND device_id=$2 AND mutation_id=$3 LIMIT 1`,
        [organizationId, auth.deviceId, mutationId],
      );
      if (previous.rows[0]) {
        if (
          previous.rows[0].operation !== operation ||
          previous.rows[0].requestHash !== hash
        )
          throw new ConflictException({
            code: 'MUTATION_ID_REUSED',
            message: 'Il mutationId è già stato usato con dati differenti.',
          });
        return;
      }
      if (session.status !== 'OPEN')
        throw new ConflictException({
          code: 'TABLE_SESSION_NOT_OPEN',
          message: 'La sessione tavolo non è più modificabile.',
        });
      if (session.version !== expectedVersion)
        throw new ConflictException({
          code: 'TABLE_SESSION_VERSION_CONFLICT',
          message:
            'La sessione tavolo è stata modificata da un altro dispositivo.',
          currentVersion: session.version,
        });
      const responseVersion = await work(client, session);
      await client.query(
        `INSERT INTO hospitality_mutations (id,organization_id,device_id,mutation_id,scope_type,scope_id,operation,request_hash,response_version) VALUES ($1,$2,$3,$4,'TABLE_SESSION',$5,$6,$7,$8)`,
        [
          randomUUID(),
          organizationId,
          auth.deviceId,
          mutationId,
          sessionId,
          operation,
          hash,
          responseVersion,
        ],
      );
    });
    return this.getSession(auth, sessionId);
  }

  private async requireArea(org: string, id: string) {
    const r = await this.database.pool.query<AreaRow>(
      `SELECT id,organization_id AS "organizationId",location_id AS "locationId",code,name,sort_order AS "sortOrder",status,created_at AS "createdAt",updated_at AS "updatedAt" FROM dining_areas WHERE id=$1 AND organization_id=$2`,
      [id, org],
    );
    if (!r.rows[0])
      throw new NotFoundException({
        code: 'DINING_AREA_NOT_FOUND',
        message: 'Sala non trovata.',
      });
    return r.rows[0];
  }
  private async requireAreaAtLocation(
    org: string,
    id: string,
    location: string,
  ) {
    const a = await this.requireArea(org, id);
    if (a.locationId !== location)
      throw new NotFoundException({
        code: 'DINING_AREA_NOT_FOUND',
        message: 'Sala non trovata nella sede corrente.',
      });
    return a;
  }
  private async requireTable(org: string, id: string) {
    const r = await this.database.pool.query<TableRow>(
      `SELECT id,organization_id AS "organizationId",location_id AS "locationId",area_id AS "areaId",code,name,capacity,sort_order AS "sortOrder",status FROM dining_tables WHERE id=$1 AND organization_id=$2`,
      [id, org],
    );
    if (!r.rows[0])
      throw new NotFoundException({
        code: 'DINING_TABLE_NOT_FOUND',
        message: 'Tavolo non trovato.',
      });
    return r.rows[0];
  }
  private async requireSession(org: string, id: string) {
    const r = await this.database.pool.query<SessionRow>(
      `SELECT id,organization_id AS "organizationId",location_id AS "locationId",table_id AS "tableId",device_id AS "deviceId",client_session_id AS "clientSessionId",request_hash AS "requestHash",status,guest_count AS "guestCount",note,version,opened_at AS "openedAt",closed_at AS "closedAt",cancelled_at AS "cancelledAt" FROM table_sessions WHERE id=$1 AND organization_id=$2`,
      [id, org],
    );
    if (!r.rows[0])
      throw new NotFoundException({
        code: 'TABLE_SESSION_NOT_FOUND',
        message: 'Sessione tavolo non trovata.',
      });
    return r.rows[0];
  }
  private async simpleAudit(
    org: string,
    user: string,
    action: string,
    type: string,
    id: string,
    payload: unknown,
  ) {
    await this.database.pool.query(
      `INSERT INTO audit_events(id,organization_id,actor_user_id,action,entity_type,entity_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [randomUUID(), org, user, action, type, id, JSON.stringify(payload)],
    );
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
