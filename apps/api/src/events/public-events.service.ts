// PHASE_9_PUBLIC_BOOKING
import { Injectable, NotFoundException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { PublicEventListQueryDto } from './dto/public-event-list-query.dto';
import {
  derivePublicBookingState,
  type PublicBookingState,
} from './public-event-policy';

interface PublicEventRow extends QueryResultRow {
  id: string;
  title: string;
  slug: string;
  description: string;
  timezone: string;
  status: 'PUBLISHED' | 'SOLD_OUT';
  coverImageUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  bookingOpensAt: Date;
  bookingClosesAt: Date;
  bookingAmountCents: number;
  currency: string;
  capacity: number;
  cancellationPolicy: string | null;
  organizerName: string;
  locationName: string;
  city: string;
  province: string | null;
  remainingCapacity: number;
}

interface PublicEventDetailRow extends PublicEventRow {
  minPartySize: number;
  maxPartySize: number;
  holdMinutes: number;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
  requirePhone: boolean;
  tableCount: number;
  totalTableCapacity: number;
}

interface CountRow extends QueryResultRow {
  total: number;
}

const ACTIVE_OCCUPANCY_CTE = `
  WITH active_occupancy AS (
    SELECT
      rta.event_id,
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
      )::int AS occupied_capacity
    FROM reservation_table_assignments rta
    LEFT JOIN reservation_holds h
      ON h.id = rta.hold_id
    LEFT JOIN reservations r
      ON r.id = rta.reservation_id
    WHERE rta.status = 'ACTIVE'
    GROUP BY rta.event_id
  )
`;

@Injectable()
export class PublicEventsService {
  constructor(private readonly database: DatabaseService) {}

  async list(query: PublicEventListQueryDto) {
    const q = query.q?.trim() || null;
    const city = query.city?.trim() || null;
    const page = query.page;
    const pageSize = query.pageSize;
    const offset = (page - 1) * pageSize;

    const [countResult, itemsResult] = await Promise.all([
      this.database.pool.query<CountRow>(
        `
          SELECT COUNT(*)::int AS total
          FROM events e
          JOIN locations l
            ON l.id = e.location_id
          JOIN merchants m
            ON m.id = l.merchant_id
          WHERE e.status IN ('PUBLISHED', 'SOLD_OUT')
            AND e.ends_at > NOW()
            AND (
              $1::text IS NULL
              OR e.title ILIKE '%' || $1 || '%'
              OR e.description ILIKE '%' || $1 || '%'
              OR COALESCE(m.trade_name, m.legal_name)
                ILIKE '%' || $1 || '%'
            )
            AND (
              $2::text IS NULL
              OR l.city ILIKE '%' || $2 || '%'
            )
        `,
        [q, city],
      ),
      this.database.pool.query<PublicEventRow>(
        `
          ${ACTIVE_OCCUPANCY_CTE}
          SELECT
            e.id,
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
            COALESCE(m.trade_name, m.legal_name) AS "organizerName",
            l.name AS "locationName",
            l.city,
            l.province,
            GREATEST(
              e.capacity - COALESCE(ao.occupied_capacity, 0),
              0
            )::int AS "remainingCapacity"
          FROM events e
          JOIN locations l
            ON l.id = e.location_id
          JOIN merchants m
            ON m.id = l.merchant_id
          LEFT JOIN active_occupancy ao
            ON ao.event_id = e.id
          WHERE e.status IN ('PUBLISHED', 'SOLD_OUT')
            AND e.ends_at > NOW()
            AND (
              $1::text IS NULL
              OR e.title ILIKE '%' || $1 || '%'
              OR e.description ILIKE '%' || $1 || '%'
              OR COALESCE(m.trade_name, m.legal_name)
                ILIKE '%' || $1 || '%'
            )
            AND (
              $2::text IS NULL
              OR l.city ILIKE '%' || $2 || '%'
            )
          ORDER BY e.starts_at ASC, e.id ASC
          LIMIT $3
          OFFSET $4
        `,
        [q, city, pageSize, offset],
      ),
    ]);

    return {
      items: itemsResult.rows.map((row) => this.publicEventView(row)),
      total: countResult.rows[0]?.total ?? 0,
      page,
      pageSize,
    };
  }

  async detail(slugInput: string) {
    const slug = slugInput.trim().toLowerCase();
    const result = await this.database.pool.query<PublicEventDetailRow>(
      `
        ${ACTIVE_OCCUPANCY_CTE},
        event_inventory AS (
          SELECT
            event_id,
            COUNT(*) FILTER (WHERE enabled = TRUE)::int AS table_count,
            COALESCE(
              SUM(capacity_snapshot) FILTER (WHERE enabled = TRUE),
              0
            )::int AS total_table_capacity
          FROM event_table_inventory
          GROUP BY event_id
        )
        SELECT
          e.id,
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
          COALESCE(m.trade_name, m.legal_name) AS "organizerName",
          l.name AS "locationName",
          l.city,
          l.province,
          GREATEST(
            e.capacity - COALESCE(ao.occupied_capacity, 0),
            0
          )::int AS "remainingCapacity",
          br.min_party_size AS "minPartySize",
          br.max_party_size AS "maxPartySize",
          br.hold_minutes AS "holdMinutes",
          br.booking_cutoff_minutes AS "bookingCutoffMinutes",
          br.cancellation_cutoff_minutes AS
            "cancellationCutoffMinutes",
          br.require_phone AS "requirePhone",
          COALESCE(ei.table_count, 0)::int AS "tableCount",
          COALESCE(ei.total_table_capacity, 0)::int AS
            "totalTableCapacity"
        FROM events e
        JOIN locations l
          ON l.id = e.location_id
        JOIN merchants m
          ON m.id = l.merchant_id
        JOIN event_booking_rules br
          ON br.event_id = e.id
        LEFT JOIN active_occupancy ao
          ON ao.event_id = e.id
        LEFT JOIN event_inventory ei
          ON ei.event_id = e.id
        WHERE e.slug = $1
          AND e.status IN ('PUBLISHED', 'SOLD_OUT')
        LIMIT 1
      `,
      [slug],
    );
    const event = result.rows[0];

    if (!event) {
      throw new NotFoundException({
        code: 'PUBLIC_EVENT_NOT_FOUND',
        message: 'Evento pubblico non trovato.',
      });
    }

    return {
      ...this.publicEventView(event),
      cancellationPolicy: event.cancellationPolicy,
      bookingRules: {
        minPartySize: event.minPartySize,
        maxPartySize: event.maxPartySize,
        holdMinutes: event.holdMinutes,
        bookingCutoffMinutes: event.bookingCutoffMinutes,
        cancellationCutoffMinutes: event.cancellationCutoffMinutes,
        requirePhone: event.requirePhone,
      },
      inventory: {
        tableCount: event.tableCount,
        totalTableCapacity: event.totalTableCapacity,
        remainingCapacity: event.remainingCapacity,
      },
    };
  }

  private publicEventView(row: PublicEventRow) {
    const bookingState: PublicBookingState = derivePublicBookingState({
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      bookingOpensAt: row.bookingOpensAt,
      bookingClosesAt: row.bookingClosesAt,
      remainingCapacity: row.remainingCapacity,
    });

    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description,
      timezone: row.timezone,
      status: row.status,
      bookingState,
      coverImageUrl: row.coverImageUrl,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      bookingOpensAt: row.bookingOpensAt,
      bookingClosesAt: row.bookingClosesAt,
      bookingAmountCents: row.bookingAmountCents,
      currency: row.currency,
      capacity: row.capacity,
      remainingCapacity: row.remainingCapacity,
      organizer: {
        name: row.organizerName,
      },
      location: {
        name: row.locationName,
        city: row.city,
        province: row.province,
      },
    };
  }
}
