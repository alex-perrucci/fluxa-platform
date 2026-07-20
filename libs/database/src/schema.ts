import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const userStatus = pgEnum('user_status', ['ACTIVE', 'DISABLED']);

export const organizationStatus = pgEnum('organization_status', [
  'ACTIVE',
  'SUSPENDED',
]);

export const membershipRole = pgEnum('membership_role', [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'CASHIER',
  'WAITER',
  'ACCOUNTANT',
  'SUPPORT_READONLY',
]);

export const membershipStatus = pgEnum('membership_status', [
  'ACTIVE',
  'SUSPENDED',
]);

export const devicePlatform = pgEnum('device_platform', [
  'ANDROID',
  'IOS',
  'WINDOWS',
  'WEB',
  'OTHER',
]);

export const deviceStatus = pgEnum('device_status', ['ACTIVE', 'REVOKED']);

export const merchantStatus = pgEnum('merchant_status', ['ACTIVE', 'INACTIVE']);

export const locationStatus = pgEnum('location_status', ['ACTIVE', 'INACTIVE']);

export const authSessionStatus = pgEnum('auth_session_status', [
  'ACTIVE',
  'REVOKED',
]);

export const outboxStatus = pgEnum('outbox_status', [
  'PENDING',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
]);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: varchar('display_name', { length: 160 }).notNull(),
    platformAdmin: boolean('platform_admin').notNull().default(false),
    status: userStatus('status').notNull().default('ACTIVE'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_uq').on(table.email),
    index('users_status_idx').on(table.status),
  ],
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 80 }).notNull(),
    name: varchar('name', { length: 180 }).notNull(),
    status: organizationStatus('status').notNull().default('ACTIVE'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('organizations_slug_uq').on(table.slug),
    index('organizations_status_idx').on(table.status),
  ],
);

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull(),
    status: membershipStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('organization_memberships_org_user_uq').on(
      table.organizationId,
      table.userId,
    ),
    index('organization_memberships_user_idx').on(table.userId, table.status),
    index('organization_memberships_org_role_idx').on(
      table.organizationId,
      table.role,
      table.status,
    ),
  ],
);

export const merchants = pgTable(
  'merchants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    legalName: varchar('legal_name', { length: 220 }).notNull(),
    tradeName: varchar('trade_name', { length: 220 }),
    vatNumber: varchar('vat_number', { length: 32 }).notNull(),
    taxCode: varchar('tax_code', { length: 32 }),
    countryCode: char('country_code', { length: 2 }).notNull().default('IT'),
    status: merchantStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('merchants_org_vat_uq').on(
      table.organizationId,
      table.vatNumber,
    ),
    index('merchants_org_status_idx').on(table.organizationId, table.status),
  ],
);

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 180 }).notNull(),
    addressLine1: varchar('address_line_1', { length: 220 }).notNull(),
    addressLine2: varchar('address_line_2', { length: 220 }),
    postalCode: varchar('postal_code', { length: 20 }).notNull(),
    city: varchar('city', { length: 120 }).notNull(),
    province: varchar('province', { length: 8 }),
    countryCode: char('country_code', { length: 2 }).notNull().default('IT'),
    timezone: varchar('timezone', { length: 80 })
      .notNull()
      .default('Europe/Rome'),
    status: locationStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('locations_org_code_uq').on(table.organizationId, table.code),
    index('locations_org_status_idx').on(table.organizationId, table.status),
    index('locations_merchant_idx').on(table.merchantId),
  ],
);

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    installationId: varchar('installation_id', { length: 200 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    platform: devicePlatform('platform').notNull(),
    model: varchar('model', { length: 160 }),
    appVersion: varchar('app_version', { length: 40 }),
    status: deviceStatus('status').notNull().default('ACTIVE'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('devices_user_installation_uq').on(
      table.userId,
      table.installationId,
    ),
    index('devices_user_status_idx').on(table.userId, table.status),
  ],
);

export const deviceAssignments = pgTable(
  'device_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
    active: boolean('active').notNull().default(true),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('device_assignments_device_org_uq').on(
      table.deviceId,
      table.organizationId,
    ),
    index('device_assignments_org_active_idx').on(
      table.organizationId,
      table.active,
    ),
    index('device_assignments_location_idx').on(table.locationId),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    membershipId: uuid('membership_id').references(
      () => organizationMemberships.id,
      { onDelete: 'set null' },
    ),
    refreshTokenHash: char('refresh_token_hash', { length: 64 }).notNull(),
    previousRefreshTokenHash: char('previous_refresh_token_hash', {
      length: 64,
    }),
    status: authSessionStatus('status').notNull().default('ACTIVE'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: varchar('revoke_reason', { length: 160 }),
    ipHash: char('ip_hash', { length: 64 }),
    userAgent: varchar('user_agent', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('auth_sessions_user_status_idx').on(table.userId, table.status),
    index('auth_sessions_device_status_idx').on(table.deviceId, table.status),
    index('auth_sessions_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
    index('auth_sessions_expiry_idx').on(table.status, table.expiresAt),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    requestId: text('request_id'),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('audit_events_organization_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    index('audit_events_entity_idx').on(table.entityType, table.entityId),
  ],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic: text('topic').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: outboxStatus('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('outbox_events_dispatch_idx').on(table.status, table.availableAt),
    index('outbox_events_aggregate_idx').on(
      table.aggregateType,
      table.aggregateId,
    ),
  ],
);

export type MembershipRole = (typeof membershipRole.enumValues)[number];
export type MembershipStatus = (typeof membershipStatus.enumValues)[number];
export type DevicePlatform = (typeof devicePlatform.enumValues)[number];
