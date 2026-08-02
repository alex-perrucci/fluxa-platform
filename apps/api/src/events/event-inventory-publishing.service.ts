import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { EventStatus } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import {
  assertEventPublishable,
  type InventoryMetrics,
  type NormalizedBookingRules,
} from './event-policy';
import { EventsAccessService } from './events-access.service';
import { EventsService } from './events.service';

interface EventRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  slug: string;
  status: EventStatus;
  startsAt: Date;
  bookingClosesAt: Date;
  capacity: number;
  version: number;
}

interface MetricsRow extends QueryResultRow {
  tableCount: number;
  activeTableCount: number;
  inventoryCapacity: number;
  maxTableCapacity: number;
}

interface RulesRow extends QueryResultRow, NormalizedBookingRules {}

@Injectable()
export class EventInventoryPublishingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: EventsAccessService,
    private readonly events: EventsService,
  ) {}

  async publish(auth: AuthContext, eventId: string) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(
      this.database.pool,
      organizationId,
      eventId,
      false,
    );
    await this.access.assertLocation(auth, current.locationId);

    await this.withTransaction(async (client) => {
      const event = await this.requireEvent(
        client,
        organizationId,
        eventId,
        true,
      );
      const [metrics, rules] = await Promise.all([
        this.inventoryMetrics(client, organizationId, eventId),
        this.bookingRules(client, organizationId, eventId),
      ]);
      assertEventPublishable(event, metrics, rules);

      const result = await client.query<{ version: number }>(
        `UPDATE events
         SET status='PUBLISHED',published_at=NOW(),
           version=version+1,updated_at=NOW()
         WHERE id=$1 AND organization_id=$2
         RETURNING version`,
        [eventId, organizationId],
      );
      const version = result.rows[0]?.version;
      if (!version) throw new Error('Event publish returned no version.');

      const payload = {
        eventId,
        locationId: event.locationId,
        slug: event.slug,
        status: 'PUBLISHED',
        version,
        inventoryUnits: metrics.tableCount,
        inventoryCapacity: metrics.inventoryCapacity,
      };
      await client.query(
        `INSERT INTO audit_events (
           id,organization_id,actor_user_id,action,entity_type,entity_id,payload
         ) VALUES ($1,$2,$3,'event.published','event',$4,$5::jsonb)`,
        [
          randomUUID(),
          organizationId,
          auth.userId,
          eventId,
          JSON.stringify(payload),
        ],
      );
      await client.query(
        `INSERT INTO outbox_events (
           id,topic,aggregate_type,aggregate_id,payload
         ) VALUES ($1,'events.event.published','event',$2,$3::jsonb)`,
        [randomUUID(), eventId, JSON.stringify({ organizationId, ...payload })],
      );
    });

    return this.events.get(auth, eventId);
  }

  private async inventoryMetrics(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<InventoryMetrics> {
    const result = await client.query<MetricsRow>(
      `SELECT
         COUNT(*)::int AS "tableCount",
         COUNT(*) FILTER (WHERE eti.enabled=TRUE)::int AS "activeTableCount",
         COALESCE(SUM(eti.capacity_snapshot)
           FILTER (WHERE eti.enabled=TRUE),0)::int AS "inventoryCapacity",
         COALESCE(MAX(eti.capacity_snapshot)
           FILTER (WHERE eti.enabled=TRUE),0)::int AS "maxTableCapacity"
       FROM event_table_inventory eti
       WHERE eti.organization_id=$1 AND eti.event_id=$2`,
      [organizationId, eventId],
    );
    return (
      result.rows[0] ?? {
        tableCount: 0,
        activeTableCount: 0,
        inventoryCapacity: 0,
        maxTableCapacity: 0,
      }
    );
  }

  private async bookingRules(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<NormalizedBookingRules | null> {
    const result = await client.query<RulesRow>(
      `SELECT min_party_size AS "minPartySize",
         max_party_size AS "maxPartySize",
         hold_minutes AS "holdMinutes",
         booking_cutoff_minutes AS "bookingCutoffMinutes",
         cancellation_cutoff_minutes AS "cancellationCutoffMinutes",
         auto_assign_smallest_table AS "autoAssignSmallestTable",
         allow_manual_assignment AS "allowManualAssignment",
         require_phone AS "requirePhone"
       FROM event_booking_rules
       WHERE organization_id=$1 AND event_id=$2
       LIMIT 1`,
      [organizationId, eventId],
    );
    return result.rows[0] ?? null;
  }

  private async requireEvent(
    client: Pick<PoolClient, 'query'>,
    organizationId: string,
    eventId: string,
    lock: boolean,
  ): Promise<EventRow> {
    const result = await client.query<EventRow>(
      `SELECT id,organization_id AS "organizationId",
         location_id AS "locationId",slug,status,
         starts_at AS "startsAt",
         booking_closes_at AS "bookingClosesAt",
         capacity,version
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

  private async withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
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
