// PHASE_4_RESERVATION_ENGINE
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';

interface ExpiredHoldRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
}

@Injectable()
export class ReservationHoldExpiryService {
  constructor(private readonly database: DatabaseService) {}

  async expireAvailable(limit = 200): Promise<number> {
    return this.withTransaction(async (client) => {
      const result = await client.query<ExpiredHoldRow>(
        `
          SELECT
            id,
            organization_id AS "organizationId",
            location_id AS "locationId",
            event_id AS "eventId"
          FROM reservation_holds
          WHERE status = 'ACTIVE'
            AND expires_at <= NOW()
          ORDER BY expires_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        `,
        [limit],
      );

      for (const hold of result.rows) {
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
          continue;
        }

        const payload = {
          organizationId: hold.organizationId,
          holdId: hold.id,
          eventId: hold.eventId,
          locationId: hold.locationId,
        };

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
              $1,$2,NULL,'reservation_hold.expired',
              'reservation_hold',$3,$4::jsonb
            )
          `,
          [randomUUID(), hold.organizationId, hold.id, JSON.stringify(payload)],
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
              $1,'reservations.hold.expired',
              'reservation_hold',$2,$3::jsonb
            )
          `,
          [randomUUID(), hold.id, JSON.stringify(payload)],
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
