// PHASE_3_EVENTS_MODULE
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
import type { CancelEventDto } from './dto/cancel-event.dto';
import type { CreateEventDto } from './dto/create-event.dto';
import type { EventBookingRulesDto } from './dto/event-booking-rules.dto';
import type { EventListQueryDto } from './dto/event-list-query.dto';
import type { ReplaceEventTablesDto } from './dto/replace-event-tables.dto';
import type { UpdateEventDto } from './dto/update-event.dto';
import {
  assertEventArchivable,
  assertEventCancellable,
  assertEventEditable,
  assertEventPublishable,
  assertInventoryFitsEvent,
  assertRulesFitCapacity,
  normalizeBookingRules,
  normalizeEventPagination,
  normalizeEventSlug,
  validateEventSchedule,
  type InventoryMetrics,
  type NormalizedBookingRules,
} from './event-policy';
import { EventsAccessService } from './events-access.service';

interface EventRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  createdByUserId: string;
  title: string;
  slug: string;
  description: string;
  timezone: string;
  status: EventStatus;
  coverImageUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  bookingOpensAt: Date;
  bookingClosesAt: Date;
  bookingAmountCents: number;
  currency: string;
  capacity: number;
  cancellationPolicy: string | null;
  version: number;
  publishedAt: Date | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface EventMediaRow extends QueryResultRow {
  id: string;
  objectKey: string;
  publicUrl: string | null;
  mimeType: string;
  sizeBytes: number;
  widthPx: number | null;
  heightPx: number | null;
  altText: string | null;
  isCover: boolean;
  sortOrder: number;
}

interface EventTableRow extends QueryResultRow {
  inventoryId: string;
  diningTableId: string;
  capacitySnapshot: number;
  enabled: boolean;
  tableCode: string;
  tableName: string;
  tableCapacity: number;
  tableStatus: 'ACTIVE' | 'INACTIVE';
  areaId: string;
  areaCode: string;
  areaName: string;
}

interface DiningTableRow extends QueryResultRow {
  id: string;
  capacity: number;
  status: 'ACTIVE' | 'INACTIVE';
}

interface BookingRulesRow extends QueryResultRow {
  id: string;
  minPartySize: number;
  maxPartySize: number;
  holdMinutes: number;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  autoAssignSmallestTable: boolean;
  allowManualAssignment: boolean;
  requirePhone: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface InventoryMetricsRow extends QueryResultRow {
  tableCount: number;
  activeTableCount: number;
  inventoryCapacity: number;
  maxTableCapacity: number;
}

const EVENT_COLUMNS = `
  e.id,
  e.organization_id AS "organizationId",
  e.location_id AS "locationId",
  e.created_by_user_id AS "createdByUserId",
  e.title,
  e.slug,
  e.description,
  e.timezone,
  e.status,
  e.cover_image_url AS "coverImageUrl",
  e.starts_at AS "startsAt",
  e.ends_at AS "endsAt",
  e.booking_opens_at AS "bookingOpensAt",
  e.booking_closes_at AS "bookingClosesAt",
  e.booking_amount_cents AS "bookingAmountCents",
  e.currency,
  e.capacity,
  e.cancellation_policy AS "cancellationPolicy",
  e.version,
  e.published_at AS "publishedAt",
  e.cancelled_at AS "cancelledAt",
  e.completed_at AS "completedAt",
  e.archived_at AS "archivedAt",
  e.created_at AS "createdAt",
  e.updated_at AS "updatedAt"
`;

@Injectable()
export class EventsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: EventsAccessService,
  ) {}

  async list(auth: AuthContext, query: EventListQueryDto) {
    const access = await this.access.assertLocation(auth, query.locationId);
    const pagination = normalizeEventPagination(query);
    const search = query.q?.trim() || null;

    const [itemsResult, countResult] = await Promise.all([
      this.database.pool.query<EventRow>(
        `
          SELECT ${EVENT_COLUMNS}
          FROM events e
          WHERE e.organization_id = $1
            AND e.location_id = $2
            AND ($3::event_status IS NULL OR e.status = $3)
            AND (
              $4::text IS NULL
              OR e.title ILIKE '%' || $4 || '%'
              OR e.slug ILIKE '%' || $4 || '%'
            )
          ORDER BY e.starts_at DESC, e.created_at DESC
          LIMIT $5 OFFSET $6
        `,
        [
          access.organizationId,
          query.locationId,
          query.status ?? null,
          search,
          pagination.pageSize,
          pagination.offset,
        ],
      ),
      this.database.pool.query<CountRow>(
        `
          SELECT COUNT(*)::int AS count
          FROM events e
          WHERE e.organization_id = $1
            AND e.location_id = $2
            AND ($3::event_status IS NULL OR e.status = $3)
            AND (
              $4::text IS NULL
              OR e.title ILIKE '%' || $4 || '%'
              OR e.slug ILIKE '%' || $4 || '%'
            )
        `,
        [access.organizationId, query.locationId, query.status ?? null, search],
      ),
    ]);

    return {
      items: itemsResult.rows,
      total: countResult.rows[0]?.count ?? 0,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async get(auth: AuthContext, eventId: string) {
    const organizationId = assertOrganizationScope(auth);
    const event = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, event.locationId);

    const [mediaResult, tablesResult, rulesResult] = await Promise.all([
      this.database.pool.query<EventMediaRow>(
        `
          SELECT
            id,
            object_key AS "objectKey",
            public_url AS "publicUrl",
            mime_type AS "mimeType",
            size_bytes AS "sizeBytes",
            width_px AS "widthPx",
            height_px AS "heightPx",
            alt_text AS "altText",
            is_cover AS "isCover",
            sort_order AS "sortOrder"
          FROM event_media
          WHERE organization_id = $1
            AND event_id = $2
          ORDER BY is_cover DESC, sort_order, created_at
        `,
        [organizationId, eventId],
      ),
      this.database.pool.query<EventTableRow>(
        `
          SELECT
            eti.id AS "inventoryId",
            eti.dining_table_id AS "diningTableId",
            eti.capacity_snapshot AS "capacitySnapshot",
            eti.enabled,
            t.code AS "tableCode",
            t.name AS "tableName",
            t.capacity AS "tableCapacity",
            t.status AS "tableStatus",
            a.id AS "areaId",
            a.code AS "areaCode",
            a.name AS "areaName"
          FROM event_table_inventory eti
          JOIN dining_tables t ON t.id = eti.dining_table_id
          JOIN dining_areas a ON a.id = t.area_id
          WHERE eti.organization_id = $1
            AND eti.event_id = $2
          ORDER BY a.sort_order, t.sort_order, t.name
        `,
        [organizationId, eventId],
      ),
      this.database.pool.query<BookingRulesRow>(
        `
          SELECT
            id,
            min_party_size AS "minPartySize",
            max_party_size AS "maxPartySize",
            hold_minutes AS "holdMinutes",
            booking_cutoff_minutes AS "bookingCutoffMinutes",
            cancellation_cutoff_minutes AS "cancellationCutoffMinutes",
            auto_assign_smallest_table AS "autoAssignSmallestTable",
            allow_manual_assignment AS "allowManualAssignment",
            require_phone AS "requirePhone",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
          FROM event_booking_rules
          WHERE organization_id = $1
            AND event_id = $2
          LIMIT 1
        `,
        [organizationId, eventId],
      ),
    ]);

    return {
      ...event,
      media: mediaResult.rows,
      tables: tablesResult.rows,
      bookingRules: rulesResult.rows[0] ?? null,
    };
  }

  async create(auth: AuthContext, dto: CreateEventDto) {
    const access = await this.access.assertLocation(auth, dto.locationId);
    const timezone = dto.timezone?.trim() || access.timezone;
    const currency = (dto.currency ?? 'EUR').trim().toUpperCase();
    const slug = normalizeEventSlug(dto.slug ?? dto.title);
    const schedule = {
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      bookingOpensAt: new Date(dto.bookingOpensAt),
      bookingClosesAt: new Date(dto.bookingClosesAt),
      bookingAmountCents: dto.bookingAmountCents,
      capacity: dto.capacity,
      timezone,
      currency,
    };
    const rules = normalizeBookingRules(dto.bookingRules);

    validateEventSchedule(schedule);
    assertRulesFitCapacity(rules, dto.capacity);

    try {
      const eventId = await this.withTransaction(async (client) => {
        const tables = await this.loadTables(
          client,
          access.organizationId,
          dto.locationId,
          dto.tableIds ?? [],
        );

        if (tables.length > 0) {
          const metrics = this.metricsFromTables(tables);
          assertInventoryFitsEvent(dto.capacity, metrics, false);
          assertRulesFitCapacity(rules, dto.capacity, metrics.maxTableCapacity);
        }

        const inserted = await client.query<EventRow>(
          `
            INSERT INTO events (
              id,
              organization_id,
              location_id,
              created_by_user_id,
              title,
              slug,
              description,
              timezone,
              cover_image_url,
              starts_at,
              ends_at,
              booking_opens_at,
              booking_closes_at,
              booking_amount_cents,
              currency,
              capacity,
              cancellation_policy
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
            )
            RETURNING
              id,
              organization_id AS "organizationId",
              location_id AS "locationId",
              created_by_user_id AS "createdByUserId",
              title,
              slug,
              description,
              timezone,
              status,
              cover_image_url AS "coverImageUrl",
              starts_at AS "startsAt",
              ends_at AS "endsAt",
              booking_opens_at AS "bookingOpensAt",
              booking_closes_at AS "bookingClosesAt",
              booking_amount_cents AS "bookingAmountCents",
              currency,
              capacity,
              cancellation_policy AS "cancellationPolicy",
              version,
              published_at AS "publishedAt",
              cancelled_at AS "cancelledAt",
              completed_at AS "completedAt",
              archived_at AS "archivedAt",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
          `,
          [
            randomUUID(),
            access.organizationId,
            dto.locationId,
            auth.userId,
            dto.title.trim(),
            slug,
            dto.description.trim(),
            timezone,
            dto.coverImageUrl?.trim() || null,
            schedule.startsAt,
            schedule.endsAt,
            schedule.bookingOpensAt,
            schedule.bookingClosesAt,
            dto.bookingAmountCents,
            currency,
            dto.capacity,
            dto.cancellationPolicy?.trim() || null,
          ],
        );

        const event = inserted.rows[0];

        if (!event) {
          throw new Error('Event insert returned no row.');
        }

        await this.insertBookingRules(
          client,
          access.organizationId,
          dto.locationId,
          event.id,
          rules,
        );
        await this.replaceTableRows(
          client,
          access.organizationId,
          dto.locationId,
          event.id,
          tables,
        );
        await this.recordChange(client, {
          organizationId: access.organizationId,
          actorUserId: auth.userId,
          action: 'event.created',
          eventId: event.id,
          topic: 'events.event.created',
          payload: {
            eventId: event.id,
            locationId: dto.locationId,
            status: event.status,
            version: event.version,
          },
        });

        return event.id;
      });

      return this.get(auth, eventId);
    } catch (error) {
      this.rethrowEventConstraint(error);
    }
  }

  async update(auth: AuthContext, eventId: string, dto: UpdateEventDto) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, current.locationId);

    try {
      await this.withTransaction(async (client) => {
        const event = await this.lockEvent(client, organizationId, eventId);
        assertEventEditable(event.status);

        const effective = {
          title: dto.title?.trim() ?? event.title,
          slug:
            dto.slug !== undefined ? normalizeEventSlug(dto.slug) : event.slug,
          description: dto.description?.trim() ?? event.description,
          timezone: dto.timezone?.trim() ?? event.timezone,
          coverImageUrl:
            dto.coverImageUrl !== undefined
              ? dto.coverImageUrl?.trim() || null
              : event.coverImageUrl,
          startsAt:
            dto.startsAt !== undefined
              ? new Date(dto.startsAt)
              : event.startsAt,
          endsAt:
            dto.endsAt !== undefined ? new Date(dto.endsAt) : event.endsAt,
          bookingOpensAt:
            dto.bookingOpensAt !== undefined
              ? new Date(dto.bookingOpensAt)
              : event.bookingOpensAt,
          bookingClosesAt:
            dto.bookingClosesAt !== undefined
              ? new Date(dto.bookingClosesAt)
              : event.bookingClosesAt,
          bookingAmountCents:
            dto.bookingAmountCents ?? event.bookingAmountCents,
          currency: (dto.currency ?? event.currency).trim().toUpperCase(),
          capacity: dto.capacity ?? event.capacity,
          cancellationPolicy:
            dto.cancellationPolicy !== undefined
              ? dto.cancellationPolicy?.trim() || null
              : event.cancellationPolicy,
        };

        validateEventSchedule(effective);

        const [metrics, rules] = await Promise.all([
          this.inventoryMetrics(client, organizationId, eventId),
          this.loadBookingRules(client, organizationId, eventId),
        ]);

        assertInventoryFitsEvent(effective.capacity, metrics, true);

        if (rules) {
          assertRulesFitCapacity(
            rules,
            effective.capacity,
            metrics.tableCount > 0 ? metrics.maxTableCapacity : undefined,
          );
        }

        const result = await client.query<EventRow>(
          `
            UPDATE events
            SET
              title = $3,
              slug = $4,
              description = $5,
              timezone = $6,
              cover_image_url = $7,
              starts_at = $8,
              ends_at = $9,
              booking_opens_at = $10,
              booking_closes_at = $11,
              booking_amount_cents = $12,
              currency = $13,
              capacity = $14,
              cancellation_policy = $15,
              version = version + 1,
              updated_at = NOW()
            WHERE id = $1
              AND organization_id = $2
            RETURNING
              id,
              organization_id AS "organizationId",
              location_id AS "locationId",
              created_by_user_id AS "createdByUserId",
              title,
              slug,
              description,
              timezone,
              status,
              cover_image_url AS "coverImageUrl",
              starts_at AS "startsAt",
              ends_at AS "endsAt",
              booking_opens_at AS "bookingOpensAt",
              booking_closes_at AS "bookingClosesAt",
              booking_amount_cents AS "bookingAmountCents",
              currency,
              capacity,
              cancellation_policy AS "cancellationPolicy",
              version,
              published_at AS "publishedAt",
              cancelled_at AS "cancelledAt",
              completed_at AS "completedAt",
              archived_at AS "archivedAt",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
          `,
          [
            eventId,
            organizationId,
            effective.title,
            effective.slug,
            effective.description,
            effective.timezone,
            effective.coverImageUrl,
            effective.startsAt,
            effective.endsAt,
            effective.bookingOpensAt,
            effective.bookingClosesAt,
            effective.bookingAmountCents,
            effective.currency,
            effective.capacity,
            effective.cancellationPolicy,
          ],
        );

        const updated = result.rows[0];

        if (!updated) {
          throw new Error('Event update returned no row.');
        }

        await this.recordChange(client, {
          organizationId,
          actorUserId: auth.userId,
          action: 'event.updated',
          eventId,
          topic: 'events.event.updated',
          payload: {
            eventId,
            locationId: event.locationId,
            status: updated.status,
            version: updated.version,
          },
        });
      });

      return this.get(auth, eventId);
    } catch (error) {
      this.rethrowEventConstraint(error);
    }
  }

  async replaceTables(
    auth: AuthContext,
    eventId: string,
    dto: ReplaceEventTablesDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, current.locationId);

    await this.withTransaction(async (client) => {
      const event = await this.lockEvent(client, organizationId, eventId);
      assertEventEditable(event.status);

      const tables = await this.loadTables(
        client,
        organizationId,
        event.locationId,
        dto.tableIds,
      );
      const rules = await this.loadBookingRules(
        client,
        organizationId,
        eventId,
      );

      if (tables.length > 0) {
        const metrics = this.metricsFromTables(tables);
        assertInventoryFitsEvent(event.capacity, metrics, false);

        if (rules) {
          assertRulesFitCapacity(
            rules,
            event.capacity,
            metrics.maxTableCapacity,
          );
        }
      }

      await this.replaceTableRows(
        client,
        organizationId,
        event.locationId,
        eventId,
        tables,
      );

      const versionResult = await client.query<{ version: number }>(
        `
          UPDATE events
          SET version = version + 1, updated_at = NOW()
          WHERE id = $1 AND organization_id = $2
          RETURNING version
        `,
        [eventId, organizationId],
      );
      const version = versionResult.rows[0]?.version;

      if (!version) {
        throw new Error('Event table update returned no version.');
      }

      await this.recordChange(client, {
        organizationId,
        actorUserId: auth.userId,
        action: 'event.tables_replaced',
        eventId,
        topic: 'events.event.tables_replaced',
        payload: {
          eventId,
          locationId: event.locationId,
          tableIds: tables.map((table) => table.id),
          version,
        },
      });
    });

    return this.get(auth, eventId);
  }

  async updateBookingRules(
    auth: AuthContext,
    eventId: string,
    dto: EventBookingRulesDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, current.locationId);
    const rules = normalizeBookingRules(dto);

    await this.withTransaction(async (client) => {
      const event = await this.lockEvent(client, organizationId, eventId);
      assertEventEditable(event.status);
      const metrics = await this.inventoryMetrics(
        client,
        organizationId,
        eventId,
      );

      assertRulesFitCapacity(
        rules,
        event.capacity,
        metrics.tableCount > 0 ? metrics.maxTableCapacity : undefined,
      );

      await this.insertBookingRules(
        client,
        organizationId,
        event.locationId,
        eventId,
        rules,
      );

      const versionResult = await client.query<{ version: number }>(
        `
          UPDATE events
          SET version = version + 1, updated_at = NOW()
          WHERE id = $1 AND organization_id = $2
          RETURNING version
        `,
        [eventId, organizationId],
      );
      const version = versionResult.rows[0]?.version;

      if (!version) {
        throw new Error('Event rules update returned no version.');
      }

      await this.recordChange(client, {
        organizationId,
        actorUserId: auth.userId,
        action: 'event.booking_rules_updated',
        eventId,
        topic: 'events.event.booking_rules_updated',
        payload: {
          eventId,
          locationId: event.locationId,
          version,
        },
      });
    });

    return this.get(auth, eventId);
  }

  async publish(auth: AuthContext, eventId: string) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, current.locationId);

    await this.withTransaction(async (client) => {
      const event = await this.lockEvent(client, organizationId, eventId);
      const [metrics, rules] = await Promise.all([
        this.inventoryMetrics(client, organizationId, eventId),
        this.loadBookingRules(client, organizationId, eventId),
      ]);

      assertEventPublishable(event, metrics, rules);

      const result = await client.query<EventRow>(
        `
          UPDATE events
          SET
            status = 'PUBLISHED',
            published_at = NOW(),
            version = version + 1,
            updated_at = NOW()
          WHERE id = $1
            AND organization_id = $2
          RETURNING
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            created_by_user_id AS "createdByUserId",
            title,
            slug,
            description,
            timezone,
            status,
            cover_image_url AS "coverImageUrl",
            starts_at AS "startsAt",
            ends_at AS "endsAt",
            booking_opens_at AS "bookingOpensAt",
            booking_closes_at AS "bookingClosesAt",
            booking_amount_cents AS "bookingAmountCents",
            currency,
            capacity,
            cancellation_policy AS "cancellationPolicy",
            version,
            published_at AS "publishedAt",
            cancelled_at AS "cancelledAt",
            completed_at AS "completedAt",
            archived_at AS "archivedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [eventId, organizationId],
      );
      const published = result.rows[0];

      if (!published) {
        throw new Error('Event publish returned no row.');
      }

      await this.recordChange(client, {
        organizationId,
        actorUserId: auth.userId,
        action: 'event.published',
        eventId,
        topic: 'events.event.published',
        payload: {
          eventId,
          locationId: event.locationId,
          slug: published.slug,
          status: published.status,
          version: published.version,
        },
      });
    });

    return this.get(auth, eventId);
  }

  async cancel(auth: AuthContext, eventId: string, dto: CancelEventDto) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, current.locationId);

    await this.withTransaction(async (client) => {
      const event = await this.lockEvent(client, organizationId, eventId);
      assertEventCancellable(event.status);

      const result = await client.query<EventRow>(
        `
          UPDATE events
          SET
            status = 'CANCELLED',
            cancelled_at = NOW(),
            version = version + 1,
            updated_at = NOW()
          WHERE id = $1
            AND organization_id = $2
          RETURNING
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            created_by_user_id AS "createdByUserId",
            title,
            slug,
            description,
            timezone,
            status,
            cover_image_url AS "coverImageUrl",
            starts_at AS "startsAt",
            ends_at AS "endsAt",
            booking_opens_at AS "bookingOpensAt",
            booking_closes_at AS "bookingClosesAt",
            booking_amount_cents AS "bookingAmountCents",
            currency,
            capacity,
            cancellation_policy AS "cancellationPolicy",
            version,
            published_at AS "publishedAt",
            cancelled_at AS "cancelledAt",
            completed_at AS "completedAt",
            archived_at AS "archivedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [eventId, organizationId],
      );
      const cancelled = result.rows[0];

      if (!cancelled) {
        throw new Error('Event cancellation returned no row.');
      }

      await this.recordChange(client, {
        organizationId,
        actorUserId: auth.userId,
        action: 'event.cancelled',
        eventId,
        topic: 'events.event.cancelled',
        payload: {
          eventId,
          locationId: event.locationId,
          reason: dto.reason.trim(),
          status: cancelled.status,
          version: cancelled.version,
        },
      });
    });

    return this.get(auth, eventId);
  }

  async archive(auth: AuthContext, eventId: string) {
    const organizationId = assertOrganizationScope(auth);
    const current = await this.requireEvent(organizationId, eventId);
    await this.access.assertLocation(auth, current.locationId);

    await this.withTransaction(async (client) => {
      const event = await this.lockEvent(client, organizationId, eventId);
      assertEventArchivable(event.status);

      const result = await client.query<EventRow>(
        `
          UPDATE events
          SET
            status = 'ARCHIVED',
            archived_at = NOW(),
            version = version + 1,
            updated_at = NOW()
          WHERE id = $1
            AND organization_id = $2
          RETURNING
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            created_by_user_id AS "createdByUserId",
            title,
            slug,
            description,
            timezone,
            status,
            cover_image_url AS "coverImageUrl",
            starts_at AS "startsAt",
            ends_at AS "endsAt",
            booking_opens_at AS "bookingOpensAt",
            booking_closes_at AS "bookingClosesAt",
            booking_amount_cents AS "bookingAmountCents",
            currency,
            capacity,
            cancellation_policy AS "cancellationPolicy",
            version,
            published_at AS "publishedAt",
            cancelled_at AS "cancelledAt",
            completed_at AS "completedAt",
            archived_at AS "archivedAt",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `,
        [eventId, organizationId],
      );
      const archived = result.rows[0];

      if (!archived) {
        throw new Error('Event archival returned no row.');
      }

      await this.recordChange(client, {
        organizationId,
        actorUserId: auth.userId,
        action: 'event.archived',
        eventId,
        topic: 'events.event.archived',
        payload: {
          eventId,
          locationId: event.locationId,
          status: archived.status,
          version: archived.version,
        },
      });
    });

    return this.get(auth, eventId);
  }

  private async requireEvent(
    organizationId: string,
    eventId: string,
  ): Promise<EventRow> {
    const result = await this.database.pool.query<EventRow>(
      `
        SELECT ${EVENT_COLUMNS}
        FROM events e
        WHERE e.id = $1
          AND e.organization_id = $2
        LIMIT 1
      `,
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

  private async lockEvent(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<EventRow> {
    const result = await client.query<EventRow>(
      `
        SELECT ${EVENT_COLUMNS}
        FROM events e
        WHERE e.id = $1
          AND e.organization_id = $2
        FOR UPDATE
      `,
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

  private async loadTables(
    client: PoolClient,
    organizationId: string,
    locationId: string,
    tableIds: string[],
  ): Promise<DiningTableRow[]> {
    if (tableIds.length === 0) {
      return [];
    }

    const uniqueIds = Array.from(new Set(tableIds));
    const result = await client.query<DiningTableRow>(
      `
        SELECT id, capacity, status
        FROM dining_tables
        WHERE organization_id = $1
          AND location_id = $2
          AND id = ANY($3::uuid[])
        FOR SHARE
      `,
      [organizationId, locationId, uniqueIds],
    );

    if (result.rows.length !== uniqueIds.length) {
      throw new NotFoundException({
        code: 'EVENT_TABLE_NOT_FOUND',
        message:
          'Uno o più tavoli non appartengono al punto vendita selezionato.',
      });
    }

    const inactive = result.rows.find((table) => table.status !== 'ACTIVE');

    if (inactive) {
      throw new ConflictException({
        code: 'EVENT_TABLE_INACTIVE',
        message: 'Uno o più tavoli selezionati non sono attivi.',
      });
    }

    return result.rows;
  }

  private metricsFromTables(tables: DiningTableRow[]): InventoryMetrics {
    return {
      tableCount: tables.length,
      activeTableCount: tables.filter((table) => table.status === 'ACTIVE')
        .length,
      inventoryCapacity: tables.reduce(
        (total, table) => total + table.capacity,
        0,
      ),
      maxTableCapacity: tables.reduce(
        (maximum, table) => Math.max(maximum, table.capacity),
        0,
      ),
    };
  }

  private async inventoryMetrics(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<InventoryMetrics> {
    const result = await client.query<InventoryMetricsRow>(
      `
        SELECT
          COUNT(*)::int AS "tableCount",
          COUNT(*) FILTER (WHERE t.status = 'ACTIVE')::int AS "activeTableCount",
          COALESCE(SUM(eti.capacity_snapshot), 0)::int AS "inventoryCapacity",
          COALESCE(MAX(eti.capacity_snapshot), 0)::int AS "maxTableCapacity"
        FROM event_table_inventory eti
        JOIN dining_tables t ON t.id = eti.dining_table_id
        WHERE eti.organization_id = $1
          AND eti.event_id = $2
          AND eti.enabled = TRUE
      `,
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

  private async replaceTableRows(
    client: PoolClient,
    organizationId: string,
    locationId: string,
    eventId: string,
    tables: DiningTableRow[],
  ): Promise<void> {
    await client.query(
      `
        DELETE FROM event_table_inventory
        WHERE organization_id = $1
          AND event_id = $2
      `,
      [organizationId, eventId],
    );

    for (const table of tables) {
      await client.query(
        `
          INSERT INTO event_table_inventory (
            id,
            organization_id,
            location_id,
            event_id,
            dining_table_id,
            capacity_snapshot,
            enabled
          )
          VALUES ($1,$2,$3,$4,$5,$6,TRUE)
        `,
        [
          randomUUID(),
          organizationId,
          locationId,
          eventId,
          table.id,
          table.capacity,
        ],
      );
    }
  }

  private async insertBookingRules(
    client: PoolClient,
    organizationId: string,
    locationId: string,
    eventId: string,
    rules: NormalizedBookingRules,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO event_booking_rules (
          id,
          organization_id,
          location_id,
          event_id,
          min_party_size,
          max_party_size,
          hold_minutes,
          booking_cutoff_minutes,
          cancellation_cutoff_minutes,
          auto_assign_smallest_table,
          allow_manual_assignment,
          require_phone
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (event_id)
        DO UPDATE SET
          min_party_size = EXCLUDED.min_party_size,
          max_party_size = EXCLUDED.max_party_size,
          hold_minutes = EXCLUDED.hold_minutes,
          booking_cutoff_minutes = EXCLUDED.booking_cutoff_minutes,
          cancellation_cutoff_minutes = EXCLUDED.cancellation_cutoff_minutes,
          auto_assign_smallest_table = EXCLUDED.auto_assign_smallest_table,
          allow_manual_assignment = EXCLUDED.allow_manual_assignment,
          require_phone = EXCLUDED.require_phone,
          updated_at = NOW()
      `,
      [
        randomUUID(),
        organizationId,
        locationId,
        eventId,
        rules.minPartySize,
        rules.maxPartySize,
        rules.holdMinutes,
        rules.bookingCutoffMinutes,
        rules.cancellationCutoffMinutes,
        rules.autoAssignSmallestTable,
        rules.allowManualAssignment,
        rules.requirePhone,
      ],
    );
  }

  private async loadBookingRules(
    client: PoolClient,
    organizationId: string,
    eventId: string,
  ): Promise<NormalizedBookingRules | null> {
    const result = await client.query<BookingRulesRow>(
      `
        SELECT
          id,
          min_party_size AS "minPartySize",
          max_party_size AS "maxPartySize",
          hold_minutes AS "holdMinutes",
          booking_cutoff_minutes AS "bookingCutoffMinutes",
          cancellation_cutoff_minutes AS "cancellationCutoffMinutes",
          auto_assign_smallest_table AS "autoAssignSmallestTable",
          allow_manual_assignment AS "allowManualAssignment",
          require_phone AS "requirePhone",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM event_booking_rules
        WHERE organization_id = $1
          AND event_id = $2
        LIMIT 1
      `,
      [organizationId, eventId],
    );
    const row = result.rows[0];

    if (!row) return null;

    return {
      minPartySize: row.minPartySize,
      maxPartySize: row.maxPartySize,
      holdMinutes: row.holdMinutes,
      bookingCutoffMinutes: row.bookingCutoffMinutes,
      cancellationCutoffMinutes: row.cancellationCutoffMinutes,
      autoAssignSmallestTable: row.autoAssignSmallestTable,
      allowManualAssignment: row.allowManualAssignment,
      requirePhone: row.requirePhone,
    };
  }

  private async recordChange(
    client: PoolClient,
    input: {
      organizationId: string;
      actorUserId: string;
      action: string;
      eventId: string;
      topic: string;
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
        VALUES ($1,$2,$3,$4,'event',$5,$6::jsonb)
      `,
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
      `
        INSERT INTO outbox_events (
          id,
          topic,
          aggregate_type,
          aggregate_id,
          payload
        )
        VALUES ($1,$2,'event',$3,$4::jsonb)
      `,
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

  private rethrowEventConstraint(error: unknown): never {
    if (this.isUniqueViolation(error)) {
      throw new ConflictException({
        code: 'EVENT_SLUG_ALREADY_EXISTS',
        message: 'Lo slug dell’evento è già utilizzato.',
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
