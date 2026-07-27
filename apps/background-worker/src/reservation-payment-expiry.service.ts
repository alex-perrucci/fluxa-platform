// PHASE_5_RESERVATION_CONVERSION
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';

interface ExpiredReservationRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
}

@Injectable()
export class ReservationPaymentExpiryService {
  constructor(private readonly database: DatabaseService) {}

  async expireAvailable(limit = 200): Promise<number> {
    return this.withTransaction(async (client) => {
      const result = await client.query<ExpiredReservationRow>(
        `
          SELECT
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            event_id AS "eventId"
          FROM reservations
          WHERE status = 'PENDING_PAYMENT'
            AND payment_expires_at <= NOW()
          ORDER BY payment_expires_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        `,
        [limit],
      );

      for (const reservation of result.rows) {
        await client.query(
          `
            UPDATE reservation_table_assignments
            SET
              status = 'RELEASED',
              active_event_table_key = NULL,
              released_at = NOW(),
              release_reason = 'PAYMENT_TIMEOUT',
              version = version + 1,
              updated_at = NOW()
            WHERE reservation_id = $1
              AND status = 'ACTIVE'
          `,
          [reservation.id],
        );

        const update = await client.query(
          `
            UPDATE reservations
            SET
              status = 'EXPIRED',
              payment_expires_at = NULL,
              version = version + 1,
              updated_at = NOW()
            WHERE id = $1
              AND status = 'PENDING_PAYMENT'
            RETURNING id
          `,
          [reservation.id],
        );

        if (update.rowCount === 0) {
          continue;
        }

        const payload = {
          organizationId: reservation.organizationId,
          reservationId: reservation.id,
          eventId: reservation.eventId,
          locationId: reservation.locationId,
        };

        await client.query(
          `
            INSERT INTO reservation_status_history (
              id,
              organization_id,
              location_id,
              reservation_id,
              from_status,
              to_status,
              changed_by_user_id,
              reason,
              metadata
            )
            VALUES (
              $1,$2,$3,$4,'PENDING_PAYMENT','EXPIRED',
              NULL,'PAYMENT_TIMEOUT',$5::jsonb
            )
          `,
          [
            randomUUID(),
            reservation.organizationId,
            reservation.locationId,
            reservation.id,
            JSON.stringify(payload),
          ],
        );

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
            VALUES (
              $1,$2,NULL,'reservation.payment_expired',
              'reservation',$3,$4::jsonb
            )
          `,
          [
            randomUUID(),
            reservation.organizationId,
            reservation.id,
            JSON.stringify(payload),
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
            VALUES (
              $1,'reservations.reservation.expired',
              'reservation',$2,$3::jsonb
            )
          `,
          [randomUUID(), reservation.id, JSON.stringify(payload)],
        );
      }

      return result.rows.length;
    });
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
}
