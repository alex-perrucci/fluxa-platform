// PHASE_10_RESERVATION_OPERATIONS
import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import { buildActiveTableKey } from '../hospitality/hospitality-policy';
import {
  ControlCenterService,
  type ReservationDetailView,
} from './control-center.service';
import type { ReservationOperationDto } from './dto/reservation-operation.dto';
import {
  assertReservationOperationAllowed,
  ReservationOperationAction,
  reservationOperationTopic,
  targetReservationStatus,
  type OperationalReservationStatus,
} from './reservation-operations-policy';

interface LockedReservationRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
  confirmationCode: string;
  status: OperationalReservationStatus;
  partySize: number;
  version: number;
  tableSessionId: string | null;
  diningTableId: string | null;
}

interface ExistingMutationRow extends QueryResultRow {
  action: string;
}

interface SessionStateRow extends QueryResultRow {
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
}

@Injectable()
export class ReservationOperationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly controlCenter: ControlCenterService,
  ) {}

  async apply(
    auth: AuthContext,
    reservationId: string,
    action: ReservationOperationAction,
    dto: ReservationOperationDto,
  ): Promise<ReservationDetailView> {
    const organizationId = assertOrganizationScope(auth);

    try {
      await this.withTransaction(async (client) => {
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [`reservation-operation:${reservationId}`],
        );

        const reservation = await this.lockReservation(
          client,
          organizationId,
          reservationId,
        );
        const auditAction = `reservation.operation.${action}`;
        const existingMutation = await client.query<ExistingMutationRow>(
          `
              SELECT action
              FROM audit_events
              WHERE organization_id = $1
                AND entity_type = 'reservation'
                AND entity_id = $2
                AND request_id = $3
              LIMIT 1
            `,
          [organizationId, reservationId, dto.mutationId],
        );

        if (existingMutation.rows[0]) {
          if (existingMutation.rows[0].action !== auditAction) {
            throw new ConflictException({
              code: 'RESERVATION_MUTATION_ID_REUSED',
              message:
                'Il mutationId è già stato usato per un’operazione differente.',
            });
          }

          return;
        }

        if (reservation.version !== dto.expectedVersion) {
          throw new ConflictException({
            code: 'RESERVATION_VERSION_CONFLICT',
            message:
              'La prenotazione è stata aggiornata da un altro operatore. Ricarica e riprova.',
          });
        }

        assertReservationOperationAllowed(reservation.status, action);

        let tableSessionId = reservation.tableSessionId;

        if (action === ReservationOperationAction.CHECK_IN) {
          tableSessionId = await this.openReservationTableSession(
            client,
            auth,
            reservation,
            dto.mutationId,
          );
        }

        if (action === ReservationOperationAction.COMPLETE) {
          await this.assertTableSessionClosed(
            client,
            reservation.tableSessionId,
          );
        }

        const nextStatus = targetReservationStatus(action);

        await this.updateReservation(
          client,
          reservation,
          action,
          nextStatus,
          tableSessionId,
        );

        if (
          action === ReservationOperationAction.COMPLETE ||
          action === ReservationOperationAction.NO_SHOW
        ) {
          await this.releaseEventAssignment(client, reservation, action);
        }

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
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
          `,
          [
            randomUUID(),
            reservation.organizationId,
            reservation.locationId,
            reservation.id,
            reservation.status,
            nextStatus,
            auth.userId,
            action.toUpperCase().replaceAll('-', '_'),
            JSON.stringify({
              mutationId: dto.mutationId,
              tableSessionId,
            }),
          ],
        );

        const payload = {
          organizationId: reservation.organizationId,
          locationId: reservation.locationId,
          reservationId: reservation.id,
          eventId: reservation.eventId,
          confirmationCode: reservation.confirmationCode,
          fromStatus: reservation.status,
          toStatus: nextStatus,
          tableSessionId,
          mutationId: dto.mutationId,
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
              request_id,
              payload
            )
            VALUES ($1,$2,$3,$4,'reservation',$5,$6,$7::jsonb)
          `,
          [
            randomUUID(),
            reservation.organizationId,
            auth.userId,
            auditAction,
            reservation.id,
            dto.mutationId,
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
            VALUES ($1,$2,'reservation',$3,$4::jsonb)
          `,
          [
            randomUUID(),
            reservationOperationTopic(action),
            reservation.id,
            JSON.stringify(payload),
          ],
        );
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'TABLE_ALREADY_OCCUPIED',
          message:
            'Il tavolo è già occupato da una sessione operativa. Ricarica la prenotazione.',
        });
      }

      throw error;
    }

    return this.controlCenter.reservationDetail(auth, reservationId);
  }

  private async lockReservation(
    client: PoolClient,
    organizationId: string,
    reservationId: string,
  ): Promise<LockedReservationRow> {
    const result = await client.query<LockedReservationRow>(
      `
        SELECT
          r.id,
          r.organization_id AS "organizationId",
          r.location_id AS "locationId",
          r.event_id AS "eventId",
          r.confirmation_code AS "confirmationCode",
          r.status,
          r.party_size AS "partySize",
          r.version,
          r.table_session_id AS "tableSessionId",
          rta.dining_table_id AS "diningTableId"
        FROM reservations r
        LEFT JOIN reservation_table_assignments rta
          ON rta.reservation_id = r.id
          AND rta.status = 'ACTIVE'
        WHERE r.id = $1
          AND r.organization_id = $2
        LIMIT 1
        FOR UPDATE OF r
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

    return reservation;
  }

  private async openReservationTableSession(
    client: PoolClient,
    auth: AuthContext,
    reservation: LockedReservationRow,
    mutationId: string,
  ): Promise<string> {
    if (!reservation.diningTableId) {
      throw new ConflictException({
        code: 'RESERVATION_TABLE_MISSING',
        message: 'La prenotazione non ha un tavolo assegnato.',
      });
    }

    if (reservation.tableSessionId) {
      throw new ConflictException({
        code: 'RESERVATION_ALREADY_CHECKED_IN',
        message: 'La prenotazione ha già una sessione tavolo collegata.',
      });
    }

    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [
        buildActiveTableKey(
          reservation.organizationId,
          reservation.diningTableId,
        ),
      ],
    );

    const sessionId = randomUUID();
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          reservationId: reservation.id,
          tableId: reservation.diningTableId,
          guestCount: reservation.partySize,
        }),
      )
      .digest('hex');

    await client.query(
      `
        INSERT INTO table_sessions (
          id,
          organization_id,
          location_id,
          table_id,
          device_id,
          opened_by_user_id,
          client_session_id,
          request_hash,
          status,
          guest_count,
          note,
          active_table_key,
          version
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,'OPEN',$9,$10,$11,1
        )
      `,
      [
        sessionId,
        reservation.organizationId,
        reservation.locationId,
        reservation.diningTableId,
        auth.deviceId,
        auth.userId,
        mutationId,
        requestHash,
        reservation.partySize,
        `Check-in prenotazione ${reservation.confirmationCode}`,
        buildActiveTableKey(
          reservation.organizationId,
          reservation.diningTableId,
        ),
      ],
    );

    return sessionId;
  }

  private async assertTableSessionClosed(
    client: PoolClient,
    tableSessionId: string | null,
  ): Promise<void> {
    if (!tableSessionId) {
      throw new ConflictException({
        code: 'RESERVATION_TABLE_SESSION_MISSING',
        message:
          'La prenotazione non ha una sessione tavolo operativa collegata.',
      });
    }

    const result = await client.query<SessionStateRow>(
      `
        SELECT status
        FROM table_sessions
        WHERE id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [tableSessionId],
    );
    const session = result.rows[0];

    if (!session) {
      throw new ConflictException({
        code: 'RESERVATION_TABLE_SESSION_MISSING',
        message: 'La sessione tavolo collegata non è disponibile.',
      });
    }

    if (session.status !== 'CLOSED') {
      throw new ConflictException({
        code: 'TABLE_SESSION_STILL_OPEN',
        message:
          'Chiudi prima la sessione tavolo dal POS, poi completa la prenotazione.',
      });
    }
  }

  private async updateReservation(
    client: PoolClient,
    reservation: LockedReservationRow,
    action: ReservationOperationAction,
    nextStatus: OperationalReservationStatus,
    tableSessionId: string | null,
  ): Promise<void> {
    await client.query(
      `
        UPDATE reservations
        SET
          status = $2::reservation_status,
          table_session_id = COALESCE($3, table_session_id),
          checked_in_at = CASE
            WHEN $4 = 'check-in' THEN NOW()
            ELSE checked_in_at
          END,
          seated_at = CASE
            WHEN $4 = 'seat' THEN NOW()
            ELSE seated_at
          END,
          completed_at = CASE
            WHEN $4 = 'complete' THEN NOW()
            ELSE completed_at
          END,
          no_show_at = CASE
            WHEN $4 = 'no-show' THEN NOW()
            ELSE no_show_at
          END,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1
          AND version = $5
      `,
      [reservation.id, nextStatus, tableSessionId, action, reservation.version],
    );
  }

  private async releaseEventAssignment(
    client: PoolClient,
    reservation: LockedReservationRow,
    action: ReservationOperationAction,
  ): Promise<void> {
    await client.query(
      `
        UPDATE reservation_table_assignments
        SET
          status = 'RELEASED',
          active_event_table_key = NULL,
          released_at = NOW(),
          release_reason = $2,
          version = version + 1,
          updated_at = NOW()
        WHERE reservation_id = $1
          AND status = 'ACTIVE'
      `,
      [
        reservation.id,
        action === ReservationOperationAction.NO_SHOW
          ? 'NO_SHOW'
          : 'RESERVATION_COMPLETED',
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

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '23505'
    );
  }
}
