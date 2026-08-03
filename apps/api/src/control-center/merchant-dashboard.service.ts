import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { LocationAccessService } from '../auth/location-access.service';
import { assertOrganizationScope } from '../auth/tenant-scope';

interface DashboardLocationRow extends QueryResultRow {
  id: string;
  name: string;
  timezone: string;
  city: string;
}

interface DashboardMetricsRow extends QueryResultRow {
  events: number;
  publishedEvents: number;
  upcomingEvents: number;
  reservations: number;
  confirmedGuests: number;
  refundPending: number;
  bookingDepositsCents: string;
  posOrders: number;
  posSalesCents: string;
}

@Injectable()
export class MerchantDashboardService {
  constructor(
    private readonly database: DatabaseService,
    private readonly locationAccess: LocationAccessService,
  ) {}

  async overview(auth: AuthContext, requestedLocationId?: string) {
    const organizationId = assertOrganizationScope(auth);
    const locations = await this.accessibleLocations(auth, organizationId);

    let selectedLocation: DashboardLocationRow | null = null;
    let locationIds = locations.map((location) => location.id);

    if (requestedLocationId) {
      await this.locationAccess.assert(auth, requestedLocationId);
      selectedLocation =
        locations.find((location) => location.id === requestedLocationId) ??
        null;
      locationIds = [requestedLocationId];
    }

    if (locationIds.length === 0) {
      return this.emptyOverview(locations, selectedLocation);
    }

    const [metricsResult, eventsResult, reservationsResult] = await Promise.all([
      this.database.pool.query<DashboardMetricsRow>(
        `SELECT
           (
             SELECT COUNT(*)::int
             FROM events
             WHERE organization_id=$1
               AND location_id=ANY($2::uuid[])
               AND status<>'ARCHIVED'
           ) AS events,
           (
             SELECT COUNT(*)::int
             FROM events
             WHERE organization_id=$1
               AND location_id=ANY($2::uuid[])
               AND status IN ('PUBLISHED','SOLD_OUT')
           ) AS "publishedEvents",
           (
             SELECT COUNT(*)::int
             FROM events
             WHERE organization_id=$1
               AND location_id=ANY($2::uuid[])
               AND starts_at>NOW()
               AND status IN ('PUBLISHED','SOLD_OUT')
           ) AS "upcomingEvents",
           (
             SELECT COUNT(*)::int
             FROM reservations
             WHERE organization_id=$1
               AND location_id=ANY($2::uuid[])
           ) AS reservations,
           COALESCE((
             SELECT SUM(party_size)::int
             FROM reservations
             WHERE organization_id=$1
               AND location_id=ANY($2::uuid[])
               AND status IN ('CONFIRMED','CHECKED_IN','SEATED','COMPLETED')
           ),0) AS "confirmedGuests",
           (
             SELECT COUNT(*)::int
             FROM reservations
             WHERE organization_id=$1
               AND location_id=ANY($2::uuid[])
               AND status='REFUND_PENDING'
           ) AS "refundPending",
           COALESCE((
             SELECT SUM(amount_cents)::text
             FROM reservation_payments
             WHERE organization_id=$1
               AND location_id=ANY($2::uuid[])
               AND status='PAID'
           ),'0') AS "bookingDepositsCents",
           (
             SELECT COUNT(*)::int
             FROM orders
             WHERE organization_id=$1
               AND location_id=ANY($2::uuid[])
               AND status='PAID'
           ) AS "posOrders",
           COALESCE((
             SELECT SUM(amount_cents)::text
             FROM payment_transactions
             WHERE organization_id=$1
               AND location_id=ANY($2::uuid[])
               AND status='CAPTURED'
           ),'0') AS "posSalesCents"`,
        [organizationId, locationIds],
      ),
      this.database.pool.query(
        `SELECT
           e.id,e.organization_id AS "organizationId",e.location_id AS "locationId",
           e.title,e.slug,e.description,e.timezone,e.status,
           e.cover_image_url AS "coverImageUrl",e.starts_at AS "startsAt",
           e.ends_at AS "endsAt",e.booking_opens_at AS "bookingOpensAt",
           e.booking_closes_at AS "bookingClosesAt",
           e.booking_amount_cents AS "bookingAmountCents",e.currency,e.capacity,
           e.cancellation_policy AS "cancellationPolicy",e.version,
           e.created_at AS "createdAt",e.updated_at AS "updatedAt",
           l.name AS "locationName"
         FROM events e
         JOIN locations l ON l.id=e.location_id
         WHERE e.organization_id=$1
           AND e.location_id=ANY($2::uuid[])
           AND e.status<>'ARCHIVED'
         ORDER BY e.starts_at DESC
         LIMIT 6`,
        [organizationId, locationIds],
      ),
      this.database.pool.query(
        `SELECT
           r.id,r.event_id AS "eventId",r.confirmation_code AS "confirmationCode",
           r.status,r.customer_name AS "customerName",r.party_size AS "partySize",
           r.amount_cents AS "amountCents",r.currency,r.version,
           r.created_at AS "createdAt",e.title AS "eventTitle",
           l.name AS "locationName",dt.name AS "tableName"
         FROM reservations r
         JOIN events e ON e.id=r.event_id
         JOIN locations l ON l.id=r.location_id
         LEFT JOIN reservation_table_assignments rta ON rta.reservation_id=r.id
         LEFT JOIN dining_tables dt ON dt.id=rta.dining_table_id
         WHERE r.organization_id=$1
           AND r.location_id=ANY($2::uuid[])
         ORDER BY r.created_at DESC
         LIMIT 7`,
        [organizationId, locationIds],
      ),
    ]);

    return {
      scope: {
        kind: selectedLocation ? ('LOCATION' as const) : ('ALL' as const),
        location: selectedLocation,
        locations,
      },
      metrics: metricsResult.rows[0] ?? this.emptyMetrics(),
      recentEvents: eventsResult.rows,
      recentReservations: reservationsResult.rows,
    };
  }

  private async accessibleLocations(
    auth: AuthContext,
    organizationId: string,
  ): Promise<DashboardLocationRow[]> {
    const globallyScoped = auth.role === 'OWNER' || auth.role === 'ADMIN';
    const result = await this.database.pool.query<DashboardLocationRow>(
      `SELECT l.id,l.name,l.timezone,l.city
       FROM locations l
       LEFT JOIN location_lifecycle ll ON ll.location_id=l.id
       LEFT JOIN organization_membership_locations oml
         ON oml.organization_id=l.organization_id
        AND oml.location_id=l.id
        AND oml.membership_id=$2
        AND oml.active=TRUE
       WHERE l.organization_id=$1
         AND l.status='ACTIVE'
         AND COALESCE(ll.lifecycle_status::text,l.status::text)='ACTIVE'
         AND ($3::boolean OR oml.id IS NOT NULL)
       ORDER BY l.name`,
      [organizationId, auth.membershipId, globallyScoped],
    );
    return result.rows;
  }

  private emptyOverview(
    locations: DashboardLocationRow[],
    selectedLocation: DashboardLocationRow | null,
  ) {
    return {
      scope: {
        kind: selectedLocation ? ('LOCATION' as const) : ('ALL' as const),
        location: selectedLocation,
        locations,
      },
      metrics: this.emptyMetrics(),
      recentEvents: [],
      recentReservations: [],
    };
  }

  private emptyMetrics(): DashboardMetricsRow {
    return {
      events: 0,
      publishedEvents: 0,
      upcomingEvents: 0,
      reservations: 0,
      confirmedGuests: 0,
      refundPending: 0,
      bookingDepositsCents: '0',
      posOrders: 0,
      posSalesCents: '0',
    };
  }
}
