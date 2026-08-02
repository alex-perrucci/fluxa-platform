import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { CreateReservationHoldDto } from './dto/create-reservation-hold.dto';
import { ReservationEngineService } from './reservation-engine.service';
import {
  assertEventAcceptsHolds,
  assertEventCapacityAvailable,
  assertPartySizeAllowed,
  buildReservationHoldRequestHash,
  calculatePlatformFee,
  hashPublicToken,
  remainingEventCapacity,
  type PublicBookableEvent,
  type PublicBookingRules,
} from './reservation-policy';

interface EventRow extends QueryResultRow, PublicBookableEvent {
  organizationId: string;
  locationId: string;
  title: string;
  slug: string;
  timezone: string;
}

interface BookingRulesRow extends QueryResultRow, PublicBookingRules {
  requirePhone: boolean;
}

interface CandidateUnitRow extends QueryResultRow {
  inventoryId: string;
  diningTableId: string | null;
  tableGroupId: string | null;
  capacitySnapshot: number;
}

interface HoldRow extends QueryResultRow {
  id: string;
  publicTokenHash: string;
  requestHash: string;
}

interface OccupancyRow extends QueryResultRow {
  occupiedCapacity: number;
}

interface AvailabilityRow extends QueryResultRow {
  availableUnitCount: number;
  smallestUnitCapacity: number | null;
}

interface FeeRuleRow extends QueryResultRow {
  id: string;
  basisPoints: number;
}

@Injectable()
export class EventInventoryReservationEngineService extends ReservationEngineService {
  constructor(private readonly eventInventoryDatabase: DatabaseService) {
    super(eventInventoryDatabase);
  }

  override async availability(slugInput: string, partySize: number) {
    const slug = slugInput.trim().toLowerCase();
    const event = await this.loadPublicEvent(
      this.eventInventoryDatabase.pool,
      slug,
    );
    assertEventAcceptsHolds(event);

    const rules = await this.loadBookingRules(
      this.eventInventoryDatabase.pool,
      event.organizationId,
      event.id,
    );
    assertPartySizeAllowed(partySize, rules);

    const [occupancy, availability] = await Promise.all([
      this.occupiedCapacity(this.eventInventoryDatabase.pool, event.id),
      this.eventInventoryDatabase.pool.query<AvailabilityRow>(
        `SELECT
           COUNT(*)::int AS "availableUnitCount",
           MIN(eti.capacity_snapshot)::int AS "smallestUnitCapacity"
         FROM event_table_inventory eti
         WHERE eti.event_id=$1
           AND eti.organization_id=$2
           AND eti.enabled=TRUE
           AND eti.capacity_snapshot >= $3
           AND NOT EXISTS (
             SELECT 1
             FROM reservation_table_assignment_tables rat
             WHERE rat.event_id=eti.event_id
               AND rat.active_event_table_key IS NOT NULL
               AND rat.dining_table_id=ANY(
                 CASE
                   WHEN eti.dining_table_id IS NOT NULL
                     THEN ARRAY[eti.dining_table_id]::uuid[]
                   ELSE ARRAY(
                     SELECT m.dining_table_id
                     FROM event_table_group_members m
                     WHERE m.group_id=eti.table_group_id
                   )
                 END
               )
           )`,
        [event.id, event.organizationId, partySize],
      ),
    ]);

    const remainingCapacity = remainingEventCapacity(
      event.capacity,
      occupancy.occupiedCapacity,
    );
    const availableUnitCount = availability.rows[0]?.availableUnitCount ?? 0;

    return {
      event: {
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt,
        timezone: event.timezone,
        bookingAmountCents: event.bookingAmountCents,
        currency: event.currency,
      },
      partySize,
      available: availableUnitCount > 0 && remainingCapacity >= partySize,
      availableTableCount: availableUnitCount,
      smallestTableCapacity: availability.rows[0]?.smallestUnitCapacity ?? null,
      remainingCapacity,
      holdMinutes: rules.holdMinutes,
    };
  }

  override async createHold(slugInput: string, dto: CreateReservationHoldDto) {
    const slug = slugInput.trim().toLowerCase();
    const publicTokenHash = hashPublicToken(dto.holdToken);
    const idempotencyKey = dto.idempotencyKey.trim();

    try {
      await this.withInventoryTransaction(async (client) => {
        const event = await this.loadAndLockPublicEvent(client, slug);
        assertEventAcceptsHolds(event);
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
          [`reservation-event:${event.id}`],
        );

        await this.expireEventHolds(client, event.organizationId, event.id);
        const rules = await this.loadBookingRules(
          client,
          event.organizationId,
          event.id,
        );
        assertPartySizeAllowed(dto.partySize, rules);

        const requestHash = buildReservationHoldRequestHash({
          eventId: event.id,
          partySize: dto.partySize,
          publicTokenHash,
        });
        const duplicate = await client.query<HoldRow>(
          `SELECT id,public_token_hash AS "publicTokenHash",
             request_hash AS "requestHash"
           FROM reservation_holds
           WHERE organization_id=$1 AND event_id=$2 AND idempotency_key=$3
           LIMIT 1 FOR UPDATE`,
          [event.organizationId, event.id, idempotencyKey],
        );
        const existing = duplicate.rows[0];
        if (existing) {
          if (
            existing.requestHash !== requestHash ||
            existing.publicTokenHash !== publicTokenHash
          ) {
            throw new ConflictException({
              code: 'RESERVATION_IDEMPOTENCY_KEY_REUSED',
              message:
                'La chiave di idempotenza è già stata utilizzata con dati differenti.',
            });
          }
          return;
        }

        const occupancy = await this.occupiedCapacity(client, event.id);
        assertEventCapacityAvailable(
          event.capacity,
          occupancy.occupiedCapacity,
          dto.partySize,
        );

        const unitResult = await client.query<CandidateUnitRow>(
          `SELECT
             eti.id AS "inventoryId",
             eti.dining_table_id AS "diningTableId",
             eti.table_group_id AS "tableGroupId",
             eti.capacity_snapshot AS "capacitySnapshot"
           FROM event_table_inventory eti
           WHERE eti.organization_id=$1
             AND eti.location_id=$2
             AND eti.event_id=$3
             AND eti.enabled=TRUE
             AND eti.capacity_snapshot >= $4
             AND NOT EXISTS (
               SELECT 1
               FROM reservation_table_assignment_tables rat
               WHERE rat.event_id=eti.event_id
                 AND rat.active_event_table_key IS NOT NULL
                 AND rat.dining_table_id=ANY(
                   CASE
                     WHEN eti.dining_table_id IS NOT NULL
                       THEN ARRAY[eti.dining_table_id]::uuid[]
                     ELSE ARRAY(
                       SELECT m.dining_table_id
                       FROM event_table_group_members m
                       WHERE m.group_id=eti.table_group_id
                     )
                   END
                 )
             )
           ORDER BY eti.capacity_snapshot,eti.created_at,eti.id
           LIMIT 1
           FOR UPDATE OF eti SKIP LOCKED`,
          [event.organizationId, event.locationId, event.id, dto.partySize],
        );
        const unit = unitResult.rows[0];
        if (!unit) {
          throw new ConflictException({
            code: 'RESERVATION_TABLE_UNAVAILABLE',
            message:
              'Non è disponibile un tavolo o gruppo adatto al numero di coperti indicato.',
          });
        }

        const physicalTableIds = await this.physicalTableIds(client, unit);
        if (physicalTableIds.length === 0) {
          throw new ConflictException({
            code: 'RESERVATION_INVENTORY_UNIT_EMPTY',
            message: 'L’unità di inventario selezionata non contiene tavoli.',
          });
        }

        const feeRule = await this.resolveFeeRule(
          client,
          event.organizationId,
          event.id,
        );
        const basisPoints = feeRule?.basisPoints ?? 0;
        const amounts = calculatePlatformFee(
          event.bookingAmountCents,
          basisPoints,
        );
        const holdId = randomUUID();
        const assignmentId = randomUUID();
        const expiresAt = new Date(Date.now() + rules.holdMinutes * 60_000);

        await client.query(
          `INSERT INTO reservation_holds (
             id,organization_id,location_id,event_id,fee_rule_id,
             public_token_hash,idempotency_key,request_hash,status,party_size,
             amount_cents,platform_fee_basis_points,platform_fee_cents,
             merchant_gross_cents,currency,version,expires_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9,$10,$11,$12,$13,$14,1,$15
           )`,
          [
            holdId,
            event.organizationId,
            event.locationId,
            event.id,
            feeRule?.id ?? null,
            publicTokenHash,
            idempotencyKey,
            requestHash,
            dto.partySize,
            event.bookingAmountCents,
            basisPoints,
            amounts.platformFeeCents,
            amounts.merchantGrossCents,
            event.currency,
            expiresAt,
          ],
        );

        const unitId = unit.diningTableId ?? unit.tableGroupId;
        if (!unitId) throw new Error('Inventory unit has no identifier.');
        await client.query(
          `INSERT INTO reservation_table_assignments (
             id,organization_id,location_id,event_id,dining_table_id,
             table_group_id,hold_id,status,active_event_table_key,version
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,1)`,
          [
            assignmentId,
            event.organizationId,
            event.locationId,
            event.id,
            unit.diningTableId,
            unit.tableGroupId,
            holdId,
            `${event.id}:${unit.tableGroupId ? 'GROUP' : 'TABLE'}:${unitId}`,
          ],
        );

        for (const tableId of physicalTableIds) {
          await client.query(
            `INSERT INTO reservation_table_assignment_tables (
               id,assignment_id,organization_id,location_id,event_id,
               dining_table_id,active_event_table_key
             ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              randomUUID(),
              assignmentId,
              event.organizationId,
              event.locationId,
              event.id,
              tableId,
              `${event.id}:${tableId}`,
            ],
          );
        }

        await this.recordChange(client, {
          organizationId: event.organizationId,
          action: 'reservation_hold.created',
          entityType: 'reservation_hold',
          entityId: holdId,
          topic: 'reservations.hold.created',
          aggregateType: 'reservation_hold',
          aggregateId: holdId,
          payload: {
            holdId,
            eventId: event.id,
            locationId: event.locationId,
            partySize: dto.partySize,
            diningTableId: unit.diningTableId,
            tableGroupId: unit.tableGroupId,
            physicalTableIds,
            expiresAt: expiresAt.toISOString(),
          },
        });
      });

      return this.getHold(dto.holdToken);
    } catch (error) {
      this.rethrowInventoryConstraint(error);
    }
  }

  private async physicalTableIds(
    client: PoolClient,
    unit: CandidateUnitRow,
  ): Promise<string[]> {
    if (unit.diningTableId) return [unit.diningTableId];
    const result = await client.query<{ diningTableId: string }>(
      `SELECT dining_table_id AS "diningTableId"
       FROM event_table_group_members
       WHERE group_id=$1
       ORDER BY sort_order
       FOR SHARE`,
      [unit.tableGroupId],
    );
    return result.rows.map((row) => row.diningTableId);
  }

  private async loadPublicEvent(
    executor: Pick<PoolClient, 'query'>,
    slug: string,
  ): Promise<EventRow | null> {
    const result = await executor.query<EventRow>(
      `SELECT id,organization_id AS "organizationId",
         location_id AS "locationId",title,slug,timezone,status,
         starts_at AS "startsAt",booking_opens_at AS "bookingOpensAt",
         booking_closes_at AS "bookingClosesAt",
         booking_amount_cents AS "bookingAmountCents",capacity,currency
       FROM events
       WHERE slug=$1 AND status IN ('PUBLISHED','SOLD_OUT')
       LIMIT 1`,
      [slug],
    );
    return result.rows[0] ?? null;
  }

  private async loadAndLockPublicEvent(
    client: PoolClient,
    slug: string,
  ): Promise<EventRow | null> {
    const result = await client.query<EventRow>(
      `SELECT id,organization_id AS "organizationId",
         location_id AS "locationId",title,slug,timezone,status,
         starts_at AS "startsAt",booking_opens_at AS "bookingOpensAt",
         booking_closes_at AS "bookingClosesAt",
         booking_amount_cents AS "bookingAmountCents",capacity,currency
       FROM events
       WHERE slug=$1 AND status IN ('PUBLISHED','SOLD_OUT')
       LIMIT 1 FOR UPDATE`,
      [slug],
    );
    return result.rows[0] ?? null;
  }

  private async loadBookingRules(
    executor: Pick<PoolClient, 'query'>,
    organizationId: string,
    eventId: string,
  ): Promise<BookingRulesRow | null> {
    const result = await executor.query<BookingRulesRow>(
      `SELECT min_party_size AS "minPartySize",
         max_party_size AS "maxPartySize",
         hold_minutes AS "holdMinutes",
         require_phone AS "requirePhone"
       FROM event_booking_rules
       WHERE organization_id=$1 AND event_id=$2
       LIMIT 1`,
      [organizationId, eventId],
    );
    return result.rows[0] ?? null;
  }

  private async occupiedCapacity(
    executor: Pick<PoolClient, 'query'>,
    eventId: string,
  ): Promise<OccupancyRow> {
    const result = await executor.query<OccupancyRow>(
      `SELECT COALESCE(SUM(
         CASE
           WHEN rta.hold_id IS NOT NULL
             AND h.status='ACTIVE' AND h.expires_at>NOW()
             THEN h.party_size
           WHEN rta.reservation_id IS NOT NULL
             AND r.status IN (
               'PENDING_PAYMENT','CONFIRMED','CHECKED_IN','SEATED'
             ) THEN r.party_size
           ELSE 0
         END
       ),0)::int AS "occupiedCapacity"
       FROM reservation_table_assignments rta
       LEFT JOIN reservation_holds h ON h.id=rta.hold_id
       LEFT JOIN reservations r ON r.id=rta.reservation_id
       WHERE rta.event_id=$1 AND rta.status='ACTIVE'`,
      [eventId],
    );
    return result.rows[0] ?? { occupiedCapacity: 0 };
  }

  private async expireEventHolds(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ) {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM reservation_holds
       WHERE organization_id=$1 AND event_id=$2
         AND status='ACTIVE' AND expires_at<=NOW()
       FOR UPDATE`,
      [organizationId, eventId],
    );
    for (const hold of result.rows) {
      await client.query(
        `UPDATE reservation_table_assignments
         SET status='RELEASED',active_event_table_key=NULL,
           released_at=NOW(),release_reason='HOLD_EXPIRED',
           version=version+1,updated_at=NOW()
         WHERE hold_id=$1 AND status='ACTIVE'`,
        [hold.id],
      );
      await client.query(
        `UPDATE reservation_holds
         SET status='EXPIRED',version=version+1,updated_at=NOW()
         WHERE id=$1 AND status='ACTIVE'`,
        [hold.id],
      );
    }
  }

  private async resolveFeeRule(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<FeeRuleRow | null> {
    const result = await client.query<FeeRuleRow>(
      `SELECT id,basis_points AS "basisPoints"
       FROM platform_fee_rules
       WHERE active=TRUE AND effective_from<=NOW()
         AND (effective_to IS NULL OR effective_to>NOW())
         AND (
           (scope='EVENT' AND organization_id=$1 AND event_id=$2)
           OR
           (scope='ORGANIZATION' AND organization_id=$1 AND event_id IS NULL)
           OR
           (scope='GLOBAL' AND organization_id IS NULL AND event_id IS NULL)
         )
       ORDER BY CASE scope
         WHEN 'EVENT' THEN 1 WHEN 'ORGANIZATION' THEN 2 ELSE 3 END,
         effective_from DESC,created_at DESC
       LIMIT 1`,
      [organizationId, eventId],
    );
    return result.rows[0] ?? null;
  }

  private async recordChange(
    client: PoolClient,
    input: {
      organizationId: string;
      action: string;
      entityType: string;
      entityId: string;
      topic: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
    },
  ) {
    await client.query(
      `INSERT INTO audit_events (
         id,organization_id,actor_user_id,action,entity_type,entity_id,payload
       ) VALUES ($1,$2,NULL,$3,$4,$5,$6::jsonb)`,
      [
        randomUUID(),
        input.organizationId,
        input.action,
        input.entityType,
        input.entityId,
        JSON.stringify(input.payload),
      ],
    );
    await client.query(
      `INSERT INTO outbox_events (
         id,topic,aggregate_type,aggregate_id,payload
       ) VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [
        randomUUID(),
        input.topic,
        input.aggregateType,
        input.aggregateId,
        JSON.stringify({
          organizationId: input.organizationId,
          ...input.payload,
        }),
      ],
    );
  }

  private async withInventoryTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ) {
    const client = await this.eventInventoryDatabase.pool.connect();
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

  private rethrowInventoryConstraint(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    ) {
      throw new ConflictException({
        code: 'RESERVATION_TABLE_UNAVAILABLE',
        message:
          'Uno dei tavoli fisici è stato assegnato contemporaneamente a un’altra prenotazione.',
      });
    }
    throw error;
  }
}
