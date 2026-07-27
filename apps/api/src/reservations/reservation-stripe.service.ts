// PHASE_6_STRIPE_RESERVATION_PAYMENTS
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PoolClient, QueryResultRow } from 'pg';
import Stripe from 'stripe';
import { DatabaseService } from '@fluxa/database';
import type { CreateReservationCheckoutDto } from './dto/create-reservation-checkout.dto';
import {
  assertReservationCheckoutAllowed,
  buildBookingReturnUrls,
  buildReservationCheckoutRequestHash,
  isLateReservationPayment,
  normalizeProviderFeeCents,
} from './reservation-payment-policy';
import { hashPublicToken } from './reservation-policy';

interface CheckoutReservationRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  eventId: string;
  confirmationCode: string;
  status: string;
  customerName: string;
  customerEmail: string;
  amountCents: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  currency: string;
  paymentExpiresAt: Date | null;
  eventTitle: string;
  eventSlug: string;
}

interface ReservationPaymentRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  reservationId: string;
  status:
    | 'CREATED'
    | 'REQUIRES_ACTION'
    | 'PAID'
    | 'FAILED'
    | 'CANCELLED'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED';
  provider: string;
  providerPaymentId: string | null;
  providerSessionId: string | null;
  providerEventId: string | null;
  idempotencyKey: string;
  requestHash: string;
  amountCents: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  providerFeeCents: number;
  merchantNetCents: number;
  refundedCents: number;
  currency: string;
}

interface PaymentWebhookRow extends QueryResultRow {
  paymentId: string;
  organizationId: string;
  locationId: string;
  reservationId: string;
  eventId: string;
  paymentStatus: ReservationPaymentRow['status'];
  providerSessionId: string | null;
  providerPaymentId: string | null;
  providerEventId: string | null;
  amountCents: number;
  platformFeeCents: number;
  merchantGrossCents: number;
  currency: string;
  reservationStatus: string;
  paymentExpiresAt: Date | null;
}

interface CheckoutPreparation {
  reservation: CheckoutReservationRow;
  payment: ReservationPaymentRow;
}

@Injectable()
export class ReservationStripeService {
  private stripeClient: Stripe | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async createCheckout(
    reservationToken: string,
    dto: CreateReservationCheckoutDto,
  ) {
    const publicTokenHash = hashPublicToken(reservationToken);
    const idempotencyKey = dto.idempotencyKey.trim();

    const preparation = await this.prepareCheckout(
      publicTokenHash,
      idempotencyKey,
    );
    const stripe = this.stripe();

    if (preparation.payment.providerSessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(
        preparation.payment.providerSessionId,
      );

      return this.checkoutView(preparation.payment.id, existingSession);
    }

    const urls = buildBookingReturnUrls(
      this.bookingWebBaseUrl(),
      reservationToken,
    );
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: preparation.reservation.customerEmail,
        client_reference_id: preparation.reservation.id,
        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: preparation.reservation.currency.toLowerCase(),
              unit_amount: preparation.reservation.amountCents,
              product_data: {
                name: `Prenotazione ${preparation.reservation.eventTitle}`,
                description: `Codice ${preparation.reservation.confirmationCode}`,
              },
            },
          },
        ],
        metadata: {
          reservationId: preparation.reservation.id,
          reservationPaymentId: preparation.payment.id,
        },
        payment_intent_data: {
          metadata: {
            reservationId: preparation.reservation.id,
            reservationPaymentId: preparation.payment.id,
          },
        },
      },
      {
        idempotencyKey: `fluxa-reservation-payment-${preparation.payment.id}`,
      },
    );

    await this.attachCheckoutSession(
      preparation.payment.id,
      session,
      preparation.reservation,
    );

    return this.checkoutView(preparation.payment.id, session);
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string | undefined,
  ): Stripe.Event {
    if (!signature) {
      throw new BadRequestException({
        code: 'STRIPE_SIGNATURE_MISSING',
        message: 'Firma Stripe mancante.',
      });
    }

    const webhookSecret =
      this.config.get<string>('STRIPE_WEBHOOK_SECRET')?.trim() ?? '';

    if (!webhookSecret) {
      throw new ServiceUnavailableException({
        code: 'STRIPE_WEBHOOK_NOT_CONFIGURED',
        message: 'Webhook Stripe non configurato.',
      });
    }

    try {
      return this.stripe().webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch {
      throw new BadRequestException({
        code: 'STRIPE_SIGNATURE_INVALID',
        message: 'Firma Stripe non valida.',
      });
    }
  }

  async handleWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await this.handleCheckoutPaid(event, event.data.object);
        break;

      case 'checkout.session.expired':
        await this.handleCheckoutExpired(event, event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event, event.data.object);
        break;

      default:
        break;
    }

    return { received: true };
  }

  private async prepareCheckout(
    publicTokenHash: string,
    idempotencyKey: string,
  ): Promise<CheckoutPreparation> {
    return this.withTransaction(async (client) => {
      const reservationResult = await client.query<CheckoutReservationRow>(
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
              r.amount_cents AS "amountCents",
              r.platform_fee_cents AS "platformFeeCents",
              r.merchant_gross_cents AS "merchantGrossCents",
              r.currency,
              r.payment_expires_at AS "paymentExpiresAt",
              e.title AS "eventTitle",
              e.slug AS "eventSlug"
            FROM reservations r
            JOIN events e
              ON e.id = r.event_id
            WHERE r.public_token_hash = $1
            LIMIT 1
            FOR UPDATE OF r
          `,
        [publicTokenHash],
      );
      const reservation = reservationResult.rows[0];

      if (!reservation) {
        throw new NotFoundException({
          code: 'RESERVATION_NOT_FOUND',
          message: 'Prenotazione non trovata.',
        });
      }

      assertReservationCheckoutAllowed({
        status: reservation.status,
        amountCents: reservation.amountCents,
        paymentExpiresAt: reservation.paymentExpiresAt,
      });

      const requestHash = buildReservationCheckoutRequestHash({
        reservationId: reservation.id,
        amountCents: reservation.amountCents,
        currency: reservation.currency,
      });

      const existingResult = await client.query<ReservationPaymentRow>(
        `
            SELECT
              id,
              organization_id AS "organizationId",
              location_id AS "locationId",
              reservation_id AS "reservationId",
              status,
              provider,
              provider_payment_id AS "providerPaymentId",
              provider_session_id AS "providerSessionId",
              provider_event_id AS "providerEventId",
              idempotency_key AS "idempotencyKey",
              request_hash AS "requestHash",
              amount_cents AS "amountCents",
              platform_fee_cents AS "platformFeeCents",
              merchant_gross_cents AS "merchantGrossCents",
              provider_fee_cents AS "providerFeeCents",
              merchant_net_cents AS "merchantNetCents",
              refunded_cents AS "refundedCents",
              currency
            FROM reservation_payments
            WHERE reservation_id = $1
              AND idempotency_key = $2
            LIMIT 1
            FOR UPDATE
          `,
        [reservation.id, idempotencyKey],
      );
      const existing = existingResult.rows[0];

      if (existing) {
        if (
          existing.requestHash !== requestHash ||
          existing.provider !== 'STRIPE'
        ) {
          throw new ConflictException({
            code: 'RESERVATION_PAYMENT_IDEMPOTENCY_REUSED',
            message:
              'La chiave di idempotenza è già stata utilizzata con dati differenti.',
          });
        }

        if (existing.status === 'PAID' || existing.status === 'REFUNDED') {
          throw new ConflictException({
            code: 'RESERVATION_PAYMENT_ALREADY_COMPLETED',
            message: 'Il pagamento risulta già completato.',
          });
        }

        return { reservation, payment: existing };
      }

      const paymentId = randomUUID();
      const paymentResult = await client.query<ReservationPaymentRow>(
        `
            INSERT INTO reservation_payments (
              id,
              organization_id,
              location_id,
              reservation_id,
              status,
              provider,
              idempotency_key,
              request_hash,
              amount_cents,
              platform_fee_cents,
              merchant_gross_cents,
              provider_fee_cents,
              merchant_net_cents,
              refunded_cents,
              currency
            )
            VALUES (
              $1,$2,$3,$4,'CREATED','STRIPE',$5,$6,$7,$8,$9,0,$9,0,$10
            )
            RETURNING
              id,
              organization_id AS "organizationId",
              location_id AS "locationId",
              reservation_id AS "reservationId",
              status,
              provider,
              provider_payment_id AS "providerPaymentId",
              provider_session_id AS "providerSessionId",
              provider_event_id AS "providerEventId",
              idempotency_key AS "idempotencyKey",
              request_hash AS "requestHash",
              amount_cents AS "amountCents",
              platform_fee_cents AS "platformFeeCents",
              merchant_gross_cents AS "merchantGrossCents",
              provider_fee_cents AS "providerFeeCents",
              merchant_net_cents AS "merchantNetCents",
              refunded_cents AS "refundedCents",
              currency
          `,
        [
          paymentId,
          reservation.organizationId,
          reservation.locationId,
          reservation.id,
          idempotencyKey,
          requestHash,
          reservation.amountCents,
          reservation.platformFeeCents,
          reservation.merchantGrossCents,
          reservation.currency,
        ],
      );
      const payment = paymentResult.rows[0];

      if (!payment) {
        throw new Error('Reservation payment insert returned no row.');
      }

      return { reservation, payment };
    });
  }

  private async attachCheckoutSession(
    paymentId: string,
    session: Stripe.Checkout.Session,
    reservation: CheckoutReservationRow,
  ): Promise<void> {
    const providerPaymentId = this.stripeObjectId(session.payment_intent);

    await this.withTransaction(async (client) => {
      const currentResult = await client.query<ReservationPaymentRow>(
        `
            SELECT
              id,
              organization_id AS "organizationId",
              location_id AS "locationId",
              reservation_id AS "reservationId",
              status,
              provider,
              provider_payment_id AS "providerPaymentId",
              provider_session_id AS "providerSessionId",
              provider_event_id AS "providerEventId",
              idempotency_key AS "idempotencyKey",
              request_hash AS "requestHash",
              amount_cents AS "amountCents",
              platform_fee_cents AS "platformFeeCents",
              merchant_gross_cents AS "merchantGrossCents",
              provider_fee_cents AS "providerFeeCents",
              merchant_net_cents AS "merchantNetCents",
              refunded_cents AS "refundedCents",
              currency
            FROM reservation_payments
            WHERE id = $1
            FOR UPDATE
          `,
        [paymentId],
      );
      const current = currentResult.rows[0];

      if (!current) {
        throw new NotFoundException({
          code: 'RESERVATION_PAYMENT_NOT_FOUND',
          message: 'Pagamento prenotazione non trovato.',
        });
      }

      if (
        current.providerSessionId &&
        current.providerSessionId !== session.id
      ) {
        throw new ConflictException({
          code: 'RESERVATION_PAYMENT_SESSION_CONFLICT',
          message: 'Il pagamento è già collegato a una sessione differente.',
        });
      }

      const firstAttachment = !current.providerSessionId;

      await client.query(
        `
          UPDATE reservation_payments
          SET
            status = 'REQUIRES_ACTION',
            provider_session_id = $2,
            provider_payment_id = COALESCE($3, provider_payment_id),
            updated_at = NOW()
          WHERE id = $1
            AND status IN ('CREATED', 'REQUIRES_ACTION')
        `,
        [paymentId, session.id, providerPaymentId],
      );

      if (firstAttachment) {
        await this.recordChange(client, {
          organizationId: reservation.organizationId,
          action: 'reservation_payment.checkout_created',
          entityType: 'reservation_payment',
          entityId: paymentId,
          topic: 'reservations.payment.checkout_created',
          aggregateType: 'reservation_payment',
          aggregateId: paymentId,
          payload: {
            reservationPaymentId: paymentId,
            reservationId: reservation.id,
            eventId: reservation.eventId,
            locationId: reservation.locationId,
            provider: 'STRIPE',
            providerSessionId: session.id,
          },
        });
      }
    });
  }

  private async handleCheckoutPaid(
    event: Stripe.Event,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    if (session.payment_status !== 'paid') {
      return;
    }

    const paymentId = session.metadata?.reservationPaymentId?.trim() ?? '';

    if (!paymentId) {
      throw new BadRequestException({
        code: 'STRIPE_PAYMENT_METADATA_MISSING',
        message: 'Metadata pagamento Stripe mancante.',
      });
    }

    const paymentIntentId = this.stripeObjectId(session.payment_intent);
    const paymentIntent = paymentIntentId
      ? await this.stripe().paymentIntents.retrieve(paymentIntentId, {
          expand: ['latest_charge.balance_transaction'],
        })
      : null;
    const providerFeeCents = normalizeProviderFeeCents(
      this.providerFeeFromPaymentIntent(paymentIntent),
    );

    await this.withTransaction(async (client) => {
      const row = await this.lockWebhookPayment(client, paymentId);

      if (!row) {
        throw new NotFoundException({
          code: 'RESERVATION_PAYMENT_NOT_FOUND',
          message: 'Pagamento prenotazione non trovato.',
        });
      }

      if (row.paymentStatus === 'PAID') {
        return;
      }

      const merchantNetCents = row.merchantGrossCents - providerFeeCents;
      const latePayment = isLateReservationPayment({
        reservationStatus: row.reservationStatus,
        paymentExpiresAt: row.paymentExpiresAt,
      });
      const nextReservationStatus = latePayment
        ? 'REFUND_PENDING'
        : 'CONFIRMED';

      await client.query(
        `
          UPDATE reservation_payments
          SET
            status = 'PAID',
            provider_session_id = $2,
            provider_payment_id = COALESCE($3, provider_payment_id),
            provider_event_id = $4,
            provider_fee_cents = $5,
            merchant_net_cents = $6,
            paid_at = NOW(),
            failure_code = NULL,
            failure_message = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          paymentId,
          session.id,
          paymentIntentId,
          event.id,
          providerFeeCents,
          merchantNetCents,
        ],
      );

      await client.query(
        `
          UPDATE reservations
          SET
            status = $2::reservation_status,
            provider_fee_cents = $3,
            merchant_net_cents = $4,
            payment_expires_at = NULL,
            confirmed_at = CASE
              WHEN $2 = 'CONFIRMED' THEN COALESCE(confirmed_at, NOW())
              ELSE confirmed_at
            END,
            version = version + 1,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          row.reservationId,
          nextReservationStatus,
          providerFeeCents,
          merchantNetCents,
        ],
      );

      if (latePayment) {
        await client.query(
          `
            UPDATE reservation_table_assignments
            SET
              status = 'RELEASED',
              active_event_table_key = NULL,
              released_at = COALESCE(released_at, NOW()),
              release_reason = COALESCE(
                release_reason,
                'LATE_PAYMENT_REFUND_REQUIRED'
              ),
              version = version + 1,
              updated_at = NOW()
            WHERE reservation_id = $1
              AND status = 'ACTIVE'
          `,
          [row.reservationId],
        );
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
            $1,$2,$3,$4,$5::reservation_status,
            $6::reservation_status,NULL,$7,$8::jsonb
          )
        `,
        [
          randomUUID(),
          row.organizationId,
          row.locationId,
          row.reservationId,
          row.reservationStatus,
          nextReservationStatus,
          latePayment ? 'LATE_STRIPE_PAYMENT' : 'STRIPE_PAYMENT_SUCCEEDED',
          JSON.stringify({
            reservationPaymentId: paymentId,
            stripeEventId: event.id,
            providerSessionId: session.id,
            providerPaymentId: paymentIntentId,
          }),
        ],
      );

      await client.query(
        `
          INSERT INTO platform_fee_ledger (
            id,
            organization_id,
            location_id,
            event_id,
            reservation_id,
            reservation_payment_id,
            entry_type,
            source_key,
            customer_amount_cents,
            platform_fee_cents,
            provider_fee_cents,
            merchant_net_cents,
            currency,
            description
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,'CHARGE',$7,$8,$9,$10,$11,$12,$13
          )
          ON CONFLICT (source_key) DO NOTHING
        `,
        [
          randomUUID(),
          row.organizationId,
          row.locationId,
          row.eventId,
          row.reservationId,
          paymentId,
          `stripe:${event.id}:charge`,
          row.amountCents,
          row.platformFeeCents,
          providerFeeCents,
          merchantNetCents,
          row.currency,
          latePayment
            ? 'Pagamento Stripe tardivo: rimborso richiesto'
            : 'Pagamento prenotazione Stripe',
        ],
      );

      await this.recordChange(client, {
        organizationId: row.organizationId,
        action: latePayment
          ? 'reservation_payment.late_paid'
          : 'reservation_payment.paid',
        entityType: 'reservation_payment',
        entityId: paymentId,
        topic: latePayment
          ? 'reservations.payment.refund_required'
          : 'reservations.payment.paid',
        aggregateType: 'reservation',
        aggregateId: row.reservationId,
        payload: {
          reservationPaymentId: paymentId,
          reservationId: row.reservationId,
          eventId: row.eventId,
          locationId: row.locationId,
          provider: 'STRIPE',
          providerEventId: event.id,
          status: nextReservationStatus,
          providerFeeCents,
          merchantNetCents,
        },
      });
    });
  }

  private async handleCheckoutExpired(
    event: Stripe.Event,
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const paymentId = session.metadata?.reservationPaymentId?.trim() ?? '';

    if (!paymentId) {
      return;
    }

    await this.markPaymentAttemptFailed({
      paymentId,
      providerEventId: event.id,
      providerPaymentId: this.stripeObjectId(session.payment_intent),
      status: 'CANCELLED',
      failureCode: 'CHECKOUT_SESSION_EXPIRED',
      failureMessage: 'La sessione Stripe è scaduta.',
    });
  }

  private async handlePaymentIntentFailed(
    event: Stripe.Event,
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    const paymentId =
      paymentIntent.metadata?.reservationPaymentId?.trim() ?? '';

    if (!paymentId) {
      return;
    }

    await this.markPaymentAttemptFailed({
      paymentId,
      providerEventId: event.id,
      providerPaymentId: paymentIntent.id,
      status: 'FAILED',
      failureCode:
        paymentIntent.last_payment_error?.code ?? 'PAYMENT_INTENT_FAILED',
      failureMessage:
        paymentIntent.last_payment_error?.message ??
        'Pagamento Stripe non riuscito.',
    });
  }

  private async markPaymentAttemptFailed(input: {
    paymentId: string;
    providerEventId: string;
    providerPaymentId: string | null;
    status: 'FAILED' | 'CANCELLED';
    failureCode: string;
    failureMessage: string;
  }): Promise<void> {
    await this.withTransaction(async (client) => {
      const row = await this.lockWebhookPayment(client, input.paymentId);

      if (!row || row.paymentStatus === 'PAID') {
        return;
      }

      if (row.providerEventId === input.providerEventId) {
        return;
      }

      await client.query(
        `
          UPDATE reservation_payments
          SET
            status = $2::reservation_payment_status,
            provider_payment_id = COALESCE($3, provider_payment_id),
            provider_event_id = $4,
            failure_code = $5,
            failure_message = $6,
            failed_at = CASE
              WHEN $2 = 'FAILED' THEN NOW()
              ELSE failed_at
            END,
            cancelled_at = CASE
              WHEN $2 = 'CANCELLED' THEN NOW()
              ELSE cancelled_at
            END,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          input.paymentId,
          input.status,
          input.providerPaymentId,
          input.providerEventId,
          input.failureCode.slice(0, 100),
          input.failureMessage.slice(0, 1000),
        ],
      );

      await this.recordChange(client, {
        organizationId: row.organizationId,
        action:
          input.status === 'FAILED'
            ? 'reservation_payment.failed'
            : 'reservation_payment.cancelled',
        entityType: 'reservation_payment',
        entityId: input.paymentId,
        topic:
          input.status === 'FAILED'
            ? 'reservations.payment.failed'
            : 'reservations.payment.cancelled',
        aggregateType: 'reservation_payment',
        aggregateId: input.paymentId,
        payload: {
          reservationPaymentId: input.paymentId,
          reservationId: row.reservationId,
          eventId: row.eventId,
          locationId: row.locationId,
          provider: 'STRIPE',
          providerEventId: input.providerEventId,
          failureCode: input.failureCode,
        },
      });
    });
  }

  private async lockWebhookPayment(
    client: PoolClient,
    paymentId: string,
  ): Promise<PaymentWebhookRow | null> {
    const result = await client.query<PaymentWebhookRow>(
      `
        SELECT
          rp.id AS "paymentId",
          rp.organization_id AS "organizationId",
          rp.location_id AS "locationId",
          rp.reservation_id AS "reservationId",
          r.event_id AS "eventId",
          rp.status AS "paymentStatus",
          rp.provider_session_id AS "providerSessionId",
          rp.provider_payment_id AS "providerPaymentId",
          rp.provider_event_id AS "providerEventId",
          rp.amount_cents AS "amountCents",
          rp.platform_fee_cents AS "platformFeeCents",
          rp.merchant_gross_cents AS "merchantGrossCents",
          rp.currency,
          r.status AS "reservationStatus",
          r.payment_expires_at AS "paymentExpiresAt"
        FROM reservation_payments rp
        JOIN reservations r
          ON r.id = rp.reservation_id
        WHERE rp.id = $1
          AND rp.provider = 'STRIPE'
        LIMIT 1
        FOR UPDATE OF rp, r
      `,
      [paymentId],
    );

    return result.rows[0] ?? null;
  }

  private providerFeeFromPaymentIntent(
    paymentIntent: Stripe.PaymentIntent | null,
  ): number | null {
    if (!paymentIntent) {
      return null;
    }

    const charge = paymentIntent.latest_charge;

    if (!charge || typeof charge === 'string') {
      return null;
    }

    const balanceTransaction = charge.balance_transaction;

    if (!balanceTransaction || typeof balanceTransaction === 'string') {
      return null;
    }

    return balanceTransaction.fee;
  }

  private stripeObjectId(value: string | { id: string } | null): string | null {
    if (!value) return null;
    return typeof value === 'string' ? value : value.id;
  }

  private checkoutView(paymentId: string, session: Stripe.Checkout.Session) {
    if (!session.url) {
      throw new ServiceUnavailableException({
        code: 'STRIPE_CHECKOUT_URL_MISSING',
        message: 'Stripe non ha restituito un URL di checkout.',
      });
    }

    return {
      reservationPaymentId: paymentId,
      provider: 'STRIPE',
      providerSessionId: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      checkoutUrl: session.url,
      expiresAt: new Date(session.expires_at * 1000),
    };
  }

  private stripe(): Stripe {
    if (this.stripeClient) {
      return this.stripeClient;
    }

    const secretKey =
      this.config.get<string>('STRIPE_SECRET_KEY')?.trim() ?? '';

    if (!secretKey) {
      throw new ServiceUnavailableException({
        code: 'STRIPE_NOT_CONFIGURED',
        message: 'Stripe non è configurato.',
      });
    }

    this.stripeClient = new Stripe(secretKey, {
      maxNetworkRetries: 2,
    });

    return this.stripeClient;
  }

  private bookingWebBaseUrl(): string {
    const value = this.config.get<string>('BOOKING_WEB_BASE_URL')?.trim() ?? '';

    if (!value) {
      throw new ServiceUnavailableException({
        code: 'BOOKING_WEB_NOT_CONFIGURED',
        message: 'Il sito prenotazioni non è configurato.',
      });
    }

    return value;
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
}
