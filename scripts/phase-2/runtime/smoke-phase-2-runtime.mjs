// PHASE_7_RUNTIME_INTEGRATION
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { createLocalPool } from './local-database-guard.mjs';
import { PHASE_7 } from './phase-2-runtime-fixture.mjs';

const pool = createLocalPool();
const apiBaseUrl =
  process.env.PHASE2_API_BASE_URL ??
  `http://127.0.0.1:${PHASE_7.apiPort}/api/v1`;
const stripe = new Stripe('sk_test_phase7_local_signature_only');

function logStep(message) {
  console.log(`\n[phase-7] ${message}`);
}

async function requestJson(path, options = {}) {
  const headers = new Headers(options.headers ?? {});

  if (options.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    body:
      options.body === undefined
        ? undefined
        : typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return {
    status: response.status,
    body,
  };
}

function assertSuccess(result, context) {
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${context}: HTTP ${result.status} ${JSON.stringify(result.body)}`,
  );
}

function createHold(slug, partySize = 4) {
  const holdToken = randomUUID();
  const idempotencyKey = `phase7-hold-${randomUUID()}`;
  const body = { partySize, holdToken, idempotencyKey };

  return {
    holdToken,
    idempotencyKey,
    body,
    request: () =>
      requestJson(`/public/events/${slug}/holds`, {
        method: 'POST',
        body,
      }),
  };
}

async function convertHold(holdToken) {
  const reservationToken = randomUUID();
  const body = {
    reservationToken,
    customerName: 'Mario Runtime',
    customerEmail: 'mario.runtime@example.com',
    customerPhone: '+39 333 1234567',
    customerNote: 'Smoke test Fase 07',
  };
  const result = await requestJson(
    `/public/reservation-holds/${holdToken}/reservations`,
    {
      method: 'POST',
      body,
    },
  );

  assertSuccess(result, 'conversione hold');

  return {
    reservationToken,
    body,
    result,
  };
}

async function insertSyntheticPayment(reservationId, sessionId) {
  const result = await pool.query(
    `
      INSERT INTO reservation_payments (
        id,
        organization_id,
        location_id,
        reservation_id,
        status,
        provider,
        provider_session_id,
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
      SELECT
        $2,
        organization_id,
        location_id,
        id,
        'REQUIRES_ACTION',
        'STRIPE',
        $3,
        $4,
        $5,
        amount_cents,
        platform_fee_cents,
        merchant_gross_cents,
        0,
        merchant_gross_cents,
        0,
        currency
      FROM reservations
      WHERE id = $1
      RETURNING id
    `,
    [
      reservationId,
      randomUUID(),
      sessionId,
      `phase7-payment-${randomUUID()}`,
      '7'.repeat(64),
    ],
  );

  assert.equal(result.rowCount, 1);
  return result.rows[0].id;
}

async function sendSignedPaidWebhook({
  paymentId,
  sessionId,
  eventId,
}) {
  const payload = JSON.stringify({
    id: eventId,
    object: 'event',
    api_version: '2026-06-24.dahlia',
    created: Math.floor(Date.now() / 1_000),
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        metadata: {
          reservationPaymentId: paymentId,
        },
        payment_intent: null,
        payment_status: 'paid',
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null,
    },
    type: 'checkout.session.completed',
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: PHASE_7.webhookSecret,
  });
  const result = await requestJson(
    '/public/reservation-payments/stripe/webhook',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
      },
      body: payload,
    },
  );

  assertSuccess(result, 'webhook Stripe firmato');
  assert.deepEqual(result.body, { received: true });
}

async function pollDatabase(check, options = {}) {
  const timeoutMs = options.timeoutMs ?? 95_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  let lastValue;

  while (Date.now() < deadline) {
    lastValue = await check();

    if (lastValue?.done) {
      return lastValue.value;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timeout attesa worker. Ultimo valore: ${JSON.stringify(lastValue)}`,
  );
}

async function verifyMigrations() {
  logStep('verifica migrazioni applicate');

  const result = await pool.query(`
    SELECT
      to_regclass('public.events') IS NOT NULL AS "eventsPresent",
      to_regclass('public.reservations') IS NOT NULL AS "reservationsPresent",
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'reservations'
          AND column_name = 'payment_expires_at'
      ) AS "paymentExpiryPresent"
  `);
  const row = result.rows[0];

  assert.equal(row.eventsPresent, true);
  assert.equal(row.reservationsPresent, true);
  assert.equal(row.paymentExpiryPresent, true);
}

async function verifyAvailabilityAndConcurrency() {
  logStep('availability e concorrenza su tavolo singolo');

  const event = PHASE_7.events.concurrency;
  const availability = await requestJson(
    `/public/events/${event.slug}/availability?partySize=4`,
  );

  assertSuccess(availability, 'availability iniziale');
  assert.equal(availability.body.available, true);
  assert.equal(availability.body.availableTableCount, 1);

  const first = createHold(event.slug);
  const second = createHold(event.slug);
  const [firstResult, secondResult] = await Promise.all([
    first.request(),
    second.request(),
  ]);
  const results = [
    { fixture: first, result: firstResult },
    { fixture: second, result: secondResult },
  ];
  const successes = results.filter(
    ({ result }) => result.status >= 200 && result.status < 300,
  );
  const conflicts = results.filter(({ result }) => result.status === 409);

  assert.equal(successes.length, 1, JSON.stringify(results));
  assert.equal(conflicts.length, 1, JSON.stringify(results));

  const winner = successes[0];
  const retry = await winner.fixture.request();

  assertSuccess(retry, 'retry hold idempotente');
  assert.equal(retry.body.id, winner.result.body.id);

  const cancellation = await requestJson(
    `/public/reservation-holds/${winner.fixture.holdToken}`,
    { method: 'DELETE' },
  );

  assertSuccess(cancellation, 'cancellazione hold');
  assert.equal(cancellation.body.status, 'CANCELLED');
}

async function verifyConversionAndSignedWebhook() {
  logStep('conversione paid e webhook Stripe firmato');

  const hold = createHold(PHASE_7.events.paid.slug);
  const holdResult = await hold.request();

  assertSuccess(holdResult, 'creazione hold paid');
  assert.equal(holdResult.body.platformFeeCents, 75);

  const conversion = await convertHold(hold.holdToken);
  const reservation = conversion.result.body;

  assert.equal(reservation.status, 'PENDING_PAYMENT');
  assert.equal(reservation.payment.required, true);
  assert.equal(
    reservation.payment.nextAction,
    'CREATE_CHECKOUT_SESSION',
  );

  const retry = await requestJson(
    `/public/reservation-holds/${hold.holdToken}/reservations`,
    {
      method: 'POST',
      body: conversion.body,
    },
  );

  assertSuccess(retry, 'retry conversione');
  assert.equal(retry.body.id, reservation.id);

  const sessionId = `cs_test_phase7_${randomUUID().replaceAll('-', '')}`;
  const paymentId = await insertSyntheticPayment(
    reservation.id,
    sessionId,
  );

  await sendSignedPaidWebhook({
    paymentId,
    sessionId,
    eventId: `evt_phase7_${randomUUID().replaceAll('-', '')}`,
  });

  const view = await requestJson(
    `/public/reservations/${conversion.reservationToken}`,
  );

  assertSuccess(view, 'lettura reservation confermata');
  assert.equal(view.body.status, 'CONFIRMED');

  const databaseState = await pool.query(
    `
      SELECT
        r.status AS "reservationStatus",
        rp.status AS "paymentStatus",
        rta.status AS "assignmentStatus",
        COUNT(pfl.id)::int AS "ledgerEntries"
      FROM reservations r
      JOIN reservation_payments rp
        ON rp.reservation_id = r.id
      JOIN reservation_table_assignments rta
        ON rta.reservation_id = r.id
      LEFT JOIN platform_fee_ledger pfl
        ON pfl.reservation_id = r.id
      WHERE r.id = $1
      GROUP BY r.status, rp.status, rta.status
    `,
    [reservation.id],
  );
  const state = databaseState.rows[0];

  assert.equal(state.reservationStatus, 'CONFIRMED');
  assert.equal(state.paymentStatus, 'PAID');
  assert.equal(state.assignmentStatus, 'ACTIVE');
  assert.equal(state.ledgerEntries, 1);
}

async function verifyFreeReservation() {
  logStep('prenotazione gratuita confermata senza checkout');

  const hold = createHold(PHASE_7.events.free.slug);
  const holdResult = await hold.request();

  assertSuccess(holdResult, 'creazione hold gratuito');

  const conversion = await convertHold(hold.holdToken);

  assert.equal(conversion.result.body.status, 'CONFIRMED');
  assert.equal(conversion.result.body.payment.required, false);
  assert.equal(conversion.result.body.payment.nextAction, 'NONE');
}

async function verifyHoldExpiryWorker() {
  logStep('scadenza hold tramite background worker');

  const hold = createHold(PHASE_7.events.holdExpiry.slug);
  const holdResult = await hold.request();

  assertSuccess(holdResult, 'creazione hold da far scadere');

  await pool.query(
    `
      UPDATE reservation_holds
      SET
        created_at = NOW() - INTERVAL '10 minutes',
        expires_at = NOW() - INTERVAL '1 second',
        updated_at = NOW()
      WHERE id = $1
    `,
    [holdResult.body.id],
  );

  const state = await pollDatabase(async () => {
    const result = await pool.query(
      `
        SELECT
          h.status AS "holdStatus",
          rta.status AS "assignmentStatus"
        FROM reservation_holds h
        JOIN reservation_table_assignments rta
          ON rta.hold_id = h.id
        WHERE h.id = $1
      `,
      [holdResult.body.id],
    );
    const row = result.rows[0];

    return {
      done:
        row?.holdStatus === 'EXPIRED' &&
        row?.assignmentStatus === 'RELEASED',
      value: row,
    };
  });

  assert.equal(state.holdStatus, 'EXPIRED');
  assert.equal(state.assignmentStatus, 'RELEASED');
}

async function verifyPaymentExpiryWorker() {
  logStep('scadenza PENDING_PAYMENT tramite background worker');

  const hold = createHold(PHASE_7.events.paymentExpiry.slug);
  const holdResult = await hold.request();

  assertSuccess(holdResult, 'creazione hold payment expiry');

  const conversion = await convertHold(hold.holdToken);
  const reservationId = conversion.result.body.id;

  await pool.query(
    `
      UPDATE reservations
      SET
        payment_expires_at = NOW() - INTERVAL '1 second',
        updated_at = NOW()
      WHERE id = $1
    `,
    [reservationId],
  );

  const state = await pollDatabase(async () => {
    const result = await pool.query(
      `
        SELECT
          r.status AS "reservationStatus",
          rta.status AS "assignmentStatus",
          rta.release_reason AS "releaseReason"
        FROM reservations r
        JOIN reservation_table_assignments rta
          ON rta.reservation_id = r.id
        WHERE r.id = $1
      `,
      [reservationId],
    );
    const row = result.rows[0];

    return {
      done:
        row?.reservationStatus === 'EXPIRED' &&
        row?.assignmentStatus === 'RELEASED',
      value: row,
    };
  });

  assert.equal(state.reservationStatus, 'EXPIRED');
  assert.equal(state.assignmentStatus, 'RELEASED');
  assert.equal(state.releaseReason, 'PAYMENT_TIMEOUT');
}

async function verifyLatePaymentProtection() {
  logStep('pagamento tardivo protetto con REFUND_PENDING');

  const hold = createHold(PHASE_7.events.latePayment.slug);
  const holdResult = await hold.request();

  assertSuccess(holdResult, 'creazione hold late payment');

  const conversion = await convertHold(hold.holdToken);
  const reservationId = conversion.result.body.id;

  await pool.query('BEGIN');

  try {
    await pool.query(
      `
        UPDATE reservation_table_assignments
        SET
          status = 'RELEASED',
          active_event_table_key = NULL,
          released_at = NOW(),
          release_reason = 'PHASE_7_LATE_PAYMENT',
          version = version + 1,
          updated_at = NOW()
        WHERE reservation_id = $1
      `,
      [reservationId],
    );
    await pool.query(
      `
        UPDATE reservations
        SET
          status = 'EXPIRED',
          payment_expires_at = NULL,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1
      `,
      [reservationId],
    );
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }

  const sessionId = `cs_test_phase7_late_${randomUUID().replaceAll('-', '')}`;
  const paymentId = await insertSyntheticPayment(
    reservationId,
    sessionId,
  );

  await sendSignedPaidWebhook({
    paymentId,
    sessionId,
    eventId: `evt_phase7_late_${randomUUID().replaceAll('-', '')}`,
  });

  const state = await pool.query(
    `
      SELECT
        r.status AS "reservationStatus",
        rp.status AS "paymentStatus",
        rta.status AS "assignmentStatus",
        COUNT(pfl.id)::int AS "ledgerEntries"
      FROM reservations r
      JOIN reservation_payments rp
        ON rp.reservation_id = r.id
      JOIN reservation_table_assignments rta
        ON rta.reservation_id = r.id
      LEFT JOIN platform_fee_ledger pfl
        ON pfl.reservation_id = r.id
      WHERE r.id = $1
      GROUP BY r.status, rp.status, rta.status
    `,
    [reservationId],
  );
  const row = state.rows[0];

  assert.equal(row.reservationStatus, 'REFUND_PENDING');
  assert.equal(row.paymentStatus, 'PAID');
  assert.equal(row.assignmentStatus, 'RELEASED');
  assert.equal(row.ledgerEntries, 1);
}

async function verifyAuditAndOutbox() {
  logStep('audit e outbox runtime');

  const result = await pool.query(
    `
      SELECT
        (
          SELECT COUNT(*)::int
          FROM audit_events
          WHERE organization_id = $1::uuid
        ) AS "auditCount",
        (
          SELECT COUNT(*)::int
          FROM outbox_events
          WHERE payload ->> 'organizationId' = $2
        ) AS "outboxCount"
    `,
    [PHASE_7.organizationId, PHASE_7.organizationId],
  );
  const row = result.rows[0];

  assert.ok(row.auditCount >= 10, JSON.stringify(row));
  assert.ok(row.outboxCount >= 10, JSON.stringify(row));
}

async function main() {
  try {
    await verifyMigrations();
    await verifyAvailabilityAndConcurrency();
    await verifyConversionAndSignedWebhook();
    await verifyFreeReservation();
    await verifyHoldExpiryWorker();
    await verifyPaymentExpiryWorker();
    await verifyLatePaymentProtection();
    await verifyAuditAndOutbox();

    console.log('\nFase 07 runtime smoke: PASS');
    console.log('Concorrenza tavolo: PASS');
    console.log('Conversione e idempotenza: PASS');
    console.log('Webhook Stripe firmato: PASS');
    console.log('Worker hold/payment expiry: PASS');
    console.log('Late payment REFUND_PENDING: PASS');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
