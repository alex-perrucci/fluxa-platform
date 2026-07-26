// PHASE_4_RESERVATION_ENGINE
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { CreateReservationHoldDto } from './dto/create-reservation-hold.dto';
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

interface FeeRuleRow extends QueryResultRow {
  id: string;
  basisPoints: number;
}

interface OccupancyRow extends QueryResultRow {
  occupiedCapacity: number;
}

interface AvailabilityRow extends QueryResultRow {
  availableTableCount: number;
  smallestTableCapacity: number | null;
}

interface CandidateTableRow extends QueryResultRow {
  diningTableId: string;
  capacitySnapshot: number;
}

interface HoldRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
  feeRuleId: string | null;
  publicTokenHash: string;
  idempotencyKey: string;
  requestHash: string;
  status: 'ACTIVE' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';
  partySize: number;
  amountCents: number;
  platformFeeBasisPoints: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  currency: string;
  version: number;
  expiresAt: Date;
  convertedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface HoldViewRow extends HoldRow {
  eventSlug: string;
  eventTitle: string;
  eventStartsAt: Date;
  diningTableId: string | null;
  tableName: string | null;
  tableCapacity: number | null;
}

interface ExpiredHoldRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
}

const HOLD_VIEW_COLUMNS = `
  h.id,
  h.organization_id AS "organizationId",
  h.location_id AS "locationId",
  h.event_id AS "eventId",
  h.fee_rule_id AS "feeRuleId",
  h.public_token_hash AS "publicTokenHash",
  h.idempotency_key AS "idempotencyKey",
  h.request_hash AS "requestHash",
  h.status,
  h.party_size AS "partySize",
  h.amount_cents AS "amountCents",
  h.platform_fee_basis_points AS "platformFeeBasisPoints",
  h.platform_fee_cents AS "platformFeeCents",
  h.merchant_gross_cents AS "merchantGrossCents",
  h.currency,
  h.version,
  h.expires_at AS "expiresAt",
  h.converted_at AS "convertedAt",
  h.cancelled_at AS "cancelledAt",
  h.created_at AS "createdAt",
  h.updated_at AS "updatedAt",
  e.slug AS "eventSlug",
  e.title AS "eventTitle",
  e.starts_at AS "eventStartsAt",
  rta.dining_table_id AS "diningTableId",
  dt.name AS "tableName",
  dt.capacity AS "tableCapacity"
`;

@Injectable()
export class ReservationEngineService {
  constructor(private readonly database: DatabaseService) {}

  async availability(slugInput: string, partySize: number) {
    const slug = slugInput.trim().toLowerCase();
    const event = await this.loadPublicEvent(this.database.pool, slug);
    assertEventAcceptsHolds(event);

    const rules = await this.loadBookingRules(
      this.database.pool,
      event.organizationId,
      event.id,
    );
    assertPartySizeAllowed(partySize, rules);

    const [occupancy, availability] = await Promise.all([
      this.occupiedCapacity(this.database.pool, event.id),
      this.database.pool.query<AvailabilityRow>(
        `
          SELECT
            COUNT(*)::int AS "availableTableCount",
            MIN(eti.capacity_snapshot)::int AS "smallestTableCapacity"
          FROM event_table_inventory eti
          JOIN dining_tables dt
            ON dt.id = eti.dining_table_id
          WHERE eti.event_id = $1
            AND eti.organization_id = $2
            AND eti.enabled = TRUE
            AND dt.status = 'ACTIVE'
            AND eti.capacity_snapshot >= $3
            AND NOT EXISTS (
              SELECT 1
              FROM reservation_table_assignments rta
              LEFT JOIN reservation_holds h
                ON h.id = rta.hold_id
              LEFT JOIN reservations r
                ON r.id = rta.reservation_id
              WHERE rta.event_id = eti.event_id
                AND rta.dining_table_id = eti.dining_table_id
                AND rta.status = 'ACTIVE'
                AND (
                  (
                    rta.hold_id IS NOT NULL
                    AND h.status = 'ACTIVE'
                    AND h.expires_at > NOW()
                  )
                  OR
                  (
                    rta.reservation_id IS NOT NULL
                    AND r.status IN (
                      'PENDING_PAYMENT',
                      'CONFIRMED',
                      'CHECKED_IN',
                      'SEATED'
                    )
                  )
                )
            )
        `,
        [event.id, event.organizationId, partySize],
      ),
    ]);

    const occupiedCapacity = occupancy.occupiedCapacity;
    const remainingCapacity = remainingEventCapacity(
      event.capacity,
      occupiedCapacity,
    );
    const availableTableCount = availability.rows[0]?.availableTableCount ?? 0;
    const smallestTableCapacity =
      availability.rows[0]?.smallestTableCapacity ?? null;

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
      available: availableTableCount > 0 && remainingCapacity >= partySize,
      availableTableCount,
      smallestTableCapacity,
      remainingCapacity,
      holdMinutes: rules.holdMinutes,
    };
  }

  async createHold(slugInput: string, dto: CreateReservationHoldDto) {
    const slug = slugInput.trim().toLowerCase();
    const publicTokenHash = hashPublicToken(dto.holdToken);
    const idempotencyKey = dto.idempotencyKey.trim();

    try {
      const holdId = await this.withTransaction(async (client) => {
        const event = await this.loadAndLockPublicEvent(client, slug);
        assertEventAcceptsHolds(event);

        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
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
          `
            SELECT
              id,
              organization_id AS "organizationId",
              location_id AS "locationId",
              event_id AS "eventId",
              fee_rule_id AS "feeRuleId",
              public_token_hash AS "publicTokenHash",
              idempotency_key AS "idempotencyKey",
              request_hash AS "requestHash",
              status,
              party_size AS "partySize",
              amount_cents AS "amountCents",
              platform_fee_basis_points AS "platformFeeBasisPoints",
              platform_fee_cents AS "platformFeeCents",
              merchant_gross_cents AS "merchantGrossCents",
              currency,
              version,
              expires_at AS "expiresAt",
              converted_at AS "convertedAt",
              cancelled_at AS "cancelledAt",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
            FROM reservation_holds
            WHERE organization_id = $1
              AND event_id = $2
              AND idempotency_key = $3
            LIMIT 1
            FOR UPDATE
          `,
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

          return existing.id;
        }

        const occupancy = await this.occupiedCapacity(client, event.id);
        assertEventCapacityAvailable(
          event.capacity,
          occupancy.occupiedCapacity,
          dto.partySize,
        );

        const tableResult = await client.query<CandidateTableRow>(
          `
            SELECT
              eti.dining_table_id AS "diningTableId",
              eti.capacity_snapshot AS "capacitySnapshot"
            FROM event_table_inventory eti
            JOIN dining_tables dt
              ON dt.id = eti.dining_table_id
            WHERE eti.organization_id = $1
              AND eti.location_id = $2
              AND eti.event_id = $3
              AND eti.enabled = TRUE
              AND dt.status = 'ACTIVE'
              AND eti.capacity_snapshot >= $4
              AND NOT EXISTS (
                SELECT 1
                FROM reservation_table_assignments rta
                WHERE rta.organization_id = eti.organization_id
                  AND rta.event_id = eti.event_id
                  AND rta.dining_table_id = eti.dining_table_id
                  AND rta.status = 'ACTIVE'
              )
            ORDER BY
              eti.capacity_snapshot ASC,
              dt.sort_order ASC,
              dt.id ASC
            LIMIT 1
            FOR UPDATE OF eti, dt SKIP LOCKED
          `,
          [event.organizationId, event.locationId, event.id, dto.partySize],
        );
        const table = tableResult.rows[0];

        if (!table) {
          throw new ConflictException({
            code: 'RESERVATION_TABLE_UNAVAILABLE',
            message:
              'Non è disponibile un tavolo adatto al numero di coperti indicato.',
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
        const expiresAt = new Date(Date.now() + rules.holdMinutes * 60_000);

        await client.query(
          `
            INSERT INTO reservation_holds (
              id,
              organization_id,
              location_id,
              event_id,
              fee_rule_id,
              public_token_hash,
              idempotency_key,
              request_hash,
              status,
              party_size,
              amount_cents,
              platform_fee_basis_points,
              platform_fee_cents,
              merchant_gross_cents,
              currency,
              version,
              expires_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',$9,$10,$11,$12,$13,$14,1,$15
            )
          `,
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

        await client.query(
          `
            INSERT INTO reservation_table_assignments (
              id,
              organization_id,
              location_id,
              event_id,
              dining_table_id,
              hold_id,
              status,
              active_event_table_key,
              version
            )
            VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,1)
          `,
          [
            randomUUID(),
            event.organizationId,
            event.locationId,
            event.id,
            table.diningTableId,
            holdId,
            `${event.id}:${table.diningTableId}`,
          ],
        );

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
            diningTableId: table.diningTableId,
            expiresAt: expiresAt.toISOString(),
          },
        });

        return holdId;
      });

      const hold = await this.requireHoldById(holdId);

      return {
        holdToken: dto.holdToken,
        ...this.publicHoldView(hold),
      };
    } catch (error) {
      this.rethrowReservationConstraint(error);
    }
  }

  async getHold(holdToken: string) {
    const publicTokenHash = hashPublicToken(holdToken);

    await this.withTransaction(async (client) => {
      await this.expireHoldByHash(client, publicTokenHash);
    });

    const hold = await this.requireHoldByHash(publicTokenHash);
    return this.publicHoldView(hold);
  }

  async cancelHold(holdToken: string) {
    const publicTokenHash = hashPublicToken(holdToken);
    const holdId = await this.withTransaction(async (client) => {
      const result = await client.query<HoldRow>(
        `
          SELECT
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            event_id AS "eventId",
            fee_rule_id AS "feeRuleId",
            public_token_hash AS "publicTokenHash",
            idempotency_key AS "idempotencyKey",
            request_hash AS "requestHash",
            status,
            party_size AS "partySize",
            amount_cents AS "amountCents",
            platform_fee_basis_points AS "platformFeeBasisPoints",
            platform_fee_cents AS "platformFeeCents",
            merchant_gross_cents AS "merchantGrossCents",
            currency,
            version,
            expires_at AS "expiresAt",
            converted_at AS "convertedAt",
            cancelled_at AS "cancelledAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM reservation_holds
          WHERE public_token_hash = $1
          LIMIT 1
          FOR UPDATE
        `,
        [publicTokenHash],
      );
      const hold = result.rows[0];

      if (!hold) {
        throw new NotFoundException({
          code: 'RESERVATION_HOLD_NOT_FOUND',
          message: 'Hold di prenotazione non trovato.',
        });
      }

      if (hold.status === 'ACTIVE' && hold.expiresAt.getTime() <= Date.now()) {
        await this.expireLockedHold(client, hold);
        return hold.id;
      }

      if (hold.status === 'CONVERTED') {
        throw new ConflictException({
          code: 'RESERVATION_HOLD_ALREADY_CONVERTED',
          message: 'L’hold è già stato convertito in prenotazione.',
        });
      }

      if (hold.status !== 'ACTIVE') {
        return hold.id;
      }

      await client.query(
        `
          UPDATE reservation_table_assignments
          SET
            status = 'RELEASED',
            active_event_table_key = NULL,
            released_at = NOW(),
            release_reason = 'CUSTOMER_CANCELLED',
            version = version + 1,
            updated_at = NOW()
          WHERE hold_id = $1
            AND status = 'ACTIVE'
        `,
        [hold.id],
      );

      await client.query(
        `
          UPDATE reservation_holds
          SET
            status = 'CANCELLED',
            cancelled_at = NOW(),
            version = version + 1,
            updated_at = NOW()
          WHERE id = $1
        `,
        [hold.id],
      );

      await this.recordChange(client, {
        organizationId: hold.organizationId,
        action: 'reservation_hold.cancelled',
        entityType: 'reservation_hold',
        entityId: hold.id,
        topic: 'reservations.hold.cancelled',
        aggregateType: 'reservation_hold',
        aggregateId: hold.id,
        payload: {
          holdId: hold.id,
          eventId: hold.eventId,
          locationId: hold.locationId,
        },
      });

      return hold.id;
    });

    const hold = await this.requireHoldById(holdId);
    return this.publicHoldView(hold);
  }

  private async loadPublicEvent(
    executor: Pick<PoolClient, 'query'>,
    slug: string,
  ): Promise<EventRow | null> {
    const result = await executor.query<EventRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          title,
          slug,
          timezone,
          status,
          starts_at AS "startsAt",
          booking_opens_at AS "bookingOpensAt",
          booking_closes_at AS "bookingClosesAt",
          booking_amount_cents AS "bookingAmountCents",
          capacity,
          currency
        FROM events
        WHERE slug = $1
          AND status IN ('PUBLISHED', 'SOLD_OUT')
        LIMIT 1
      `,
      [slug],
    );

    return result.rows[0] ?? null;
  }

  private async loadAndLockPublicEvent(
    client: PoolClient,
    slug: string,
  ): Promise<EventRow | null> {
    const result = await client.query<EventRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          title,
          slug,
          timezone,
          status,
          starts_at AS "startsAt",
          booking_opens_at AS "bookingOpensAt",
          booking_closes_at AS "bookingClosesAt",
          booking_amount_cents AS "bookingAmountCents",
          capacity,
          currency
        FROM events
        WHERE slug = $1
          AND status IN ('PUBLISHED', 'SOLD_OUT')
        LIMIT 1
        FOR UPDATE
      `,
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
      `
        SELECT
          min_party_size AS "minPartySize",
          max_party_size AS "maxPartySize",
          hold_minutes AS "holdMinutes",
          require_phone AS "requirePhone"
        FROM event_booking_rules
        WHERE organization_id = $1
          AND event_id = $2
        LIMIT 1
      `,
      [organizationId, eventId],
    );

    return result.rows[0] ?? null;
  }

  private async occupiedCapacity(
    executor: Pick<PoolClient, 'query'>,
    eventId: string,
  ): Promise<OccupancyRow> {
    const result = await executor.query<OccupancyRow>(
      `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN rta.hold_id IS NOT NULL
                  AND h.status = 'ACTIVE'
                  AND h.expires_at > NOW()
                  THEN h.party_size
                WHEN rta.reservation_id IS NOT NULL
                  AND r.status IN (
                    'PENDING_PAYMENT',
                    'CONFIRMED',
                    'CHECKED_IN',
                    'SEATED'
                  )
                  THEN r.party_size
                ELSE 0
              END
            ),
            0
          )::int AS "occupiedCapacity"
        FROM reservation_table_assignments rta
        LEFT JOIN reservation_holds h
          ON h.id = rta.hold_id
        LEFT JOIN reservations r
          ON r.id = rta.reservation_id
        WHERE rta.event_id = $1
          AND rta.status = 'ACTIVE'
      `,
      [eventId],
    );

    return result.rows[0] ?? { occupiedCapacity: 0 };
  }

  private async resolveFeeRule(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<FeeRuleRow | null> {
    const result = await client.query<FeeRuleRow>(
      `
        SELECT
          id,
          basis_points AS "basisPoints"
        FROM platform_fee_rules
        WHERE active = TRUE
          AND effective_from <= NOW()
          AND (effective_to IS NULL OR effective_to > NOW())
          AND (
            (
              scope = 'EVENT'
              AND organization_id = $1
              AND event_id = $2
            )
            OR
            (
              scope = 'ORGANIZATION'
              AND organization_id = $1
              AND event_id IS NULL
            )
            OR
            (
              scope = 'GLOBAL'
              AND organization_id IS NULL
              AND event_id IS NULL
            )
          )
        ORDER BY
          CASE scope
            WHEN 'EVENT' THEN 1
            WHEN 'ORGANIZATION' THEN 2
            ELSE 3
          END,
          effective_from DESC,
          created_at DESC
        LIMIT 1
      `,
      [organizationId, eventId],
    );

    return result.rows[0] ?? null;
  }

  private async expireEventHolds(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<void> {
    const result = await client.query<ExpiredHoldRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          event_id AS "eventId"
        FROM reservation_holds
        WHERE organization_id = $1
          AND event_id = $2
          AND status = 'ACTIVE'
          AND expires_at <= NOW()
        FOR UPDATE
      `,
      [organizationId, eventId],
    );

    for (const hold of result.rows) {
      await this.expireLockedHold(client, hold);
    }
  }

  private async expireHoldByHash(
    client: PoolClient,
    publicTokenHash: string,
  ): Promise<void> {
    const result = await client.query<HoldRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          event_id AS "eventId",
          fee_rule_id AS "feeRuleId",
          public_token_hash AS "publicTokenHash",
          idempotency_key AS "idempotencyKey",
          request_hash AS "requestHash",
          status,
          party_size AS "partySize",
          amount_cents AS "amountCents",
          platform_fee_basis_points AS "platformFeeBasisPoints",
          platform_fee_cents AS "platformFeeCents",
          merchant_gross_cents AS "merchantGrossCents",
          currency,
          version,
          expires_at AS "expiresAt",
          converted_at AS "convertedAt",
          cancelled_at AS "cancelledAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM reservation_holds
        WHERE public_token_hash = $1
        LIMIT 1
        FOR UPDATE
      `,
      [publicTokenHash],
    );
    const hold = result.rows[0];

    if (
      hold &&
      hold.status === 'ACTIVE' &&
      hold.expiresAt.getTime() <= Date.now()
    ) {
      await this.expireLockedHold(client, hold);
    }
  }

  private async expireLockedHold(
    client: PoolClient,
    hold: {
      id: string;
      organizationId: string;
      locationId: string;
      eventId: string;
    },
  ): Promise<void> {
    await client.query(
      `
        UPDATE reservation_table_assignments
        SET
          status = 'RELEASED',
          active_event_table_key = NULL,
          released_at = NOW(),
          release_reason = 'HOLD_EXPIRED',
          version = version + 1,
          updated_at = NOW()
        WHERE hold_id = $1
          AND status = 'ACTIVE'
      `,
      [hold.id],
    );

    const update = await client.query(
      `
        UPDATE reservation_holds
        SET
          status = 'EXPIRED',
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1
          AND status = 'ACTIVE'
        RETURNING id
      `,
      [hold.id],
    );

    if (update.rowCount === 0) {
      return;
    }

    await this.recordChange(client, {
      organizationId: hold.organizationId,
      action: 'reservation_hold.expired',
      entityType: 'reservation_hold',
      entityId: hold.id,
      topic: 'reservations.hold.expired',
      aggregateType: 'reservation_hold',
      aggregateId: hold.id,
      payload: {
        holdId: hold.id,
        eventId: hold.eventId,
        locationId: hold.locationId,
      },
    });
  }

  private async requireHoldByHash(
    publicTokenHash: string,
  ): Promise<HoldViewRow> {
    const result = await this.database.pool.query<HoldViewRow>(
      `
        SELECT ${HOLD_VIEW_COLUMNS}
        FROM reservation_holds h
        JOIN events e
          ON e.id = h.event_id
        LEFT JOIN reservation_table_assignments rta
          ON rta.hold_id = h.id
        LEFT JOIN dining_tables dt
          ON dt.id = rta.dining_table_id
        WHERE h.public_token_hash = $1
        LIMIT 1
      `,
      [publicTokenHash],
    );
    const hold = result.rows[0];

    if (!hold) {
      throw new NotFoundException({
        code: 'RESERVATION_HOLD_NOT_FOUND',
        message: 'Hold di prenotazione non trovato.',
      });
    }

    return hold;
  }

  private async requireHoldById(holdId: string): Promise<HoldViewRow> {
    const result = await this.database.pool.query<HoldViewRow>(
      `
        SELECT ${HOLD_VIEW_COLUMNS}
        FROM reservation_holds h
        JOIN events e
          ON e.id = h.event_id
        LEFT JOIN reservation_table_assignments rta
          ON rta.hold_id = h.id
        LEFT JOIN dining_tables dt
          ON dt.id = rta.dining_table_id
        WHERE h.id = $1
        LIMIT 1
      `,
      [holdId],
    );
    const hold = result.rows[0];

    if (!hold) {
      throw new NotFoundException({
        code: 'RESERVATION_HOLD_NOT_FOUND',
        message: 'Hold di prenotazione non trovato.',
      });
    }

    return hold;
  }

  private publicHoldView(hold: HoldViewRow) {
    return {
      id: hold.id,
      status: hold.status,
      partySize: hold.partySize,
      amountCents: hold.amountCents,
      platformFeeCents: hold.platformFeeCents,
      merchantGrossCents: hold.merchantGrossCents,
      currency: hold.currency,
      expiresAt: hold.expiresAt,
      event: {
        slug: hold.eventSlug,
        title: hold.eventTitle,
        startsAt: hold.eventStartsAt,
      },
      table: hold.diningTableId
        ? {
            id: hold.diningTableId,
            name: hold.tableName,
            capacity: hold.tableCapacity,
          }
        : null,
    };
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
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO audit_events (
          id,
          organization_id,
          actor_user_id,
          action,
          entity_type,
          entity_id,
          payload
        )
        VALUES ($1,$2,NULL,$3,$4,$5,$6::jsonb)
      `,
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
      `
        INSERT INTO outbox_events (
          id,
          topic,
          aggregate_type,
          aggregate_id,
          payload
        )
        VALUES ($1,$2,$3,$4,$5::jsonb)
      `,
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

  private rethrowReservationConstraint(error: unknown): never {
    if (this.isUniqueViolation(error)) {
      throw new ConflictException({
        code: 'RESERVATION_TABLE_ALREADY_HELD',
        message:
          'Il tavolo è stato appena occupato da un’altra prenotazione. Riprova.',
      });
    }

    throw error;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
