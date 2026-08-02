import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { EventStatus } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { CreateEventTableGroupDto } from './dto/create-event-table-group.dto';
import {
  assertEventInventoryMutable,
  assertTablesNotAssigned,
} from './event-table-group-policy';
import { EventsAccessService } from './events-access.service';

interface EventRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  status: EventStatus;
  version: number;
}

interface IndividualInventoryRow extends QueryResultRow {
  inventoryId: string;
  kind: 'TABLE';
  diningTableId: string;
  code: string;
  name: string;
  areaName: string;
  capacity: number;
  enabled: boolean;
  activeAssignmentCount: number;
}

interface GroupInventoryRow extends QueryResultRow {
  inventoryId: string;
  kind: 'GROUP';
  groupId: string;
  code: string;
  name: string;
  capacity: number;
  enabled: boolean;
  activeAssignmentCount: number;
}

interface GroupMemberRow extends QueryResultRow {
  groupId: string;
  diningTableId: string;
  code: string;
  name: string;
  areaName: string;
  capacity: number;
  sortOrder: number;
}

interface MergeTableRow extends QueryResultRow {
  inventoryId: string;
  diningTableId: string;
  capacity: number;
}

interface GroupRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  capacity: number;
}

interface CountRow extends QueryResultRow {
  count: number;
}

@Injectable()
export class EventTableGroupsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: EventsAccessService,
  ) {}

  async get(auth: AuthContext, eventId: string) {
    const organizationId = assertOrganizationScope(auth);
    const event = await this.requireEvent(
      this.database.pool,
      organizationId,
      eventId,
      false,
    );
    await this.access.assertLocation(auth, event.locationId);
    return this.inventoryView(organizationId, event);
  }

  async merge(
    auth: AuthContext,
    eventId: string,
    dto: CreateEventTableGroupDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(
      this.database.pool,
      organizationId,
      eventId,
      false,
    );
    await this.access.assertLocation(auth, current.locationId);

    await this.withTransaction(async (client) => {
      const event = await this.lockInventory(client, organizationId, eventId);
      assertEventInventoryMutable(event.status);

      const tableIds = Array.from(new Set(dto.tableIds));
      const tables = await client.query<MergeTableRow>(
        `SELECT
           eti.id AS "inventoryId",
           eti.dining_table_id AS "diningTableId",
           eti.capacity_snapshot AS capacity
         FROM event_table_inventory eti
         JOIN dining_tables dt ON dt.id=eti.dining_table_id
         WHERE eti.organization_id=$1
           AND eti.location_id=$2
           AND eti.event_id=$3
           AND eti.enabled=TRUE
           AND eti.table_group_id IS NULL
           AND eti.dining_table_id=ANY($4::uuid[])
           AND dt.status='ACTIVE'
         FOR UPDATE OF eti,dt`,
        [organizationId, event.locationId, eventId, tableIds],
      );

      if (tables.rows.length !== tableIds.length) {
        throw new ConflictException({
          code: 'EVENT_TABLE_GROUP_SOURCE_INVALID',
          message:
            'I tavoli da combinare devono essere unità singole, attive e presenti nell’inventario dell’evento.',
        });
      }

      await this.assertPhysicalTablesFree(client, eventId, tableIds);

      const groupId = randomUUID();
      const capacity = tables.rows.reduce(
        (total, table) => total + table.capacity,
        0,
      );
      await client.query(
        `INSERT INTO event_table_groups (
           id,organization_id,location_id,event_id,code,name,
           capacity_snapshot,enabled,created_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8)`,
        [
          groupId,
          organizationId,
          event.locationId,
          eventId,
          dto.code.trim().toUpperCase(),
          dto.name.trim(),
          capacity,
          auth.userId,
        ],
      );

      for (const [index, tableId] of tableIds.entries()) {
        const table = tables.rows.find(
          (candidate) => candidate.diningTableId === tableId,
        );
        if (!table) {
          throw new Error('Locked merge table disappeared.');
        }
        await client.query(
          `INSERT INTO event_table_group_members (
             id,organization_id,location_id,event_id,group_id,
             dining_table_id,capacity_snapshot,sort_order
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            randomUUID(),
            organizationId,
            event.locationId,
            eventId,
            groupId,
            tableId,
            table.capacity,
            index,
          ],
        );
      }

      await client.query(
        `DELETE FROM event_table_inventory
         WHERE organization_id=$1 AND event_id=$2
           AND id=ANY($3::uuid[])`,
        [
          organizationId,
          eventId,
          tables.rows.map((table) => table.inventoryId),
        ],
      );
      await client.query(
        `INSERT INTO event_table_inventory (
           id,organization_id,location_id,event_id,dining_table_id,
           table_group_id,capacity_snapshot,enabled
         ) VALUES ($1,$2,$3,$4,NULL,$5,$6,TRUE)`,
        [
          randomUUID(),
          organizationId,
          event.locationId,
          eventId,
          groupId,
          capacity,
        ],
      );

      const version = await this.bumpVersion(client, organizationId, eventId);
      await this.recordChange(client, {
        organizationId,
        actorUserId: auth.userId,
        eventId,
        action: 'event.table_group.merged',
        topic: 'events.table_group.merged',
        payload: {
          eventId,
          groupId,
          tableIds,
          capacity,
          version,
        },
      });
    });

    return this.get(auth, eventId);
  }

  async split(auth: AuthContext, eventId: string, groupId: string) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(
      this.database.pool,
      organizationId,
      eventId,
      false,
    );
    await this.access.assertLocation(auth, current.locationId);

    await this.withTransaction(async (client) => {
      const event = await this.lockInventory(client, organizationId, eventId);
      assertEventInventoryMutable(event.status);

      const groupResult = await client.query<GroupRow>(
        `SELECT id,code,name,capacity_snapshot AS capacity
         FROM event_table_groups
         WHERE id=$1 AND organization_id=$2 AND event_id=$3
         LIMIT 1
         FOR UPDATE`,
        [groupId, organizationId, eventId],
      );
      const group = groupResult.rows[0];
      if (!group) {
        throw new NotFoundException({
          code: 'EVENT_TABLE_GROUP_NOT_FOUND',
          message: 'Gruppo tavoli non trovato per questo evento.',
        });
      }

      const members = await client.query<GroupMemberRow>(
        `SELECT
           m.group_id AS "groupId",
           m.dining_table_id AS "diningTableId",
           dt.code,dt.name,a.name AS "areaName",
           m.capacity_snapshot AS capacity,
           m.sort_order AS "sortOrder"
         FROM event_table_group_members m
         JOIN dining_tables dt ON dt.id=m.dining_table_id
         JOIN dining_areas a ON a.id=dt.area_id
         WHERE m.group_id=$1
         ORDER BY m.sort_order
         FOR UPDATE OF m`,
        [groupId],
      );
      const tableIds = members.rows.map((member) => member.diningTableId);
      await this.assertPhysicalTablesFree(client, eventId, tableIds);

      const groupAssignments = await client.query<CountRow>(
        `SELECT COUNT(*)::int AS count
         FROM reservation_table_assignments
         WHERE event_id=$1 AND table_group_id=$2 AND status='ACTIVE'`,
        [eventId, groupId],
      );
      assertTablesNotAssigned(groupAssignments.rows[0]?.count ?? 0);

      await client.query(
        `DELETE FROM event_table_inventory
         WHERE organization_id=$1 AND event_id=$2 AND table_group_id=$3`,
        [organizationId, eventId, groupId],
      );

      for (const member of members.rows) {
        await client.query(
          `INSERT INTO event_table_inventory (
             id,organization_id,location_id,event_id,dining_table_id,
             table_group_id,capacity_snapshot,enabled
           ) VALUES ($1,$2,$3,$4,$5,NULL,$6,TRUE)
           ON CONFLICT (event_id,dining_table_id)
             WHERE dining_table_id IS NOT NULL
           DO UPDATE SET
             capacity_snapshot=EXCLUDED.capacity_snapshot,
             enabled=TRUE,
             updated_at=NOW()`,
          [
            randomUUID(),
            organizationId,
            event.locationId,
            eventId,
            member.diningTableId,
            member.capacity,
          ],
        );
      }

      await client.query(
        `DELETE FROM event_table_groups
         WHERE id=$1 AND organization_id=$2 AND event_id=$3`,
        [groupId, organizationId, eventId],
      );

      const version = await this.bumpVersion(client, organizationId, eventId);
      await this.recordChange(client, {
        organizationId,
        actorUserId: auth.userId,
        eventId,
        action: 'event.table_group.split',
        topic: 'events.table_group.split',
        payload: {
          eventId,
          groupId,
          tableIds,
          version,
        },
      });
    });

    return this.get(auth, eventId);
  }

  private async inventoryView(organizationId: string, event: EventRow) {
    const [individuals, groups, members] = await Promise.all([
      this.database.pool.query<IndividualInventoryRow>(
        `SELECT
           eti.id AS "inventoryId",
           'TABLE'::text AS kind,
           eti.dining_table_id AS "diningTableId",
           dt.code,dt.name,a.name AS "areaName",
           eti.capacity_snapshot AS capacity,
           eti.enabled,
           (
             SELECT COUNT(*)::int
             FROM reservation_table_assignment_tables rat
             WHERE rat.event_id=eti.event_id
               AND rat.dining_table_id=eti.dining_table_id
               AND rat.active_event_table_key IS NOT NULL
           ) AS "activeAssignmentCount"
         FROM event_table_inventory eti
         JOIN dining_tables dt ON dt.id=eti.dining_table_id
         JOIN dining_areas a ON a.id=dt.area_id
         WHERE eti.organization_id=$1 AND eti.event_id=$2
           AND eti.table_group_id IS NULL
         ORDER BY a.sort_order,dt.sort_order,dt.name`,
        [organizationId, event.id],
      ),
      this.database.pool.query<GroupInventoryRow>(
        `SELECT
           eti.id AS "inventoryId",
           'GROUP'::text AS kind,
           g.id AS "groupId",g.code,g.name,
           eti.capacity_snapshot AS capacity,
           eti.enabled,
           (
             SELECT COUNT(*)::int
             FROM reservation_table_assignments rta
             WHERE rta.event_id=eti.event_id
               AND rta.table_group_id=g.id
               AND rta.status='ACTIVE'
           ) AS "activeAssignmentCount"
         FROM event_table_inventory eti
         JOIN event_table_groups g ON g.id=eti.table_group_id
         WHERE eti.organization_id=$1 AND eti.event_id=$2
         ORDER BY g.created_at,g.name`,
        [organizationId, event.id],
      ),
      this.database.pool.query<GroupMemberRow>(
        `SELECT
           m.group_id AS "groupId",
           m.dining_table_id AS "diningTableId",
           dt.code,dt.name,a.name AS "areaName",
           m.capacity_snapshot AS capacity,
           m.sort_order AS "sortOrder"
         FROM event_table_group_members m
         JOIN dining_tables dt ON dt.id=m.dining_table_id
         JOIN dining_areas a ON a.id=dt.area_id
         WHERE m.organization_id=$1 AND m.event_id=$2
         ORDER BY m.group_id,m.sort_order`,
        [organizationId, event.id],
      ),
    ]);

    const membersByGroup = new Map<string, GroupMemberRow[]>();
    for (const member of members.rows) {
      const current = membersByGroup.get(member.groupId) ?? [];
      current.push(member);
      membersByGroup.set(member.groupId, current);
    }

    return {
      event: {
        id: event.id,
        locationId: event.locationId,
        status: event.status,
        version: event.version,
      },
      units: [
        ...individuals.rows,
        ...groups.rows.map((group) => ({
          ...group,
          members: membersByGroup.get(group.groupId) ?? [],
        })),
      ],
      metrics: {
        unitCount: individuals.rows.length + groups.rows.length,
        physicalTableCount:
          individuals.rows.length +
          members.rows.length,
        capacity: [...individuals.rows, ...groups.rows]
          .filter((unit) => unit.enabled)
          .reduce((total, unit) => total + unit.capacity, 0),
      },
    };
  }

  private async lockInventory(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
      [`event-inventory:${eventId}`],
    );
    return this.requireEvent(client, organizationId, eventId, true);
  }

  private async assertPhysicalTablesFree(
    client: PoolClient,
    eventId: string,
    tableIds: string[],
  ) {
    const assignments = await client.query<CountRow>(
      `SELECT COUNT(*)::int AS count
       FROM reservation_table_assignment_tables
       WHERE event_id=$1
         AND dining_table_id=ANY($2::uuid[])
         AND active_event_table_key IS NOT NULL`,
      [eventId, tableIds],
    );
    assertTablesNotAssigned(assignments.rows[0]?.count ?? 0);
  }

  private async requireEvent(
    client: Pick<PoolClient, 'query'>,
    organizationId: string,
    eventId: string,
    lock: boolean,
  ): Promise<EventRow> {
    const result = await client.query<EventRow>(
      `SELECT id,organization_id AS "organizationId",
         location_id AS "locationId",status,version
       FROM events
       WHERE id=$1 AND organization_id=$2
       LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      [eventId, organizationId],
    );
    const event = result.rows[0];
    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: 'Evento non trovato.',
      });
    }
    return event;
  }

  private async bumpVersion(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ) {
    const result = await client.query<{ version: number }>(
      `UPDATE events
       SET version=version+1,updated_at=NOW()
       WHERE id=$1 AND organization_id=$2
       RETURNING version`,
      [eventId, organizationId],
    );
    const version = result.rows[0]?.version;
    if (!version) throw new Error('Event inventory update returned no version.');
    return version;
  }

  private async recordChange(
    client: PoolClient,
    input: {
      organizationId: string;
      actorUserId: string;
      eventId: string;
      action: string;
      topic: string;
      payload: Record<string, unknown>;
    },
  ) {
    await client.query(
      `INSERT INTO audit_events (
         id,organization_id,actor_user_id,action,entity_type,entity_id,payload
       ) VALUES ($1,$2,$3,$4,'event',$5,$6::jsonb)`,
      [
        randomUUID(),
        input.organizationId,
        input.actorUserId,
        input.action,
        input.eventId,
        JSON.stringify(input.payload),
      ],
    );
    await client.query(
      `INSERT INTO outbox_events (
         id,topic,aggregate_type,aggregate_id,payload
       ) VALUES ($1,$2,'event',$3,$4::jsonb)`,
      [
        randomUUID(),
        input.topic,
        input.eventId,
        JSON.stringify({
          organizationId: input.organizationId,
          ...input.payload,
        }),
      ],
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
      await client.query('ROLLBACK');
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new ConflictException({
          code: 'EVENT_TABLE_GROUP_CONFLICT',
          message:
            'Il codice del gruppo è già usato oppure un tavolo appartiene già a un altro gruppo dell’evento.',
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
