import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import {
  DatabaseService,
  type CheckoutStatus,
  type OrderStatus,
  type PaymentEventType,
  type PaymentMethod,
  type PaymentProvider,
  type PaymentStatus,
} from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { CancelCheckoutDto } from './dto/cancel-checkout.dto';
import type { CapturePaymentDto } from './dto/capture-payment.dto';
import type { CheckoutListQueryDto } from './dto/checkout-list-query.dto';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import type { FailPaymentDto } from './dto/fail-payment.dto';
import type { OpenCheckoutDto } from './dto/open-checkout.dto';
import type { PaymentMutationDto } from './dto/payment-mutation.dto';
import { PaymentAccessService } from './payment-access.service';
import { financialRequestHash } from './payment-idempotency';
import {
  assertPaymentAmount,
  calculateCashChange,
  summarizeCheckout,
  validateMethodProvider,
  type CheckoutBalance,
  type PaymentBalanceInput,
} from './payment-policy';

interface CheckoutRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  orderId: string;
  deviceId: string;
  createdByUserId: string;
  clientCheckoutId: string;
  requestHash: string;
  status: CheckoutStatus;
  currency: string;
  orderVersionSnapshot: number;
  orderTotalCents: number;
  paidCents: number;
  remainingCents: number;
  changeCents: number;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PaymentRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  checkoutSessionId: string;
  orderId: string;
  deviceId: string;
  createdByUserId: string;
  clientPaymentId: string;
  requestHash: string;
  method: PaymentMethod;
  provider: PaymentProvider;
  status: PaymentStatus;
  amountCents: number;
  tenderedCents: number | null;
  changeCents: number;
  providerReference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  capturedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PaymentEventRow extends QueryResultRow {
  id: string;
  paymentId: string;
  type: PaymentEventType;
  providerEventId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

interface OrderPaymentRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  number: string;
  status: OrderStatus;
  currency: string;
  version: number;
  totalCents: number;
}

interface FinancialMutationRow extends QueryResultRow {
  scopeType: 'CHECKOUT' | 'PAYMENT';
  scopeId: string;
  operation: string;
  requestHash: string;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface ProviderEventLookupRow extends QueryResultRow {
  paymentId: string;
}

interface RefreshResult {
  balance: CheckoutBalance;
  completedNow: boolean;
  orderVersion: number;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: PaymentAccessService,
  ) {}

  async list(auth: AuthContext, query: CheckoutListQueryDto) {
    const access = await this.access.assertLocation(auth, query.locationId);
    const offset = (query.page - 1) * query.pageSize;
    const values = [
      access.organizationId,
      access.locationId,
      query.status ?? null,
      query.pageSize,
      offset,
    ];

    const [rows, count] = await Promise.all([
      this.database.pool.query<CheckoutRow>(
        `${this.checkoutSelect()}
         WHERE cs.organization_id = $1
           AND cs.location_id = $2
           AND ($3::text IS NULL OR cs.status::text = $3)
         ORDER BY cs.created_at DESC, cs.id DESC
         LIMIT $4 OFFSET $5`,
        values,
      ),
      this.database.pool.query<CountRow>(
        `
          SELECT COUNT(*)::int AS count
          FROM checkout_sessions
          WHERE organization_id = $1
            AND location_id = $2
            AND ($3::text IS NULL OR status::text = $3)
        `,
        values.slice(0, 3),
      ),
    ]);

    return {
      page: query.page,
      pageSize: query.pageSize,
      total: count.rows[0]?.count ?? 0,
      items: rows.rows,
    };
  }

  async get(auth: AuthContext, checkoutId: string) {
    const checkout = await this.requireAccessibleCheckout(auth, checkoutId);
    const [payments, events] = await Promise.all([
      this.database.pool.query<PaymentRow>(
        `${this.paymentSelect()}
         WHERE pt.organization_id = $1
           AND pt.checkout_session_id = $2
         ORDER BY pt.created_at ASC, pt.id ASC`,
        [checkout.organizationId, checkoutId],
      ),
      this.database.pool.query<PaymentEventRow>(
        `
          SELECT
            pe.id,
            pe.payment_id AS "paymentId",
            pe.type,
            pe.provider_event_id AS "providerEventId",
            pe.payload,
            pe.created_at AS "createdAt"
          FROM payment_events pe
          INNER JOIN payment_transactions pt ON pt.id = pe.payment_id
          WHERE pt.organization_id = $1
            AND pt.checkout_session_id = $2
          ORDER BY pe.created_at ASC, pe.id ASC
        `,
        [checkout.organizationId, checkoutId],
      ),
    ]);
    const eventsByPayment = new Map<string, PaymentEventRow[]>();

    for (const event of events.rows) {
      const current = eventsByPayment.get(event.paymentId) ?? [];
      current.push(event);
      eventsByPayment.set(event.paymentId, current);
    }

    return {
      ...checkout,
      payments: payments.rows.map((payment) => ({
        ...payment,
        events: eventsByPayment.get(payment.id) ?? [],
      })),
    };
  }

  async getPayment(auth: AuthContext, paymentId: string) {
    const organizationId = assertOrganizationScope(auth);
    const payment = await this.findPayment(organizationId, paymentId);

    if (!payment) throw this.paymentNotFound();
    await this.access.assertLocation(auth, payment.locationId);

    const events = await this.database.pool.query<PaymentEventRow>(
      `
        SELECT
          id,
          payment_id AS "paymentId",
          type,
          provider_event_id AS "providerEventId",
          payload,
          created_at AS "createdAt"
        FROM payment_events
        WHERE organization_id = $1
          AND payment_id = $2
        ORDER BY created_at ASC, id ASC
      `,
      [organizationId, paymentId],
    );

    return { ...payment, events: events.rows };
  }

  async open(auth: AuthContext, dto: OpenCheckoutDto) {
    const organizationId = assertOrganizationScope(auth);
    const requestHash = financialRequestHash({
      operation: 'checkout.open',
      orderId: dto.orderId,
      expectedOrderVersion: dto.expectedOrderVersion,
    });
    const duplicate = await this.findByClientCheckoutId(
      organizationId,
      auth.deviceId,
      dto.clientCheckoutId,
    );

    if (duplicate) {
      this.assertEquivalentCheckout(duplicate, dto.orderId, requestHash);
      await this.access.assertLocation(auth, duplicate.locationId);
      return this.get(auth, duplicate.id);
    }

    const preliminaryOrder = await this.findOrder(organizationId, dto.orderId);
    if (!preliminaryOrder) throw this.orderNotFound();
    await this.access.assertLocation(auth, preliminaryOrder.locationId);

    const checkoutId = await this.withTransaction(async (client) => {
      await this.advisoryLock(
        client,
        `checkout-create:${organizationId}:${auth.deviceId}:${dto.clientCheckoutId}`,
      );
      const order = await this.lockOrder(client, organizationId, dto.orderId);
      const repeated = await this.findByClientCheckoutIdWithClient(
        client,
        organizationId,
        auth.deviceId,
        dto.clientCheckoutId,
      );

      if (repeated) {
        this.assertEquivalentCheckout(repeated, dto.orderId, requestHash);
        return repeated.id;
      }

      if (order.status !== 'OPEN') {
        throw new ConflictException({
          code: 'ORDER_NOT_READY_FOR_CHECKOUT',
          message: 'L’ordine deve essere OPEN per iniziare il checkout.',
          status: order.status,
        });
      }

      if (order.version !== dto.expectedOrderVersion) {
        throw new ConflictException({
          code: 'ORDER_VERSION_CONFLICT',
          message: 'L’ordine è stato modificato da un altro dispositivo.',
          expectedVersion: dto.expectedOrderVersion,
          actualVersion: order.version,
        });
      }

      if (order.totalCents <= 0) {
        throw new BadRequestException({
          code: 'ORDER_TOTAL_EMPTY',
          message:
            'Non è possibile incassare un ordine con totale pari a zero.',
        });
      }

      const itemCount = await client.query<CountRow>(
        `SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = $1`,
        [order.id],
      );

      if ((itemCount.rows[0]?.count ?? 0) === 0) {
        throw new BadRequestException({
          code: 'ORDER_ITEMS_REQUIRED',
          message: 'L’ordine deve contenere almeno una riga.',
        });
      }

      const activeCheckout = await client.query<CheckoutRow>(
        `${this.checkoutSelect()}
         WHERE cs.organization_id = $1
           AND cs.order_id = $2
           AND cs.status = 'OPEN'
         LIMIT 1`,
        [organizationId, order.id],
      );

      if (activeCheckout.rows[0]) {
        throw new ConflictException({
          code: 'ORDER_CHECKOUT_ALREADY_OPEN',
          message: 'Esiste già un checkout aperto per questo ordine.',
          checkoutId: activeCheckout.rows[0].id,
        });
      }

      const id = randomUUID();
      await client.query(
        `
          INSERT INTO checkout_sessions (
            id,
            organization_id,
            location_id,
            order_id,
            device_id,
            created_by_user_id,
            client_checkout_id,
            request_hash,
            status,
            currency,
            order_version_snapshot,
            order_total_cents,
            paid_cents,
            remaining_cents,
            change_cents
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', $9, $10, $11, 0, $11, 0)
        `,
        [
          id,
          organizationId,
          order.locationId,
          order.id,
          auth.deviceId,
          auth.userId,
          dto.clientCheckoutId,
          requestHash,
          order.currency,
          order.version,
          order.totalCents,
        ],
      );
      const update = await client.query(
        `
          UPDATE orders
          SET status = 'AWAITING_PAYMENT', version = version + 1, updated_at = NOW()
          WHERE id = $1
            AND organization_id = $2
            AND status = 'OPEN'
            AND version = $3
        `,
        [order.id, organizationId, order.version],
      );

      if (update.rowCount !== 1) {
        throw new ConflictException({
          code: 'ORDER_VERSION_CONFLICT',
          message:
            'L’ordine è stato modificato durante l’apertura del checkout.',
        });
      }

      await this.audit(client, {
        organizationId,
        actorUserId: auth.userId,
        action: 'checkout.opened',
        entityType: 'checkout',
        entityId: id,
        payload: { orderId: order.id, orderTotalCents: order.totalCents },
      });
      await this.outbox(client, {
        topic: 'checkout.opened',
        aggregateType: 'checkout',
        aggregateId: id,
        payload: {
          organizationId,
          orderId: order.id,
          locationId: order.locationId,
        },
      });

      return id;
    });

    return this.get(auth, checkoutId);
  }

  async createPayment(
    auth: AuthContext,
    checkoutId: string,
    dto: CreatePaymentDto,
  ) {
    const checkout = await this.requireAccessibleCheckout(auth, checkoutId);
    validateMethodProvider(dto.method, dto.provider, dto.tenderedCents);
    const requestHash = financialRequestHash({
      operation: 'payment.create',
      checkoutId,
      method: dto.method,
      provider: dto.provider,
      amountCents: dto.amountCents,
      tenderedCents: dto.tenderedCents ?? null,
    });
    const duplicate = await this.findByClientPaymentId(
      checkout.organizationId,
      auth.deviceId,
      dto.clientPaymentId,
    );

    if (duplicate) {
      this.assertEquivalentPayment(duplicate, checkoutId, requestHash);
      return this.paymentResponse(auth, duplicate.id, checkoutId);
    }

    let paymentId: string;

    try {
      paymentId = await this.withTransaction(async (client) => {
        await this.advisoryLock(
          client,
          `payment-create:${checkout.organizationId}:${auth.deviceId}:${dto.clientPaymentId}`,
        );
        const lockedCheckout = await this.lockCheckout(
          client,
          checkout.organizationId,
          checkoutId,
        );
        const order = await this.lockOrder(
          client,
          checkout.organizationId,
          lockedCheckout.orderId,
        );
        const repeated = await this.findByClientPaymentIdWithClient(
          client,
          checkout.organizationId,
          auth.deviceId,
          dto.clientPaymentId,
        );

        if (repeated) {
          this.assertEquivalentPayment(repeated, checkoutId, requestHash);
          return repeated.id;
        }

        this.assertCheckoutOpen(lockedCheckout, order);
        const currentPayments = await this.loadBalancePayments(
          client,
          checkoutId,
        );
        const balance = summarizeCheckout(
          lockedCheckout.orderTotalCents,
          currentPayments,
        );
        assertPaymentAmount(dto.amountCents, balance.availableCents);

        const status: PaymentStatus =
          dto.method === 'CASH' ? 'CAPTURED' : 'PENDING';
        const changeCents =
          dto.method === 'CASH'
            ? calculateCashChange(dto.amountCents, dto.tenderedCents)
            : 0;
        const id = randomUUID();

        await client.query(
          `
            INSERT INTO payment_transactions (
              id,
              organization_id,
              location_id,
              checkout_session_id,
              order_id,
              device_id,
              created_by_user_id,
              client_payment_id,
              request_hash,
              method,
              provider,
              status,
              amount_cents,
              tendered_cents,
              change_cents,
              captured_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9,
              $10::payment_method,
              $11::payment_provider,
              $12::payment_status,
              $13, $14, $15,
              CASE
                WHEN $12::payment_status = 'CAPTURED'::payment_status
                THEN NOW()
                ELSE NULL
              END
            )
          `,
          [
            id,
            checkout.organizationId,
            lockedCheckout.locationId,
            checkoutId,
            lockedCheckout.orderId,
            auth.deviceId,
            auth.userId,
            dto.clientPaymentId,
            requestHash,
            dto.method,
            dto.provider,
            status,
            dto.amountCents,
            dto.tenderedCents ?? null,
            changeCents,
          ],
        );
        await this.insertPaymentEvent(client, {
          organizationId: checkout.organizationId,
          paymentId: id,
          type: 'CREATED',
          payload: {
            method: dto.method,
            provider: dto.provider,
            amountCents: dto.amountCents,
          },
        });

        let refresh: RefreshResult | null = null;
        if (status === 'CAPTURED') {
          await this.insertPaymentEvent(client, {
            organizationId: checkout.organizationId,
            paymentId: id,
            type: 'CAPTURED',
            payload: { amountCents: dto.amountCents, changeCents },
          });
          refresh = await this.refreshCheckout(
            client,
            lockedCheckout,
            order,
            auth.userId,
          );
        }

        await this.audit(client, {
          organizationId: checkout.organizationId,
          actorUserId: auth.userId,
          action:
            status === 'CAPTURED' ? 'payment.captured' : 'payment.created',
          entityType: 'payment',
          entityId: id,
          payload: {
            checkoutId,
            orderId: lockedCheckout.orderId,
            method: dto.method,
            provider: dto.provider,
            amountCents: dto.amountCents,
            completedCheckout: refresh?.completedNow ?? false,
          },
        });
        await this.outbox(client, {
          topic: status === 'CAPTURED' ? 'payment.captured' : 'payment.created',
          aggregateType: 'payment',
          aggregateId: id,
          payload: {
            organizationId: checkout.organizationId,
            checkoutId,
            orderId: lockedCheckout.orderId,
            amountCents: dto.amountCents,
          },
        });

        return id;
      });
    } catch (error) {
      if (
        this.isConstraint(error, 'payment_transactions_org_device_client_uq')
      ) {
        const repeated = await this.findByClientPaymentId(
          checkout.organizationId,
          auth.deviceId,
          dto.clientPaymentId,
        );
        if (repeated) {
          this.assertEquivalentPayment(repeated, checkoutId, requestHash);
          return this.paymentResponse(auth, repeated.id, checkoutId);
        }
      }
      throw error;
    }

    return this.paymentResponse(auth, paymentId, checkoutId);
  }

  async capturePayment(
    auth: AuthContext,
    paymentId: string,
    dto: CapturePaymentDto,
  ) {
    const payment = await this.requireAccessiblePayment(auth, paymentId);
    const requestHash = financialRequestHash({
      operation: 'payment.capture',
      paymentId,
      providerReference: dto.providerReference.trim(),
      providerEventId: dto.providerEventId?.trim() || null,
    });

    try {
      await this.withTransaction(async (client) => {
        const checkout = await this.lockCheckout(
          client,
          payment.organizationId,
          payment.checkoutSessionId,
        );
        const order = await this.lockOrder(
          client,
          payment.organizationId,
          payment.orderId,
        );
        const lockedPayment = await this.lockPayment(
          client,
          payment.organizationId,
          paymentId,
        );
        const duplicate = await this.beginMutation(client, auth, {
          scopeType: 'PAYMENT',
          scopeId: paymentId,
          mutationId: dto.mutationId,
          operation: 'payment.capture',
          requestHash,
        });
        if (duplicate) return;

        this.assertCheckoutOpen(checkout, order);

        if (lockedPayment.status !== 'PENDING') {
          throw new ConflictException({
            code: 'PAYMENT_NOT_PENDING',
            message: 'Soltanto un pagamento PENDING può essere acquisito.',
            status: lockedPayment.status,
          });
        }

        if (lockedPayment.provider === 'CASH') {
          throw new ConflictException({
            code: 'CASH_PAYMENT_ALREADY_FINAL',
            message: 'I pagamenti in contanti sono acquisiti alla creazione.',
          });
        }

        await this.assertProviderEventAvailable(
          client,
          payment.organizationId,
          dto.providerEventId,
          paymentId,
        );
        const balance = summarizeCheckout(
          checkout.orderTotalCents,
          await this.loadBalancePayments(client, checkout.id),
        );
        assertPaymentAmount(lockedPayment.amountCents, balance.remainingCents);

        await client.query(
          `
            UPDATE payment_transactions
            SET
              status = 'CAPTURED',
              provider_reference = $2,
              captured_at = NOW(),
              updated_at = NOW()
            WHERE id = $1
          `,
          [paymentId, dto.providerReference.trim()],
        );
        await this.insertPaymentEvent(client, {
          organizationId: payment.organizationId,
          paymentId,
          type: 'CAPTURED',
          providerEventId: dto.providerEventId?.trim() || null,
          payload: {
            providerReference: dto.providerReference.trim(),
            amountCents: lockedPayment.amountCents,
          },
        });
        const refresh = await this.refreshCheckout(
          client,
          checkout,
          order,
          auth.userId,
        );
        await this.recordMutation(client, auth, {
          scopeType: 'PAYMENT',
          scopeId: paymentId,
          mutationId: dto.mutationId,
          operation: 'payment.capture',
          requestHash,
        });
        await this.audit(client, {
          organizationId: payment.organizationId,
          actorUserId: auth.userId,
          action: 'payment.captured',
          entityType: 'payment',
          entityId: paymentId,
          payload: {
            checkoutId: checkout.id,
            orderId: order.id,
            amountCents: lockedPayment.amountCents,
            completedCheckout: refresh.completedNow,
          },
        });
        await this.outbox(client, {
          topic: 'payment.captured',
          aggregateType: 'payment',
          aggregateId: paymentId,
          payload: {
            organizationId: payment.organizationId,
            checkoutId: checkout.id,
            orderId: order.id,
            amountCents: lockedPayment.amountCents,
          },
        });
      });
    } catch (error) {
      if (this.isConstraint(error, 'payment_events_org_provider_event_uq')) {
        throw new ConflictException({
          code: 'PROVIDER_EVENT_ALREADY_USED',
          message: 'L’evento del provider è già stato elaborato.',
        });
      }

      if (
        this.isConstraint(error, 'payment_transactions_org_provider_ref_uq')
      ) {
        throw new ConflictException({
          code: 'PROVIDER_REFERENCE_ALREADY_USED',
          message:
            'Il riferimento del provider è già associato a un pagamento.',
        });
      }

      throw error;
    }

    return this.paymentResponse(auth, paymentId, payment.checkoutSessionId);
  }

  async failPayment(auth: AuthContext, paymentId: string, dto: FailPaymentDto) {
    const payment = await this.requireAccessiblePayment(auth, paymentId);
    const requestHash = financialRequestHash({
      operation: 'payment.fail',
      paymentId,
      failureCode: dto.failureCode.trim().toUpperCase(),
      failureMessage: dto.failureMessage?.trim() || null,
      providerEventId: dto.providerEventId?.trim() || null,
    });

    try {
      await this.withTransaction(async (client) => {
        const checkout = await this.lockCheckout(
          client,
          payment.organizationId,
          payment.checkoutSessionId,
        );
        const order = await this.lockOrder(
          client,
          payment.organizationId,
          payment.orderId,
        );
        const lockedPayment = await this.lockPayment(
          client,
          payment.organizationId,
          paymentId,
        );
        const duplicate = await this.beginMutation(client, auth, {
          scopeType: 'PAYMENT',
          scopeId: paymentId,
          mutationId: dto.mutationId,
          operation: 'payment.fail',
          requestHash,
        });
        if (duplicate) return;

        this.assertCheckoutOpen(checkout, order);

        if (lockedPayment.status !== 'PENDING') {
          throw new ConflictException({
            code: 'PAYMENT_NOT_PENDING',
            message: 'Soltanto un pagamento PENDING può fallire.',
            status: lockedPayment.status,
          });
        }

        await this.assertProviderEventAvailable(
          client,
          payment.organizationId,
          dto.providerEventId,
          paymentId,
        );
        await client.query(
          `
          UPDATE payment_transactions
          SET
            status = 'FAILED',
            failure_code = $2,
            failure_message = $3,
            failed_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `,
          [
            paymentId,
            dto.failureCode.trim().toUpperCase(),
            dto.failureMessage?.trim() || null,
          ],
        );
        await this.insertPaymentEvent(client, {
          organizationId: payment.organizationId,
          paymentId,
          type: 'FAILED',
          providerEventId: dto.providerEventId?.trim() || null,
          payload: {
            failureCode: dto.failureCode.trim().toUpperCase(),
            failureMessage: dto.failureMessage?.trim() || null,
          },
        });
        await this.refreshCheckout(client, checkout, order, auth.userId);
        await this.recordMutation(client, auth, {
          scopeType: 'PAYMENT',
          scopeId: paymentId,
          mutationId: dto.mutationId,
          operation: 'payment.fail',
          requestHash,
        });
        await this.audit(client, {
          organizationId: payment.organizationId,
          actorUserId: auth.userId,
          action: 'payment.failed',
          entityType: 'payment',
          entityId: paymentId,
          payload: { checkoutId: checkout.id, failureCode: dto.failureCode },
        });
      });
    } catch (error) {
      if (this.isConstraint(error, 'payment_events_org_provider_event_uq')) {
        throw new ConflictException({
          code: 'PROVIDER_EVENT_ALREADY_USED',
          message: 'L’evento del provider è già stato elaborato.',
        });
      }

      throw error;
    }

    return this.paymentResponse(auth, paymentId, payment.checkoutSessionId);
  }

  async cancelPayment(
    auth: AuthContext,
    paymentId: string,
    dto: PaymentMutationDto,
  ) {
    const payment = await this.requireAccessiblePayment(auth, paymentId);
    const requestHash = financialRequestHash({
      operation: 'payment.cancel',
      paymentId,
      reason: dto.reason?.trim() || null,
    });

    await this.withTransaction(async (client) => {
      const checkout = await this.lockCheckout(
        client,
        payment.organizationId,
        payment.checkoutSessionId,
      );
      const order = await this.lockOrder(
        client,
        payment.organizationId,
        payment.orderId,
      );
      const lockedPayment = await this.lockPayment(
        client,
        payment.organizationId,
        paymentId,
      );
      const duplicate = await this.beginMutation(client, auth, {
        scopeType: 'PAYMENT',
        scopeId: paymentId,
        mutationId: dto.mutationId,
        operation: 'payment.cancel',
        requestHash,
      });
      if (duplicate) return;

      this.assertCheckoutOpen(checkout, order);

      if (lockedPayment.status !== 'PENDING') {
        throw new ConflictException({
          code: 'PAYMENT_NOT_PENDING',
          message: 'Soltanto un pagamento PENDING può essere annullato.',
          status: lockedPayment.status,
        });
      }

      await client.query(
        `
          UPDATE payment_transactions
          SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `,
        [paymentId],
      );
      await this.insertPaymentEvent(client, {
        organizationId: payment.organizationId,
        paymentId,
        type: 'CANCELLED',
        payload: { reason: dto.reason?.trim() || null },
      });
      await this.refreshCheckout(client, checkout, order, auth.userId);
      await this.recordMutation(client, auth, {
        scopeType: 'PAYMENT',
        scopeId: paymentId,
        mutationId: dto.mutationId,
        operation: 'payment.cancel',
        requestHash,
      });
      await this.audit(client, {
        organizationId: payment.organizationId,
        actorUserId: auth.userId,
        action: 'payment.cancelled',
        entityType: 'payment',
        entityId: paymentId,
        payload: {
          checkoutId: checkout.id,
          reason: dto.reason?.trim() || null,
        },
      });
    });

    return this.paymentResponse(auth, paymentId, payment.checkoutSessionId);
  }

  async cancelCheckout(
    auth: AuthContext,
    checkoutId: string,
    dto: CancelCheckoutDto,
  ) {
    const checkout = await this.requireAccessibleCheckout(auth, checkoutId);
    const requestHash = financialRequestHash({
      operation: 'checkout.cancel',
      checkoutId,
      reason: dto.reason.trim(),
    });

    await this.withTransaction(async (client) => {
      const lockedCheckout = await this.lockCheckout(
        client,
        checkout.organizationId,
        checkoutId,
      );
      const duplicate = await this.beginMutation(client, auth, {
        scopeType: 'CHECKOUT',
        scopeId: checkoutId,
        mutationId: dto.mutationId,
        operation: 'checkout.cancel',
        requestHash,
      });
      if (duplicate) return;

      const order = await this.lockOrder(
        client,
        checkout.organizationId,
        lockedCheckout.orderId,
      );
      this.assertCheckoutOpen(lockedCheckout, order);
      const paymentRows = await this.loadPaymentsWithClient(client, checkoutId);
      const balance = summarizeCheckout(
        lockedCheckout.orderTotalCents,
        paymentRows,
      );

      if (balance.capturedCents > 0) {
        throw new ConflictException({
          code: 'CHECKOUT_HAS_CAPTURED_PAYMENTS',
          message:
            'Un checkout con pagamenti acquisiti non può essere annullato.',
          capturedCents: balance.capturedCents,
        });
      }

      for (const pending of paymentRows.filter(
        (item) => item.status === 'PENDING',
      )) {
        await client.query(
          `
            UPDATE payment_transactions
            SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
            WHERE id = $1
          `,
          [pending.id],
        );
        await this.insertPaymentEvent(client, {
          organizationId: checkout.organizationId,
          paymentId: pending.id,
          type: 'CANCELLED',
          payload: { reason: 'CHECKOUT_CANCELLED' },
        });
      }

      await client.query(
        `
          UPDATE checkout_sessions
          SET
            status = 'CANCELLED',
            cancelled_at = NOW(),
            cancel_reason = $2,
            updated_at = NOW()
          WHERE id = $1
        `,
        [checkoutId, dto.reason.trim()],
      );
      const orderUpdate = await client.query(
        `
          UPDATE orders
          SET status = 'OPEN', version = version + 1, updated_at = NOW()
          WHERE id = $1
            AND organization_id = $2
            AND status = 'AWAITING_PAYMENT'
        `,
        [order.id, checkout.organizationId],
      );

      if (orderUpdate.rowCount !== 1) {
        throw new ConflictException({
          code: 'ORDER_PAYMENT_STATE_CONFLICT',
          message:
            'Lo stato dell’ordine non consente di annullare il checkout.',
        });
      }

      await this.recordMutation(client, auth, {
        scopeType: 'CHECKOUT',
        scopeId: checkoutId,
        mutationId: dto.mutationId,
        operation: 'checkout.cancel',
        requestHash,
      });
      await this.audit(client, {
        organizationId: checkout.organizationId,
        actorUserId: auth.userId,
        action: 'checkout.cancelled',
        entityType: 'checkout',
        entityId: checkoutId,
        payload: { orderId: order.id, reason: dto.reason.trim() },
      });
      await this.outbox(client, {
        topic: 'checkout.cancelled',
        aggregateType: 'checkout',
        aggregateId: checkoutId,
        payload: {
          organizationId: checkout.organizationId,
          orderId: order.id,
          reason: dto.reason.trim(),
        },
      });
    });

    return this.get(auth, checkoutId);
  }

  private async paymentResponse(
    auth: AuthContext,
    paymentId: string,
    checkoutId: string,
  ) {
    return {
      payment: await this.getPayment(auth, paymentId),
      checkout: await this.get(auth, checkoutId),
    };
  }

  private async requireAccessibleCheckout(
    auth: AuthContext,
    checkoutId: string,
  ): Promise<CheckoutRow> {
    const organizationId = assertOrganizationScope(auth);
    const checkout = await this.findCheckout(organizationId, checkoutId);
    if (!checkout) throw this.checkoutNotFound();
    await this.access.assertLocation(auth, checkout.locationId);
    return checkout;
  }

  private async requireAccessiblePayment(
    auth: AuthContext,
    paymentId: string,
  ): Promise<PaymentRow> {
    const organizationId = assertOrganizationScope(auth);
    const payment = await this.findPayment(organizationId, paymentId);
    if (!payment) throw this.paymentNotFound();
    await this.access.assertLocation(auth, payment.locationId);
    return payment;
  }

  private assertCheckoutOpen(
    checkout: CheckoutRow,
    order: OrderPaymentRow,
  ): void {
    if (checkout.status !== 'OPEN') {
      throw new ConflictException({
        code: 'CHECKOUT_NOT_OPEN',
        message: 'Il checkout non è più aperto.',
        status: checkout.status,
      });
    }

    if (order.status !== 'AWAITING_PAYMENT') {
      throw new ConflictException({
        code: 'ORDER_NOT_AWAITING_PAYMENT',
        message: 'L’ordine non è in attesa di pagamento.',
        status: order.status,
      });
    }

    if (
      order.totalCents !== checkout.orderTotalCents ||
      order.currency !== checkout.currency
    ) {
      throw new ConflictException({
        code: 'ORDER_TOTAL_CHANGED_DURING_CHECKOUT',
        message:
          'Il totale o la valuta dell’ordine sono cambiati durante il checkout.',
      });
    }
  }

  private async refreshCheckout(
    client: PoolClient,
    checkout: CheckoutRow,
    order: OrderPaymentRow,
    actorUserId: string,
  ): Promise<RefreshResult> {
    const payments = await this.loadBalancePayments(client, checkout.id);
    const balance = summarizeCheckout(checkout.orderTotalCents, payments);
    let completedNow = false;
    let orderVersion = order.version;

    if (balance.completed) {
      const checkoutUpdate = await client.query(
        `
          UPDATE checkout_sessions
          SET
            status = 'COMPLETED',
            paid_cents = $2,
            remaining_cents = 0,
            change_cents = $3,
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW()
          WHERE id = $1
            AND status = 'OPEN'
        `,
        [checkout.id, balance.capturedCents, balance.changeCents],
      );
      const orderUpdate = await client.query<QueryResultRow>(
        `
          UPDATE orders
          SET status = 'PAID', version = version + 1, updated_at = NOW()
          WHERE id = $1
            AND organization_id = $2
            AND status = 'AWAITING_PAYMENT'
          RETURNING version
        `,
        [order.id, checkout.organizationId],
      );

      if (checkoutUpdate.rowCount !== 1 || orderUpdate.rowCount !== 1) {
        throw new ConflictException({
          code: 'PAYMENT_COMPLETION_CONFLICT',
          message: 'Il checkout è stato completato da un’altra operazione.',
        });
      }

      orderVersion = Number(orderUpdate.rows[0]?.version ?? order.version + 1);
      completedNow = true;
      await this.audit(client, {
        organizationId: checkout.organizationId,
        actorUserId,
        action: 'checkout.completed',
        entityType: 'checkout',
        entityId: checkout.id,
        payload: {
          orderId: order.id,
          paidCents: balance.capturedCents,
          changeCents: balance.changeCents,
          orderVersion,
        },
      });
      await this.outbox(client, {
        topic: 'order.paid',
        aggregateType: 'order',
        aggregateId: order.id,
        payload: {
          organizationId: checkout.organizationId,
          locationId: checkout.locationId,
          checkoutId: checkout.id,
          totalCents: checkout.orderTotalCents,
          changeCents: balance.changeCents,
        },
      });
    } else {
      await client.query(
        `
          UPDATE checkout_sessions
          SET
            paid_cents = $2,
            remaining_cents = $3,
            change_cents = $4,
            updated_at = NOW()
          WHERE id = $1
            AND status = 'OPEN'
        `,
        [
          checkout.id,
          balance.capturedCents,
          balance.remainingCents,
          balance.changeCents,
        ],
      );
    }

    return { balance, completedNow, orderVersion };
  }

  private async loadBalancePayments(
    client: PoolClient,
    checkoutId: string,
  ): Promise<PaymentBalanceInput[]> {
    const result = await client.query<PaymentRow>(
      `
        SELECT status, amount_cents AS "amountCents", change_cents AS "changeCents"
        FROM payment_transactions
        WHERE checkout_session_id = $1
        ORDER BY created_at ASC, id ASC
      `,
      [checkoutId],
    );
    return result.rows;
  }

  private async loadPaymentsWithClient(
    client: PoolClient,
    checkoutId: string,
  ): Promise<PaymentRow[]> {
    const result = await client.query<PaymentRow>(
      `${this.paymentSelect()}
       WHERE pt.checkout_session_id = $1
       ORDER BY pt.created_at ASC, pt.id ASC
       FOR UPDATE`,
      [checkoutId],
    );
    return result.rows;
  }

  private async beginMutation(
    client: PoolClient,
    auth: AuthContext,
    input: {
      scopeType: 'CHECKOUT' | 'PAYMENT';
      scopeId: string;
      mutationId: string;
      operation: string;
      requestHash: string;
    },
  ): Promise<boolean> {
    const organizationId = assertOrganizationScope(auth);
    await this.advisoryLock(
      client,
      `financial-mutation:${organizationId}:${auth.deviceId}:${input.mutationId}`,
    );
    const result = await client.query<FinancialMutationRow>(
      `
        SELECT
          scope_type AS "scopeType",
          scope_id AS "scopeId",
          operation,
          request_hash AS "requestHash"
        FROM financial_mutations
        WHERE organization_id = $1
          AND device_id = $2
          AND mutation_id = $3
        LIMIT 1
      `,
      [organizationId, auth.deviceId, input.mutationId],
    );
    const existing = result.rows[0];

    if (!existing) return false;

    if (
      existing.scopeType !== input.scopeType ||
      existing.scopeId !== input.scopeId ||
      existing.operation !== input.operation ||
      existing.requestHash !== input.requestHash
    ) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message:
          'La mutationId è già stata usata con una richiesta differente.',
      });
    }

    return true;
  }

  private async recordMutation(
    client: PoolClient,
    auth: AuthContext,
    input: {
      scopeType: 'CHECKOUT' | 'PAYMENT';
      scopeId: string;
      mutationId: string;
      operation: string;
      requestHash: string;
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO financial_mutations (
          id,
          organization_id,
          device_id,
          mutation_id,
          scope_type,
          scope_id,
          operation,
          request_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        randomUUID(),
        assertOrganizationScope(auth),
        auth.deviceId,
        input.mutationId,
        input.scopeType,
        input.scopeId,
        input.operation,
        input.requestHash,
      ],
    );
  }

  private async insertPaymentEvent(
    client: PoolClient,
    event: {
      organizationId: string;
      paymentId: string;
      type: PaymentEventType;
      providerEventId?: string | null;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO payment_events (
          id,
          organization_id,
          payment_id,
          type,
          provider_event_id,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        randomUUID(),
        event.organizationId,
        event.paymentId,
        event.type,
        event.providerEventId ?? null,
        JSON.stringify(event.payload),
      ],
    );
  }

  private async assertProviderEventAvailable(
    client: PoolClient,
    organizationId: string,
    providerEventId: string | undefined,
    paymentId: string,
  ): Promise<void> {
    const normalized = providerEventId?.trim();
    if (!normalized) return;

    const result = await client.query<ProviderEventLookupRow>(
      `
        SELECT payment_id AS "paymentId"
        FROM payment_events
        WHERE organization_id = $1
          AND provider_event_id = $2
        LIMIT 1
      `,
      [organizationId, normalized],
    );
    const existingPaymentId = result.rows[0]?.paymentId;

    if (existingPaymentId && existingPaymentId !== paymentId) {
      throw new ConflictException({
        code: 'PROVIDER_EVENT_ALREADY_USED',
        message:
          'L’evento del provider è già stato associato a un altro pagamento.',
      });
    }
  }

  private async lockCheckout(
    client: PoolClient,
    organizationId: string,
    checkoutId: string,
  ): Promise<CheckoutRow> {
    const result = await client.query<CheckoutRow>(
      `${this.checkoutSelect()}
       WHERE cs.id = $1
         AND cs.organization_id = $2
       FOR UPDATE`,
      [checkoutId, organizationId],
    );
    const checkout = result.rows[0];
    if (!checkout) throw this.checkoutNotFound();
    return checkout;
  }

  private async lockPayment(
    client: PoolClient,
    organizationId: string,
    paymentId: string,
  ): Promise<PaymentRow> {
    const result = await client.query<PaymentRow>(
      `${this.paymentSelect()}
       WHERE pt.id = $1
         AND pt.organization_id = $2
       FOR UPDATE`,
      [paymentId, organizationId],
    );
    const payment = result.rows[0];
    if (!payment) throw this.paymentNotFound();
    return payment;
  }

  private async lockOrder(
    client: PoolClient,
    organizationId: string,
    orderId: string,
  ): Promise<OrderPaymentRow> {
    const result = await client.query<OrderPaymentRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          number,
          status,
          currency,
          version,
          total_cents AS "totalCents"
        FROM orders
        WHERE id = $1
          AND organization_id = $2
        FOR UPDATE
      `,
      [orderId, organizationId],
    );
    const order = result.rows[0];
    if (!order) throw this.orderNotFound();
    return order;
  }

  private async findCheckout(
    organizationId: string,
    checkoutId: string,
  ): Promise<CheckoutRow | null> {
    const result = await this.database.pool.query<CheckoutRow>(
      `${this.checkoutSelect()}
       WHERE cs.id = $1
         AND cs.organization_id = $2
       LIMIT 1`,
      [checkoutId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async findPayment(
    organizationId: string,
    paymentId: string,
  ): Promise<PaymentRow | null> {
    const result = await this.database.pool.query<PaymentRow>(
      `${this.paymentSelect()}
       WHERE pt.id = $1
         AND pt.organization_id = $2
       LIMIT 1`,
      [paymentId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async findOrder(
    organizationId: string,
    orderId: string,
  ): Promise<OrderPaymentRow | null> {
    const result = await this.database.pool.query<OrderPaymentRow>(
      `
        SELECT
          id,
          organization_id AS "organizationId",
          location_id AS "locationId",
          number,
          status,
          currency,
          version,
          total_cents AS "totalCents"
        FROM orders
        WHERE id = $1
          AND organization_id = $2
        LIMIT 1
      `,
      [orderId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async findByClientCheckoutId(
    organizationId: string,
    deviceId: string,
    clientCheckoutId: string,
  ): Promise<CheckoutRow | null> {
    const result = await this.database.pool.query<CheckoutRow>(
      `${this.checkoutSelect()}
       WHERE cs.organization_id = $1
         AND cs.device_id = $2
         AND cs.client_checkout_id = $3
       LIMIT 1`,
      [organizationId, deviceId, clientCheckoutId],
    );
    return result.rows[0] ?? null;
  }

  private async findByClientCheckoutIdWithClient(
    client: PoolClient,
    organizationId: string,
    deviceId: string,
    clientCheckoutId: string,
  ): Promise<CheckoutRow | null> {
    const result = await client.query<CheckoutRow>(
      `${this.checkoutSelect()}
       WHERE cs.organization_id = $1
         AND cs.device_id = $2
         AND cs.client_checkout_id = $3
       LIMIT 1`,
      [organizationId, deviceId, clientCheckoutId],
    );
    return result.rows[0] ?? null;
  }

  private async findByClientPaymentId(
    organizationId: string,
    deviceId: string,
    clientPaymentId: string,
  ): Promise<PaymentRow | null> {
    const result = await this.database.pool.query<PaymentRow>(
      `${this.paymentSelect()}
       WHERE pt.organization_id = $1
         AND pt.device_id = $2
         AND pt.client_payment_id = $3
       LIMIT 1`,
      [organizationId, deviceId, clientPaymentId],
    );
    return result.rows[0] ?? null;
  }

  private async findByClientPaymentIdWithClient(
    client: PoolClient,
    organizationId: string,
    deviceId: string,
    clientPaymentId: string,
  ): Promise<PaymentRow | null> {
    const result = await client.query<PaymentRow>(
      `${this.paymentSelect()}
       WHERE pt.organization_id = $1
         AND pt.device_id = $2
         AND pt.client_payment_id = $3
       LIMIT 1`,
      [organizationId, deviceId, clientPaymentId],
    );
    return result.rows[0] ?? null;
  }

  private assertEquivalentCheckout(
    checkout: CheckoutRow,
    orderId: string,
    requestHash: string,
  ): void {
    if (checkout.orderId !== orderId || checkout.requestHash !== requestHash) {
      throw new ConflictException({
        code: 'CLIENT_CHECKOUT_ID_REUSED',
        message: 'Il clientCheckoutId è già stato usato con dati differenti.',
      });
    }
  }

  private assertEquivalentPayment(
    payment: PaymentRow,
    checkoutId: string,
    requestHash: string,
  ): void {
    if (
      payment.checkoutSessionId !== checkoutId ||
      payment.requestHash !== requestHash
    ) {
      throw new ConflictException({
        code: 'CLIENT_PAYMENT_ID_REUSED',
        message: 'Il clientPaymentId è già stato usato con dati differenti.',
      });
    }
  }

  private checkoutSelect(): string {
    return `
      SELECT
        cs.id,
        cs.organization_id AS "organizationId",
        cs.location_id AS "locationId",
        cs.order_id AS "orderId",
        cs.device_id AS "deviceId",
        cs.created_by_user_id AS "createdByUserId",
        cs.client_checkout_id AS "clientCheckoutId",
        cs.request_hash AS "requestHash",
        cs.status,
        cs.currency,
        cs.order_version_snapshot AS "orderVersionSnapshot",
        cs.order_total_cents AS "orderTotalCents",
        cs.paid_cents AS "paidCents",
        cs.remaining_cents AS "remainingCents",
        cs.change_cents AS "changeCents",
        cs.completed_at AS "completedAt",
        cs.cancelled_at AS "cancelledAt",
        cs.cancel_reason AS "cancelReason",
        cs.created_at AS "createdAt",
        cs.updated_at AS "updatedAt"
      FROM checkout_sessions cs
    `;
  }

  private paymentSelect(): string {
    return `
      SELECT
        pt.id,
        pt.organization_id AS "organizationId",
        pt.location_id AS "locationId",
        pt.checkout_session_id AS "checkoutSessionId",
        pt.order_id AS "orderId",
        pt.device_id AS "deviceId",
        pt.created_by_user_id AS "createdByUserId",
        pt.client_payment_id AS "clientPaymentId",
        pt.request_hash AS "requestHash",
        pt.method,
        pt.provider,
        pt.status,
        pt.amount_cents AS "amountCents",
        pt.tendered_cents AS "tenderedCents",
        pt.change_cents AS "changeCents",
        pt.provider_reference AS "providerReference",
        pt.failure_code AS "failureCode",
        pt.failure_message AS "failureMessage",
        pt.captured_at AS "capturedAt",
        pt.failed_at AS "failedAt",
        pt.cancelled_at AS "cancelledAt",
        pt.created_at AS "createdAt",
        pt.updated_at AS "updatedAt"
      FROM payment_transactions pt
    `;
  }

  private async audit(
    client: PoolClient,
    event: {
      organizationId: string;
      actorUserId: string;
      action: string;
      entityType: string;
      entityId: string;
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
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        randomUUID(),
        event.organizationId,
        event.actorUserId,
        event.action,
        event.entityType,
        event.entityId,
        JSON.stringify(event.payload),
      ],
    );
  }

  private async outbox(
    client: PoolClient,
    event: {
      topic: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO outbox_events (
          id,
          topic,
          aggregate_type,
          aggregate_id,
          payload
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [
        randomUUID(),
        event.topic,
        event.aggregateType,
        event.aggregateId,
        JSON.stringify(event.payload),
      ],
    );
  }

  private async advisoryLock(client: PoolClient, key: string): Promise<void> {
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [key],
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
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private checkoutNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'CHECKOUT_NOT_FOUND',
      message: 'Checkout non trovato.',
    });
  }

  private paymentNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'PAYMENT_NOT_FOUND',
      message: 'Pagamento non trovato.',
    });
  }

  private orderNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'ORDER_NOT_FOUND',
      message: 'Ordine non trovato.',
    });
  }

  private isConstraint(error: unknown, constraint: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'constraint' in error &&
      (error as { code?: string }).code === '23505' &&
      (error as { constraint?: string }).constraint === constraint
    );
  }
}
