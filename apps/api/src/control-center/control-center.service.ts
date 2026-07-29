// PHASE_10_RESERVATION_OPERATIONS
import { Injectable, NotFoundException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { MerchantReservationListQueryDto } from './dto/merchant-reservation-list-query.dto';
import type { ReservationFeedQueryDto } from './dto/reservation-feed-query.dto';

interface LocationRow extends QueryResultRow {
  id: string;
  name: string;
  timezone: string;
}

interface OverviewMetricsRow extends QueryResultRow {
  events: number;
  publishedEvents: number;
  upcomingEvents: number;
  reservations: number;
  confirmedGuests: number;
  refundPending: number;
  paidVolumeCents: string;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface FeedRow extends QueryResultRow {
  id: string;
  topic: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export type ControlCenterReservationStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'NO_SHOW'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export interface ReservationDetailRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
  confirmationCode: string;
  status: ControlCenterReservationStatus;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerNote: string | null;
  partySize: number;
  amountCents: number;
  platformFeeCents: number;
  providerFeeCents: number;
  merchantNetCents: number;
  refundedCents: number;
  currency: string;
  version: number;
  confirmedAt: Date | null;
  checkedInAt: Date | null;
  seatedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  noShowAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  eventTitle: string;
  eventSlug: string;
  eventStartsAt: Date;
  eventEndsAt: Date;
  locationName: string;
  timezone: string;
  tableId: string | null;
  tableCode: string | null;
  tableName: string | null;
  tableCapacity: number | null;
  areaName: string | null;
  tableSessionId: string | null;
  tableSessionStatus: 'OPEN' | 'CLOSED' | 'CANCELLED' | null;
  tableSessionGuestCount: number | null;
  tableSessionVersion: number | null;
  tableSessionOpenedAt: Date | null;
  tableSessionClosedAt: Date | null;
  orderCount: number;
  orderTotalCents: number;
}

export interface ReservationHistoryRow extends QueryResultRow {
  fromStatus: ControlCenterReservationStatus | null;
  toStatus: ControlCenterReservationStatus;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ReservationDetailView extends ReservationDetailRow {
  history: ReservationHistoryRow[];
}

@Injectable()
export class ControlCenterService {
  constructor(private readonly database: DatabaseService) {}

  async merchantOverview(auth: AuthContext, locationId: string) {
    const organizationId = assertOrganizationScope(auth);
    const location = await this.requireLocation(organizationId, locationId);

    const [metricsResult, eventsResult, reservationsResult] = await Promise.all(
      [
        this.database.pool.query<OverviewMetricsRow>(
          `
            SELECT
              (
                SELECT COUNT(*)::int
                FROM events
                WHERE organization_id = $1
                  AND location_id = $2
                  AND status <> 'ARCHIVED'
              ) AS events,
              (
                SELECT COUNT(*)::int
                FROM events
                WHERE organization_id = $1
                  AND location_id = $2
                  AND status IN ('PUBLISHED','SOLD_OUT')
              ) AS "publishedEvents",
              (
                SELECT COUNT(*)::int
                FROM events
                WHERE organization_id = $1
                  AND location_id = $2
                  AND starts_at > NOW()
                  AND status IN ('PUBLISHED','SOLD_OUT')
              ) AS "upcomingEvents",
              (
                SELECT COUNT(*)::int
                FROM reservations
                WHERE organization_id = $1
                  AND location_id = $2
              ) AS reservations,
              COALESCE(
                (
                  SELECT SUM(party_size)::int
                  FROM reservations
                  WHERE organization_id = $1
                    AND location_id = $2
                    AND status IN (
                      'CONFIRMED',
                      'CHECKED_IN',
                      'SEATED',
                      'COMPLETED'
                    )
                ),
                0
              ) AS "confirmedGuests",
              (
                SELECT COUNT(*)::int
                FROM reservations
                WHERE organization_id = $1
                  AND location_id = $2
                  AND status = 'REFUND_PENDING'
              ) AS "refundPending",
              COALESCE(
                (
                  SELECT SUM(amount_cents)::text
                  FROM reservation_payments
                  WHERE organization_id = $1
                    AND location_id = $2
                    AND status = 'PAID'
                ),
                '0'
              ) AS "paidVolumeCents"
          `,
          [organizationId, locationId],
        ),
        this.database.pool.query(
          `
            SELECT
              id,
              title,
              slug,
              status,
              starts_at AS "startsAt",
              capacity,
              booking_amount_cents AS "bookingAmountCents",
              currency,
              cover_image_url AS "coverImageUrl"
            FROM events
            WHERE organization_id = $1
              AND location_id = $2
              AND status <> 'ARCHIVED'
            ORDER BY starts_at DESC
            LIMIT 6
          `,
          [organizationId, locationId],
        ),
        this.database.pool.query(
          `
            SELECT
              r.id,
              r.confirmation_code AS "confirmationCode",
              r.status,
              r.customer_name AS "customerName",
              r.party_size AS "partySize",
              r.amount_cents AS "amountCents",
              r.currency,
              r.version,
              r.created_at AS "createdAt",
              e.title AS "eventTitle",
              dt.name AS "tableName"
            FROM reservations r
            JOIN events e ON e.id = r.event_id
            LEFT JOIN reservation_table_assignments rta
              ON rta.reservation_id = r.id
            LEFT JOIN dining_tables dt ON dt.id = rta.dining_table_id
            WHERE r.organization_id = $1
              AND r.location_id = $2
            ORDER BY r.created_at DESC
            LIMIT 7
          `,
          [organizationId, locationId],
        ),
      ],
    );

    return {
      location,
      metrics: metricsResult.rows[0] ?? {
        events: 0,
        publishedEvents: 0,
        upcomingEvents: 0,
        reservations: 0,
        confirmedGuests: 0,
        refundPending: 0,
        paidVolumeCents: '0',
      },
      recentEvents: eventsResult.rows,
      recentReservations: reservationsResult.rows,
    };
  }

  async reservations(
    auth: AuthContext,
    query: MerchantReservationListQueryDto,
  ) {
    const organizationId = assertOrganizationScope(auth);
    await this.requireLocation(organizationId, query.locationId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const offset = (page - 1) * pageSize;
    const search = query.q?.trim() || null;
    const parameters = [
      organizationId,
      query.locationId,
      query.status ?? null,
      search,
      pageSize,
      offset,
    ];

    const [itemsResult, countResult] = await Promise.all([
      this.database.pool.query(
        `
          SELECT
            r.id,
            r.event_id AS "eventId",
            r.confirmation_code AS "confirmationCode",
            r.status,
            r.customer_name AS "customerName",
            r.customer_email AS "customerEmail",
            r.customer_phone AS "customerPhone",
            r.party_size AS "partySize",
            r.amount_cents AS "amountCents",
            r.platform_fee_cents AS "platformFeeCents",
            r.merchant_net_cents AS "merchantNetCents",
            r.refunded_cents AS "refundedCents",
            r.currency,
            r.version,
            r.confirmed_at AS "confirmedAt",
            r.checked_in_at AS "checkedInAt",
            r.seated_at AS "seatedAt",
            r.created_at AS "createdAt",
            e.title AS "eventTitle",
            e.starts_at AS "eventStartsAt",
            dt.id AS "tableId",
            dt.code AS "tableCode",
            dt.name AS "tableName",
            ts.id AS "tableSessionId",
            ts.status AS "tableSessionStatus"
          FROM reservations r
          JOIN events e ON e.id = r.event_id
          LEFT JOIN reservation_table_assignments rta
            ON rta.reservation_id = r.id
          LEFT JOIN dining_tables dt ON dt.id = rta.dining_table_id
          LEFT JOIN table_sessions ts ON ts.id = r.table_session_id
          WHERE r.organization_id = $1
            AND r.location_id = $2
            AND ($3::reservation_status IS NULL OR r.status = $3)
            AND (
              $4::text IS NULL
              OR r.customer_name ILIKE '%' || $4 || '%'
              OR r.customer_email ILIKE '%' || $4 || '%'
              OR r.confirmation_code ILIKE '%' || $4 || '%'
              OR e.title ILIKE '%' || $4 || '%'
            )
          ORDER BY
            CASE r.status
              WHEN 'CONFIRMED' THEN 1
              WHEN 'CHECKED_IN' THEN 2
              WHEN 'SEATED' THEN 3
              WHEN 'PENDING_PAYMENT' THEN 4
              ELSE 5
            END,
            e.starts_at ASC,
            r.created_at DESC
          LIMIT $5 OFFSET $6
        `,
        parameters,
      ),
      this.database.pool.query<CountRow>(
        `
          SELECT COUNT(*)::int AS count
          FROM reservations r
          JOIN events e ON e.id = r.event_id
          WHERE r.organization_id = $1
            AND r.location_id = $2
            AND ($3::reservation_status IS NULL OR r.status = $3)
            AND (
              $4::text IS NULL
              OR r.customer_name ILIKE '%' || $4 || '%'
              OR r.customer_email ILIKE '%' || $4 || '%'
              OR r.confirmation_code ILIKE '%' || $4 || '%'
              OR e.title ILIKE '%' || $4 || '%'
            )
        `,
        parameters.slice(0, 4),
      ),
    ]);

    return {
      items: itemsResult.rows,
      total: countResult.rows[0]?.count ?? 0,
      page,
      pageSize,
    };
  }

  async reservationDetail(
    auth: AuthContext,
    reservationId: string,
  ): Promise<ReservationDetailView> {
    const organizationId = assertOrganizationScope(auth);
    const result = await this.database.pool.query<ReservationDetailRow>(
      `
        SELECT
          r.id,
          r.organization_id AS "organizationId",
          r.location_id AS "locationId",
          r.event_id AS "eventId",
          r.confirmation_code AS "confirmationCode",
          r.status,
          r.customer_name AS "customerName",
          r.customer_email AS "customerEmail",
          r.customer_phone AS "customerPhone",
          r.customer_note AS "customerNote",
          r.party_size AS "partySize",
          r.amount_cents AS "amountCents",
          r.platform_fee_cents AS "platformFeeCents",
          r.provider_fee_cents AS "providerFeeCents",
          r.merchant_net_cents AS "merchantNetCents",
          r.refunded_cents AS "refundedCents",
          r.currency,
          r.version,
          r.confirmed_at AS "confirmedAt",
          r.checked_in_at AS "checkedInAt",
          r.seated_at AS "seatedAt",
          r.completed_at AS "completedAt",
          r.cancelled_at AS "cancelledAt",
          r.no_show_at AS "noShowAt",
          r.created_at AS "createdAt",
          r.updated_at AS "updatedAt",
          e.title AS "eventTitle",
          e.slug AS "eventSlug",
          e.starts_at AS "eventStartsAt",
          e.ends_at AS "eventEndsAt",
          l.name AS "locationName",
          l.timezone,
          dt.id AS "tableId",
          dt.code AS "tableCode",
          dt.name AS "tableName",
          dt.capacity AS "tableCapacity",
          da.name AS "areaName",
          ts.id AS "tableSessionId",
          ts.status AS "tableSessionStatus",
          ts.guest_count AS "tableSessionGuestCount",
          ts.version AS "tableSessionVersion",
          ts.opened_at AS "tableSessionOpenedAt",
          ts.closed_at AS "tableSessionClosedAt",
          COALESCE(
            (
              SELECT COUNT(*)::int
              FROM table_session_orders tso
              WHERE tso.table_session_id = ts.id
            ),
            0
          ) AS "orderCount",
          COALESCE(
            (
              SELECT SUM(o.total_cents)::int
              FROM table_session_orders tso
              JOIN orders o ON o.id = tso.order_id
              WHERE tso.table_session_id = ts.id
                AND o.status <> 'CANCELLED'
            ),
            0
          ) AS "orderTotalCents"
        FROM reservations r
        JOIN events e ON e.id = r.event_id
        JOIN locations l ON l.id = r.location_id
        LEFT JOIN reservation_table_assignments rta
          ON rta.reservation_id = r.id
        LEFT JOIN dining_tables dt ON dt.id = rta.dining_table_id
        LEFT JOIN dining_areas da ON da.id = dt.area_id
        LEFT JOIN table_sessions ts ON ts.id = r.table_session_id
        WHERE r.id = $1
          AND r.organization_id = $2
        LIMIT 1
      `,
      [reservationId, organizationId],
    );
    const reservation = result.rows[0];

    if (!reservation) {
      throw new NotFoundException({
        code: 'RESERVATION_NOT_FOUND',
        message: 'Prenotazione non trovata.',
      });
    }

    await this.requireLocation(organizationId, String(reservation.locationId));

    const historyResult = await this.database.pool.query<ReservationHistoryRow>(
      `
        SELECT
          from_status AS "fromStatus",
          to_status AS "toStatus",
          reason,
          metadata,
          created_at AS "createdAt"
        FROM reservation_status_history
        WHERE reservation_id = $1
          AND organization_id = $2
        ORDER BY created_at DESC
      `,
      [reservationId, organizationId],
    );

    const detail: ReservationDetailView = {
      ...reservation,
      history: historyResult.rows,
    };

    return detail;
  }

  async reservationFeed(auth: AuthContext, query: ReservationFeedQueryDto) {
    const organizationId = assertOrganizationScope(auth);
    await this.requireLocation(organizationId, query.locationId);

    const after = query.after ? new Date(query.after) : new Date();
    const afterId = query.afterId ?? null;

    const result = await this.database.pool.query<FeedRow>(
      `
        SELECT
          id,
          topic,
          aggregate_type AS "aggregateType",
          aggregate_id AS "aggregateId",
          payload,
          created_at AS "createdAt"
        FROM outbox_events
        WHERE topic LIKE 'reservations.%'
          AND payload ->> 'organizationId' = $1
          AND payload ->> 'locationId' = $2
          AND (
            created_at > $3
            OR (
              created_at = $3
              AND ($4::uuid IS NULL OR id > $4::uuid)
            )
          )
        ORDER BY created_at ASC, id ASC
        LIMIT $5
      `,
      [organizationId, query.locationId, after, afterId, query.limit],
    );
    const last = result.rows.at(-1);

    return {
      items: result.rows,
      cursor: {
        after: (last?.createdAt ?? after).toISOString(),
        afterId: last?.id ?? afterId,
      },
    };
  }

  private async requireLocation(
    organizationId: string,
    locationId: string,
  ): Promise<LocationRow> {
    const result = await this.database.pool.query<LocationRow>(
      `
        SELECT id, name, timezone
        FROM locations
        WHERE id = $1
          AND organization_id = $2
          AND status = 'ACTIVE'
        LIMIT 1
      `,
      [locationId, organizationId],
    );
    const location = result.rows[0];

    if (!location) {
      throw new NotFoundException({
        code: 'LOCATION_NOT_FOUND',
        message: 'Sede attiva non trovata.',
      });
    }

    return location;
  }
}
