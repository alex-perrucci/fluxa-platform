// PHASE_7_RUNTIME_INTEGRATION
import { createLocalPool } from './local-database-guard.mjs';
import { PHASE_7 } from './phase-2-runtime-fixture.mjs';

const pool = createLocalPool();

const eventEntries = Object.values(PHASE_7.events);

function eventAmount(event) {
  return event.slug === PHASE_7.events.free.slug ? 0 : 1_000;
}

async function cleanup(client) {
  const organizationId = PHASE_7.organizationId;

  await client.query(
    `DELETE FROM platform_fee_ledger WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM reservation_status_history WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM reservation_payments WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM reservation_table_assignments WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(`DELETE FROM reservations WHERE organization_id = $1`, [
    organizationId,
  ]);
  await client.query(
    `DELETE FROM reservation_holds WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM platform_fee_rules WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM event_booking_rules WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(
    `DELETE FROM event_table_inventory WHERE organization_id = $1`,
    [organizationId],
  );
  await client.query(`DELETE FROM event_media WHERE organization_id = $1`, [
    organizationId,
  ]);
  await client.query(`DELETE FROM events WHERE organization_id = $1`, [
    organizationId,
  ]);
  await client.query(`DELETE FROM dining_tables WHERE organization_id = $1`, [
    organizationId,
  ]);
  await client.query(`DELETE FROM dining_areas WHERE organization_id = $1`, [
    organizationId,
  ]);
  await client.query(`DELETE FROM audit_events WHERE organization_id = $1`, [
    organizationId,
  ]);
  await client.query(
    `DELETE FROM outbox_events WHERE payload ->> 'organizationId' = $1`,
    [organizationId],
  );
}

async function seedBase(client) {
  await client.query(
    `
      INSERT INTO users (
        id,
        email,
        password_hash,
        display_name,
        platform_admin,
        status,
        email_verified_at
      )
      VALUES ($1,$2,$3,$4,FALSE,'ACTIVE',NOW())
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        status = 'ACTIVE',
        updated_at = NOW()
    `,
    [
      PHASE_7.userId,
      'phase7-runtime@fluxa.local',
      'phase-7-not-valid-for-login',
      'Phase 7 Runtime',
    ],
  );

  await client.query(
    `
      INSERT INTO organizations (
        id,
        slug,
        name,
        status,
        created_by_user_id
      )
      VALUES ($1,$2,$3,'ACTIVE',$4)
      ON CONFLICT (id) DO UPDATE SET
        slug = EXCLUDED.slug,
        name = EXCLUDED.name,
        status = 'ACTIVE',
        updated_at = NOW()
    `,
    [
      PHASE_7.organizationId,
      'phase-7-runtime',
      'Phase 7 Runtime Organization',
      PHASE_7.userId,
    ],
  );

  await client.query(
    `
      INSERT INTO merchants (
        id,
        organization_id,
        legal_name,
        trade_name,
        vat_number,
        country_code,
        status
      )
      VALUES ($1,$2,$3,$4,$5,'IT','ACTIVE')
      ON CONFLICT (id) DO UPDATE SET
        legal_name = EXCLUDED.legal_name,
        trade_name = EXCLUDED.trade_name,
        status = 'ACTIVE',
        updated_at = NOW()
    `,
    [
      PHASE_7.merchantId,
      PHASE_7.organizationId,
      'Fluxa Phase 7 S.r.l.',
      'Fluxa Phase 7',
      'IT00000000007',
    ],
  );

  await client.query(
    `
      INSERT INTO locations (
        id,
        organization_id,
        merchant_id,
        code,
        name,
        address_line_1,
        postal_code,
        city,
        province,
        country_code,
        timezone,
        status
      )
      VALUES (
        $1,$2,$3,'PHASE7','Phase 7 Runtime',
        'Via Runtime 7','43121','Parma','PR','IT',
        'Europe/Rome','ACTIVE'
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = 'ACTIVE',
        updated_at = NOW()
    `,
    [PHASE_7.locationId, PHASE_7.organizationId, PHASE_7.merchantId],
  );

  await client.query(
    `
      INSERT INTO organization_memberships (
        id,
        organization_id,
        user_id,
        role,
        status,
        default_location_id
      )
      VALUES (
        '77000000-0000-4000-8000-000000000007',
        $1,$2,'OWNER','ACTIVE',$3
      )
      ON CONFLICT (organization_id, user_id) DO UPDATE SET
        role = 'OWNER',
        status = 'ACTIVE',
        default_location_id = EXCLUDED.default_location_id,
        updated_at = NOW()
    `,
    [PHASE_7.organizationId, PHASE_7.userId, PHASE_7.locationId],
  );

  await client.query(
    `
      INSERT INTO dining_areas (
        id,
        organization_id,
        location_id,
        code,
        name,
        sort_order,
        status
      )
      VALUES ($1,$2,$3,'PHASE7','Phase 7 Runtime',0,'ACTIVE')
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        status = 'ACTIVE',
        updated_at = NOW()
    `,
    [PHASE_7.areaId, PHASE_7.organizationId, PHASE_7.locationId],
  );
}

async function seedEvents(client) {
  const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1_000);
  const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1_000);
  const bookingOpensAt = new Date(Date.now() - 60 * 60 * 1_000);
  const bookingClosesAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);

  for (const [index, event] of eventEntries.entries()) {
    await client.query(
      `
        INSERT INTO dining_tables (
          id,
          organization_id,
          location_id,
          area_id,
          code,
          name,
          capacity,
          sort_order,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6,4,$7,'ACTIVE')
        ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          capacity = 4,
          status = 'ACTIVE',
          updated_at = NOW()
      `,
      [
        event.tableId,
        PHASE_7.organizationId,
        PHASE_7.locationId,
        PHASE_7.areaId,
        event.tableCode,
        event.tableName,
        index,
      ],
    );

    await client.query(
      `
        INSERT INTO events (
          id,
          organization_id,
          location_id,
          created_by_user_id,
          title,
          slug,
          description,
          timezone,
          status,
          starts_at,
          ends_at,
          booking_opens_at,
          booking_closes_at,
          booking_amount_cents,
          currency,
          capacity,
          cancellation_policy,
          version,
          published_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,'Europe/Rome','PUBLISHED',
          $8,$9,$10,$11,$12,'EUR',4,
          'Fixture locale Fase 07',1,NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          slug = EXCLUDED.slug,
          description = EXCLUDED.description,
          status = 'PUBLISHED',
          starts_at = EXCLUDED.starts_at,
          ends_at = EXCLUDED.ends_at,
          booking_opens_at = EXCLUDED.booking_opens_at,
          booking_closes_at = EXCLUDED.booking_closes_at,
          booking_amount_cents = EXCLUDED.booking_amount_cents,
          capacity = 4,
          published_at = NOW(),
          cancelled_at = NULL,
          completed_at = NULL,
          archived_at = NULL,
          version = events.version + 1,
          updated_at = NOW()
      `,
      [
        event.id,
        PHASE_7.organizationId,
        PHASE_7.locationId,
        PHASE_7.userId,
        `Phase 7 ${event.tableName}`,
        event.slug,
        `Evento runtime per ${event.slug}`,
        startsAt,
        endsAt,
        bookingOpensAt,
        bookingClosesAt,
        eventAmount(event),
      ],
    );

    await client.query(
      `
        INSERT INTO event_table_inventory (
          id,
          organization_id,
          location_id,
          event_id,
          dining_table_id,
          capacity_snapshot,
          enabled
        )
        VALUES (
          gen_random_uuid(),$1,$2,$3,$4,4,TRUE
        )
      `,
      [PHASE_7.organizationId, PHASE_7.locationId, event.id, event.tableId],
    );

    await client.query(
      `
        INSERT INTO event_booking_rules (
          id,
          organization_id,
          location_id,
          event_id,
          min_party_size,
          max_party_size,
          hold_minutes,
          booking_cutoff_minutes,
          cancellation_cutoff_minutes,
          auto_assign_smallest_table,
          allow_manual_assignment,
          require_phone
        )
        VALUES (
          gen_random_uuid(),$1,$2,$3,1,4,2,0,0,TRUE,TRUE,TRUE
        )
      `,
      [PHASE_7.organizationId, PHASE_7.locationId, event.id],
    );
  }

  await client.query(
    `
      INSERT INTO platform_fee_rules (
        id,
        scope,
        organization_id,
        event_id,
        basis_points,
        active,
        effective_from,
        created_by_user_id
      )
      VALUES ($1,'ORGANIZATION',$2,NULL,750,TRUE,NOW() - INTERVAL '1 day',$3)
      ON CONFLICT (id) DO UPDATE SET
        basis_points = 750,
        active = TRUE,
        effective_from = NOW() - INTERVAL '1 day',
        effective_to = NULL,
        updated_at = NOW()
    `,
    [PHASE_7.feeRuleId, PHASE_7.organizationId, PHASE_7.userId],
  );
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await cleanup(client);
    await seedBase(client);
    await seedEvents(client);
    await client.query('COMMIT');

    console.log('Seed runtime Fase 07 completato');
    console.log(`Organizzazione: ${PHASE_7.organizationId}`);
    console.log(`Eventi: ${eventEntries.length}`);
    console.log('Tavoli per evento: 1');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
