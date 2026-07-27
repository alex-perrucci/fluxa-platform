// PHASE_5_RESERVATION_CONVERSION
import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { ConvertHoldToReservationDto } from './dto/convert-hold-to-reservation.dto';
import {
  assertEventAcceptsHolds,
  hashPublicToken,
  type PublicBookableEvent,
} from './reservation-policy';
import {
  assertHoldConvertible,
  assertReservationRetryMatches,
  buildReservationConfirmationCode,
  initialReservationState,
  normalizeReservationCustomer,
} from './reservation-conversion-policy';

interface ConvertibleHoldRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
  feeRuleId: string | null;
  status: 'ACTIVE' | 'CONVERTED' | 'EXPIRED' | 'CANCELLED';
  partySize: number;
  amountCents: number;
  platformFeeBasisPoints: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  currency: string;
  expiresAt: Date;
  requirePhone: boolean;
  eventStatus: string;
  eventStartsAt: Date;
  bookingOpensAt: Date;
  bookingClosesAt: Date;
  eventCapacity: number;
}

interface AssignmentRow extends QueryResultRow {
  id: string;
  diningTableId: string;
}

interface ReservationRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
  holdId: string | null;
  publicTokenHash: string;
  confirmationCode: string;
  status:
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
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerNote: string | null;
  partySize: number;
  amountCents: number;
  platformFeeBasisPoints: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  providerFeeCents: number;
  merchantNetCents: number;
  refundedCents: number;
  currency: string;
  version: number;
  paymentExpiresAt: Date | null;
  confirmedAt: Date | null;
  checkedInAt: Date | null;
  seatedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  noShowAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ReservationViewRow extends ReservationRow {
  eventSlug: string;
  eventTitle: string;
  eventStartsAt: Date;
  eventTimezone: string;
  diningTableId: string | null;
  tableName: string | null;
  tableCapacity: number | null;
}

const RESERVATION_VIEW_COLUMNS = `
  r.id,
  r.organization_id AS "organizationId",
  r.location_id AS "locationId",
  r.event_id AS "eventId",
  r.hold_id AS "holdId",
  r.public_token_hash AS "publicTokenHash",
  r.confirmation_code AS "confirmationCode",
  r.status,
  r.customer_name AS "customerName",
  r.customer_email AS "customerEmail",
  r.customer_phone AS "customerPhone",
  r.customer_note AS "customerNote",
  r.party_size AS "partySize",
  r.amount_cents AS "amountCents",
  r.platform_fee_basis_points AS "platformFeeBasisPoints",
  r.platform_fee_cents AS "platformFeeCents",
  r.merchant_gross_cents AS "merchantGrossCents",
  r.provider_fee_cents AS "providerFeeCents",
  r.merchant_net_cents AS "merchantNetCents",
  r.refunded_cents AS "refundedCents",
  r.currency,
  r.version,
  r.payment_expires_at AS "paymentExpiresAt",
  r.confirmed_at AS "confirmedAt",
  r.checked_in_at AS "checkedInAt",
  r.seated_at AS "seatedAt",
  r.completed_at AS "completedAt",
  r.cancelled_at AS "cancelledAt",
  r.no_show_at AS "noShowAt",
  r.refunded_at AS "refundedAt",
  r.created_at AS "createdAt",
  r.updated_at AS "updatedAt",
  e.slug AS "eventSlug",
  e.title AS "eventTitle",
  e.starts_at AS "eventStartsAt",
  e.timezone AS "eventTimezone",
  rta.dining_table_id AS "diningTableId",
  dt.name AS "tableName",
  dt.capacity AS "tableCapacity"
`;

@Injectable()
export class ReservationConversionService {
  constructor(private readonly database: DatabaseService) {}

  async convert(holdToken: string, dto: ConvertHoldToReservationDto) {
    const holdTokenHash = hashPublicToken(holdToken);
    const reservationTokenHash = hashPublicToken(dto.reservationToken);

    try {
      const reservationId = await this.withTransaction(async (client) => {
        const hold = await this.lockHold(client, holdTokenHash);

        if (!hold) {
          throw new NotFoundException({
            code: 'RESERVATION_HOLD_NOT_FOUND',
            message: 'Hold di prenotazione non trovato.',
          });
        }

        const customer = normalizeReservationCustomer({
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone,
          customerNote: dto.customerNote,
          requirePhone: hold.requirePhone,
        });

        if (hold.status === 'CONVERTED') {
          const existing = await this.loadReservationByHold(client, hold.id);

          if (!existing) {
            throw new ConflictException({
              code: 'RESERVATION_CONVERSION_INCONSISTENT',
              message:
                'L’hold risulta convertito ma la prenotazione non è disponibile.',
            });
          }

          assertReservationRetryMatches(existing, {
            publicTokenHash: reservationTokenHash,
            customer,
          });

          return existing.id;
        }

        assertHoldConvertible({
          status: hold.status,
          expiresAt: hold.expiresAt,
        });

        assertEventAcceptsHolds(this.toPublicBookableEvent(hold));

        await client.query(
          `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
          [`reservation-event:${hold.eventId}`],
        );

        const assignmentResult = await client.query<AssignmentRow>(
          `
            SELECT
              id,
              dining_table_id AS "diningTableId"
            FROM reservation_table_assignments
            WHERE hold_id = $1
              AND status = 'ACTIVE'
            LIMIT 1
            FOR UPDATE
          `,
          [hold.id],
        );
        const assignment = assignmentResult.rows[0];

        if (!assignment) {
          throw new ConflictException({
            code: 'RESERVATION_HOLD_TABLE_RELEASED',
            message: 'Il tavolo associato all’hold non è più disponibile.',
          });
        }

        const initialState = initialReservationState(
          hold.amountCents,
          hold.expiresAt,
        );
        const reservationId = randomUUID();
        const confirmationCode = buildReservationConfirmationCode();

        await client.query(
          `
            INSERT INTO reservations (
              id,
              organization_id,
              location_id,
              event_id,
              hold_id,
              fee_rule_id,
              public_token_hash,
              confirmation_code,
              status,
              customer_name,
              customer_email,
              customer_phone,
              customer_note,
              party_size,
              amount_cents,
              platform_fee_basis_points,
              platform_fee_cents,
              merchant_gross_cents,
              provider_fee_cents,
              merchant_net_cents,
              refunded_cents,
              currency,
              version,
              payment_expires_at,
              confirmed_at
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
              $14,$15,$16,$17,$18,0,$19,0,$20,1,$21,$22
            )
          `,
          [
            reservationId,
            hold.organizationId,
            hold.locationId,
            hold.eventId,
            hold.id,
            hold.feeRuleId,
            reservationTokenHash,
            confirmationCode,
            initialState.status,
            customer.name,
            customer.email,
            customer.phone,
            customer.note,
            hold.partySize,
            hold.amountCents,
            hold.platformFeeBasisPoints,
            hold.platformFeeCents,
            hold.merchantGrossCents,
            hold.merchantGrossCents,
            hold.currency,
            initialState.paymentExpiresAt,
            initialState.confirmedAt,
          ],
        );

        const assignmentUpdate = await client.query(
          `
            UPDATE reservation_table_assignments
            SET
              hold_id = NULL,
              reservation_id = $2,
              version = version + 1,
              updated_at = NOW()
            WHERE id = $1
              AND hold_id = $3
              AND status = 'ACTIVE'
            RETURNING id
          `,
          [assignment.id, reservationId, hold.id],
        );

        if (assignmentUpdate.rowCount !== 1) {
          throw new ConflictException({
            code: 'RESERVATION_ASSIGNMENT_TRANSFER_FAILED',
            message:
              'Non è stato possibile trasferire il tavolo alla prenotazione.',
          });
        }

        const holdUpdate = await client.query(
          `
            UPDATE reservation_holds
            SET
              status = 'CONVERTED',
              converted_at = NOW(),
              version = version + 1,
              updated_at = NOW()
            WHERE id = $1
              AND status = 'ACTIVE'
            RETURNING id
          `,
          [hold.id],
        );

        if (holdUpdate.rowCount !== 1) {
          throw new ConflictException({
            code: 'RESERVATION_HOLD_CONVERSION_FAILED',
            message: 'L’hold non è più convertibile.',
          });
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
            VALUES (
              $1,$2,$3,$4,NULL,$5,NULL,'HOLD_CONVERTED',$6::jsonb
            )
          `,
          [
            randomUUID(),
            hold.organizationId,
            hold.locationId,
            reservationId,
            initialState.status,
            JSON.stringify({
              holdId: hold.id,
              diningTableId: assignment.diningTableId,
            }),
          ],
        );

        await this.recordChange(client, {
          organizationId: hold.organizationId,
          action: 'reservation.created',
          reservationId,
          topic: 'reservations.reservation.created',
          payload: {
            reservationId,
            holdId: hold.id,
            eventId: hold.eventId,
            locationId: hold.locationId,
            diningTableId: assignment.diningTableId,
            status: initialState.status,
            confirmationCode,
            paymentExpiresAt:
              initialState.paymentExpiresAt?.toISOString() ?? null,
          },
        });

        return reservationId;
      });

      const reservation = await this.requireReservationById(reservationId);

      return {
        reservationToken: dto.reservationToken,
        ...this.publicReservationView(reservation),
      };
    } catch (error) {
      this.rethrowReservationConstraint(error);
    }
  }

  async getByToken(reservationToken: string) {
    const publicTokenHash = hashPublicToken(reservationToken);
    const reservation = await this.requireReservationByHash(publicTokenHash);

    return this.publicReservationView(reservation);
  }

  private async lockHold(
    client: PoolClient,
    publicTokenHash: string,
  ): Promise<ConvertibleHoldRow | null> {
    const result = await client.query<ConvertibleHoldRow>(
      `
        SELECT
          h.id,
          h.organization_id AS "organizationId",
          h.location_id AS "locationId",
          h.event_id AS "eventId",
          h.fee_rule_id AS "feeRuleId",
          h.status,
          h.party_size AS "partySize",
          h.amount_cents AS "amountCents",
          h.platform_fee_basis_points AS "platformFeeBasisPoints",
          h.platform_fee_cents AS "platformFeeCents",
          h.merchant_gross_cents AS "merchantGrossCents",
          h.currency,
          h.expires_at AS "expiresAt",
          br.require_phone AS "requirePhone",
          e.status AS "eventStatus",
          e.starts_at AS "eventStartsAt",
          e.booking_opens_at AS "bookingOpensAt",
          e.booking_closes_at AS "bookingClosesAt",
          e.capacity AS "eventCapacity"
        FROM reservation_holds h
        JOIN events e
          ON e.id = h.event_id
        JOIN event_booking_rules br
          ON br.event_id = h.event_id
        WHERE h.public_token_hash = $1
        LIMIT 1
        FOR UPDATE OF h, e
      `,
      [publicTokenHash],
    );

    return result.rows[0] ?? null;
  }

  private toPublicBookableEvent(hold: ConvertibleHoldRow): PublicBookableEvent {
    return {
      id: hold.eventId,
      status: hold.eventStatus,
      bookingOpensAt: hold.bookingOpensAt,
      bookingClosesAt: hold.bookingClosesAt,
      startsAt: hold.eventStartsAt,
      bookingAmountCents: hold.amountCents,
      capacity: hold.eventCapacity,
      currency: hold.currency,
    };
  }

  private async loadReservationByHold(
    client: PoolClient,
    holdId: string,
  ): Promise<ReservationRow | null> {
    const result = await client.query<ReservationRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          event_id AS "eventId",
          hold_id AS "holdId",
          public_token_hash AS "publicTokenHash",
          confirmation_code AS "confirmationCode",
          status,
          customer_name AS "customerName",
          customer_email AS "customerEmail",
          customer_phone AS "customerPhone",
          customer_note AS "customerNote",
          party_size AS "partySize",
          amount_cents AS "amountCents",
          platform_fee_basis_points AS "platformFeeBasisPoints",
          platform_fee_cents AS "platformFeeCents",
          merchant_gross_cents AS "merchantGrossCents",
          provider_fee_cents AS "providerFeeCents",
          merchant_net_cents AS "merchantNetCents",
          refunded_cents AS "refundedCents",
          currency,
          version,
          payment_expires_at AS "paymentExpiresAt",
          confirmed_at AS "confirmedAt",
          checked_in_at AS "checkedInAt",
          seated_at AS "seatedAt",
          completed_at AS "completedAt",
          cancelled_at AS "cancelledAt",
          no_show_at AS "noShowAt",
          refunded_at AS "refundedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM reservations
        WHERE hold_id = $1
        LIMIT 1
        FOR UPDATE
      `,
      [holdId],
    );

    return result.rows[0] ?? null;
  }

  private async requireReservationByHash(
    publicTokenHash: string,
  ): Promise<ReservationViewRow> {
    const result = await this.database.pool.query<ReservationViewRow>(
      `
        SELECT ${RESERVATION_VIEW_COLUMNS}
        FROM reservations r
        JOIN events e
          ON e.id = r.event_id
        LEFT JOIN reservation_table_assignments rta
          ON rta.reservation_id = r.id
        LEFT JOIN dining_tables dt
          ON dt.id = rta.dining_table_id
        WHERE r.public_token_hash = $1
        LIMIT 1
      `,
      [publicTokenHash],
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

  private async requireReservationById(
    reservationId: string,
  ): Promise<ReservationViewRow> {
    const result = await this.database.pool.query<ReservationViewRow>(
      `
        SELECT ${RESERVATION_VIEW_COLUMNS}
        FROM reservations r
        JOIN events e
          ON e.id = r.event_id
        LEFT JOIN reservation_table_assignments rta
          ON rta.reservation_id = r.id
        LEFT JOIN dining_tables dt
          ON dt.id = rta.dining_table_id
        WHERE r.id = $1
        LIMIT 1
      `,
      [reservationId],
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

  private publicReservationView(reservation: ReservationViewRow) {
    const paymentRequired = reservation.amountCents > 0;

    return {
      id: reservation.id,
      confirmationCode: reservation.confirmationCode,
      status: reservation.status,
      customer: {
        name: reservation.customerName,
        email: reservation.customerEmail,
        phone: reservation.customerPhone,
        note: reservation.customerNote,
      },
      partySize: reservation.partySize,
      event: {
        slug: reservation.eventSlug,
        title: reservation.eventTitle,
        startsAt: reservation.eventStartsAt,
        timezone: reservation.eventTimezone,
      },
      table: reservation.diningTableId
        ? {
            id: reservation.diningTableId,
            name: reservation.tableName,
            capacity: reservation.tableCapacity,
          }
        : null,
      payment: {
        required: paymentRequired,
        amountCents: reservation.amountCents,
        currency: reservation.currency,
        status: reservation.status,
        expiresAt: reservation.paymentExpiresAt,
        nextAction:
          paymentRequired && reservation.status === 'PENDING_PAYMENT'
            ? 'CREATE_CHECKOUT_SESSION'
            : 'NONE',
      },
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
    };
  }

  private async recordChange(
    client: PoolClient,
    input: {
      organizationId: string;
      action: string;
      reservationId: string;
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
        VALUES ($1,$2,NULL,$3,'reservation',$4,$5::jsonb)
      `,
      [
        randomUUID(),
        input.organizationId,
        input.action,
        input.reservationId,
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
        VALUES ($1,$2,'reservation',$3,$4::jsonb)
      `,
      [
        randomUUID(),
        input.topic,
        input.reservationId,
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
        code: 'RESERVATION_ALREADY_CREATED',
        message:
          'La prenotazione risulta già creata oppure il token è già stato utilizzato.',
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
