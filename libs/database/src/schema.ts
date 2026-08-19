import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
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

export const posOperatorMode = pgEnum('pos_operator_mode', [
  'AUTO',
  'CASHIER',
  'KITCHEN',
  'MANAGER',
]);

export const merchantStatus = pgEnum('merchant_status', ['ACTIVE', 'INACTIVE']);

export const locationStatus = pgEnum('location_status', ['ACTIVE', 'INACTIVE']);

export const authSessionStatus = pgEnum('auth_session_status', [
  'ACTIVE',
  'REVOKED',
]);

export const catalogStatus = pgEnum('catalog_status', ['ACTIVE', 'INACTIVE']);

export const productUnit = pgEnum('product_unit', ['EACH', 'WEIGHT', 'VOLUME']);

export const orderStatus = pgEnum('order_status', [
  'OPEN',
  'HELD',
  'AWAITING_PAYMENT',
  'PAID',
  'CANCELLED',
]);

export const orderServiceMode = pgEnum('order_service_mode', [
  'COUNTER',
  'TAKEAWAY',
  'DELIVERY',
  'TABLE',
]);

export const orderAdjustmentType = pgEnum('order_adjustment_type', [
  'FIXED',
  'PERCENTAGE',
]);

export const hospitalityStatus = pgEnum('hospitality_status', [
  'ACTIVE',
  'INACTIVE',
]);

export const tableSessionStatus = pgEnum('table_session_status', [
  'OPEN',
  'CLOSED',
  'CANCELLED',
]);

export const kitchenTicketStatus = pgEnum('kitchen_ticket_status', [
  'QUEUED',
  'IN_PROGRESS',
  'READY',
  'SERVED',
  'CANCELLED',
]);

export const checkoutStatus = pgEnum('checkout_status', [
  'OPEN',
  'COMPLETED',
  'CANCELLED',
]);

export const paymentMethod = pgEnum('payment_method', [
  'CASH',
  'CARD',
  'OTHER',
]);

export const paymentProvider = pgEnum('payment_provider', [
  'CASH',
  'MANUAL_TERMINAL',
  'EXTERNAL_TERMINAL',
]);

export const paymentStatus = pgEnum('payment_status', [
  'PENDING',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
]);

export const paymentEventType = pgEnum('payment_event_type', [
  'CREATED',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
]);

export const printerStatus = pgEnum('printer_status', ['ACTIVE', 'DISABLED']);

export const printerPurpose = pgEnum('printer_purpose', [
  'RECEIPT',
  'KITCHEN',
  'LABEL',
  'GENERIC',
]);

export const printDocumentType = pgEnum('print_document_type', [
  'KITCHEN_TICKET',
  'ORDER_RECEIPT',
  'PAYMENT_RECEIPT',
  'TEST_PAGE',
]);

export const printJobStatus = pgEnum('print_job_status', [
  'QUEUED',
  'CLAIMED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export const printAttemptOutcome = pgEnum('print_attempt_outcome', [
  'CLAIMED',
  'COMPLETED',
  'FAILED',
  'EXPIRED',
]);

export const fiscalProvider = pgEnum('fiscal_provider', [
  'MOCK',
  'ACUBE_SMART_RECEIPTS',
  'OPENAPI_SMART_RECEIPTS',
  'ADE_WEB',
]);

export const fiscalEnvironment = pgEnum('fiscal_environment', [
  'SANDBOX',
  'PRODUCTION',
]);

export const fiscalDocumentType = pgEnum('fiscal_document_type', [
  'SALE',
  'VOID',
]);

export const fiscalDocumentStatus = pgEnum('fiscal_document_status', [
  'QUEUED',
  'PROCESSING',
  'ISSUED',
  'RETRY',
  'REJECTED',
  'UNKNOWN',
  'AUTH_REQUIRED',
  'VOIDED',
  'CANCELLED',
]);

export const fiscalAttemptOutcome = pgEnum('fiscal_attempt_outcome', [
  'STARTED',
  'SUCCEEDED',
  'RETRY',
  'REJECTED',
  'UNKNOWN',
  'AUTH_REQUIRED',
]);

// PHASE_2_EVENTS_RESERVATIONS_ENUMS_START
export const eventStatus = pgEnum('event_status', [
  'DRAFT',
  'PUBLISHED',
  'SOLD_OUT',
  'CANCELLED',
  'COMPLETED',
  'ARCHIVED',
]);

export const reservationStatus = pgEnum('reservation_status', [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_SHOW',
  'REFUND_PENDING',
  'REFUNDED',
]);

export const reservationHoldStatus = pgEnum('reservation_hold_status', [
  'ACTIVE',
  'CONVERTED',
  'EXPIRED',
  'CANCELLED',
]);

export const reservationAssignmentStatus = pgEnum(
  'reservation_assignment_status',
  ['ACTIVE', 'RELEASED'],
);

export const reservationPaymentStatus = pgEnum('reservation_payment_status', [
  'CREATED',
  'REQUIRES_ACTION',
  'PAID',
  'FAILED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

export const platformFeeRuleScope = pgEnum('platform_fee_rule_scope', [
  'GLOBAL',
  'ORGANIZATION',
  'EVENT',
]);

export const platformFeeLedgerEntryType = pgEnum(
  'platform_fee_ledger_entry_type',
  ['CHARGE', 'REFUND', 'ADJUSTMENT'],
);
// PHASE_2_EVENTS_RESERVATIONS_ENUMS_END

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
    defaultLocationId: uuid('default_location_id').references(
      (): AnyPgColumn => locations.id,
      { onDelete: 'set null' },
    ),
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
    index('organization_memberships_default_location_idx').on(
      table.defaultLocationId,
    ),
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
    operatorMode: posOperatorMode('operator_mode').notNull().default('AUTO'),
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

export const vatRates = pgTable(
  'vat_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    rateBasisPoints: integer('rate_basis_points').notNull(),
    natureCode: varchar('nature_code', { length: 8 }),
    fiscalDescription: varchar('fiscal_description', { length: 220 }),
    isDefault: boolean('is_default').notNull().default(false),
    status: catalogStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('vat_rates_org_code_uq').on(table.organizationId, table.code),
    index('vat_rates_org_status_idx').on(table.organizationId, table.status),
    index('vat_rates_org_default_idx').on(
      table.organizationId,
      table.isDefault,
    ),
  ],
);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    description: varchar('description', { length: 500 }),
    colorHex: char('color_hex', { length: 7 }),
    imageUrl: varchar('image_url', { length: 500 }),
    sortOrder: integer('sort_order').notNull().default(0),
    status: catalogStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('categories_org_code_uq').on(table.organizationId, table.code),
    index('categories_org_status_sort_idx').on(
      table.organizationId,
      table.status,
      table.sortOrder,
    ),
  ],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    vatRateId: uuid('vat_rate_id')
      .notNull()
      .references(() => vatRates.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 50 }).notNull(),
    sku: varchar('sku', { length: 80 }),
    barcode: varchar('barcode', { length: 80 }),
    name: varchar('name', { length: 180 }).notNull(),
    description: text('description'),
    imageUrl: varchar('image_url', { length: 500 }),
    unit: productUnit('unit').notNull().default('EACH'),
    quantityScale: integer('quantity_scale').notNull().default(0),
    trackAvailability: boolean('track_availability').notNull().default(false),
    status: catalogStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('products_org_code_uq').on(table.organizationId, table.code),
    uniqueIndex('products_org_sku_uq').on(table.organizationId, table.sku),
    uniqueIndex('products_org_barcode_uq').on(
      table.organizationId,
      table.barcode,
    ),
    index('products_org_status_idx').on(table.organizationId, table.status),
    index('products_category_idx').on(table.categoryId),
    index('products_vat_rate_idx').on(table.vatRateId),
  ],
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 50 }).notNull(),
    sku: varchar('sku', { length: 80 }),
    barcode: varchar('barcode', { length: 80 }),
    name: varchar('name', { length: 120 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: catalogStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('product_variants_product_code_uq').on(
      table.productId,
      table.code,
    ),
    uniqueIndex('product_variants_org_sku_uq').on(
      table.organizationId,
      table.sku,
    ),
    uniqueIndex('product_variants_org_barcode_uq').on(
      table.organizationId,
      table.barcode,
    ),
    index('product_variants_product_status_idx').on(
      table.productId,
      table.status,
      table.sortOrder,
    ),
  ],
);

export const locationProducts = pgTable(
  'location_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('location_products_location_product_uq').on(
      table.locationId,
      table.productId,
    ),
    index('location_products_org_location_idx').on(
      table.organizationId,
      table.locationId,
      table.enabled,
    ),
  ],
);

export const priceLists = pgTable(
  'price_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 140 }).notNull(),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    priority: integer('priority').notNull().default(0),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    status: catalogStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('price_lists_org_code_uq').on(table.organizationId, table.code),
    index('price_lists_org_status_priority_idx').on(
      table.organizationId,
      table.status,
      table.priority,
    ),
  ],
);

export const locationPriceLists = pgTable(
  'location_price_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    priceListId: uuid('price_list_id')
      .notNull()
      .references(() => priceLists.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('location_price_lists_location_list_uq').on(
      table.locationId,
      table.priceListId,
    ),
    index('location_price_lists_org_location_idx').on(
      table.organizationId,
      table.locationId,
      table.active,
      table.priority,
    ),
  ],
);

export const productPrices = pgTable(
  'product_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    priceListId: uuid('price_list_id')
      .notNull()
      .references(() => priceLists.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id').references(() => productVariants.id, {
      onDelete: 'cascade',
    }),
    priceKey: varchar('price_key', { length: 160 }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    status: catalogStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('product_prices_list_key_uq').on(
      table.priceListId,
      table.priceKey,
    ),
    index('product_prices_org_product_idx').on(
      table.organizationId,
      table.productId,
      table.status,
    ),
    index('product_prices_list_status_idx').on(table.priceListId, table.status),
  ],
);

export const locationOrderSequences = pgTable(
  'location_order_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    businessDate: char('business_date', { length: 10 }).notNull(),
    lastValue: integer('last_value').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('location_order_sequences_org_location_date_uq').on(
      table.organizationId,
      table.locationId,
      table.businessDate,
    ),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    clientOrderId: uuid('client_order_id').notNull(),
    number: varchar('number', { length: 40 }).notNull(),
    businessDate: char('business_date', { length: 10 }).notNull(),
    status: orderStatus('status').notNull().default('OPEN'),
    serviceMode: orderServiceMode('service_mode').notNull(),
    customerNote: text('customer_note'),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    version: integer('version').notNull().default(1),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    netTotalCents: integer('net_total_cents').notNull().default(0),
    taxTotalCents: integer('tax_total_cents').notNull().default(0),
    heldAt: timestamp('held_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledByUserId: uuid('cancelled_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelReason: varchar('cancel_reason', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('orders_org_device_client_uq').on(
      table.organizationId,
      table.deviceId,
      table.clientOrderId,
    ),
    uniqueIndex('orders_location_number_uq').on(table.locationId, table.number),
    index('orders_org_location_status_created_idx').on(
      table.organizationId,
      table.locationId,
      table.status,
      table.createdAt,
    ),
    index('orders_created_by_idx').on(table.createdByUserId, table.createdAt),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    clientItemId: uuid('client_item_id').notNull(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    variantId: uuid('variant_id').references(() => productVariants.id, {
      onDelete: 'restrict',
    }),
    productCodeSnapshot: varchar('product_code_snapshot', {
      length: 50,
    }).notNull(),
    productNameSnapshot: varchar('product_name_snapshot', {
      length: 180,
    }).notNull(),
    variantCodeSnapshot: varchar('variant_code_snapshot', { length: 50 }),
    variantNameSnapshot: varchar('variant_name_snapshot', { length: 120 }),
    skuSnapshot: varchar('sku_snapshot', { length: 80 }),
    barcodeSnapshot: varchar('barcode_snapshot', { length: 80 }),
    categoryIdSnapshot: uuid('category_id_snapshot').notNull(),
    categoryCodeSnapshot: varchar('category_code_snapshot', {
      length: 40,
    }).notNull(),
    categoryNameSnapshot: varchar('category_name_snapshot', {
      length: 120,
    }).notNull(),
    unitSnapshot: productUnit('unit_snapshot').notNull(),
    quantityAmount: integer('quantity_amount').notNull(),
    quantityScale: integer('quantity_scale').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    grossTotalCents: integer('gross_total_cents').notNull(),
    allocatedDiscountCents: integer('allocated_discount_cents')
      .notNull()
      .default(0),
    finalGrossCents: integer('final_gross_cents').notNull(),
    finalNetCents: integer('final_net_cents').notNull(),
    finalTaxCents: integer('final_tax_cents').notNull(),
    vatRateIdSnapshot: uuid('vat_rate_id_snapshot').notNull(),
    vatCodeSnapshot: varchar('vat_code_snapshot', { length: 40 }).notNull(),
    vatRateBasisPointsSnapshot: integer(
      'vat_rate_basis_points_snapshot',
    ).notNull(),
    vatNatureCodeSnapshot: varchar('vat_nature_code_snapshot', { length: 8 }),
    priceListIdSnapshot: uuid('price_list_id_snapshot').notNull(),
    note: varchar('note', { length: 500 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('order_items_order_client_uq').on(
      table.orderId,
      table.clientItemId,
    ),
    index('order_items_org_order_sort_idx').on(
      table.organizationId,
      table.orderId,
      table.sortOrder,
    ),
    index('order_items_product_idx').on(table.productId),
  ],
);

export const orderAdjustments = pgTable(
  'order_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    clientAdjustmentId: uuid('client_adjustment_id').notNull(),
    type: orderAdjustmentType('type').notNull(),
    value: integer('value').notNull(),
    reason: varchar('reason', { length: 300 }).notNull(),
    appliedCents: integer('applied_cents').notNull().default(0),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('order_adjustments_order_client_uq').on(
      table.orderId,
      table.clientAdjustmentId,
    ),
    index('order_adjustments_org_order_idx').on(
      table.organizationId,
      table.orderId,
      table.createdAt,
    ),
  ],
);

export const orderVatSummaries = pgTable(
  'order_vat_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    vatKey: varchar('vat_key', { length: 32 }).notNull(),
    vatRateBasisPoints: integer('vat_rate_basis_points').notNull(),
    vatNatureCode: varchar('vat_nature_code', { length: 8 }),
    grossCents: integer('gross_cents').notNull(),
    netCents: integer('net_cents').notNull(),
    taxCents: integer('tax_cents').notNull(),
  },
  (table) => [
    uniqueIndex('order_vat_summaries_order_key_uq').on(
      table.orderId,
      table.vatKey,
    ),
    index('order_vat_summaries_org_order_idx').on(
      table.organizationId,
      table.orderId,
    ),
  ],
);

export const orderMutations = pgTable(
  'order_mutations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    mutationId: uuid('mutation_id').notNull(),
    operation: varchar('operation', { length: 80 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    responseVersion: integer('response_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('order_mutations_order_device_mutation_uq').on(
      table.orderId,
      table.deviceId,
      table.mutationId,
    ),
    index('order_mutations_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const checkoutSessions = pgTable(
  'checkout_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    clientCheckoutId: uuid('client_checkout_id').notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    status: checkoutStatus('status').notNull().default('OPEN'),
    currency: char('currency', { length: 3 }).notNull(),
    orderVersionSnapshot: integer('order_version_snapshot').notNull(),
    orderTotalCents: integer('order_total_cents').notNull(),
    paidCents: integer('paid_cents').notNull().default(0),
    remainingCents: integer('remaining_cents').notNull(),
    changeCents: integer('change_cents').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: varchar('cancel_reason', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('checkout_sessions_org_device_client_uq').on(
      table.organizationId,
      table.deviceId,
      table.clientCheckoutId,
    ),
    index('checkout_sessions_org_location_status_idx').on(
      table.organizationId,
      table.locationId,
      table.status,
      table.createdAt,
    ),
    index('checkout_sessions_org_order_status_idx').on(
      table.organizationId,
      table.orderId,
      table.status,
    ),
  ],
);

export const paymentTransactions = pgTable(
  'payment_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    checkoutSessionId: uuid('checkout_session_id')
      .notNull()
      .references(() => checkoutSessions.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    clientPaymentId: uuid('client_payment_id').notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    method: paymentMethod('method').notNull(),
    provider: paymentProvider('provider').notNull(),
    status: paymentStatus('status').notNull(),
    amountCents: integer('amount_cents').notNull(),
    tenderedCents: integer('tendered_cents'),
    changeCents: integer('change_cents').notNull().default(0),
    providerReference: varchar('provider_reference', { length: 200 }),
    failureCode: varchar('failure_code', { length: 80 }),
    failureMessage: varchar('failure_message', { length: 500 }),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('payment_transactions_org_device_client_uq').on(
      table.organizationId,
      table.deviceId,
      table.clientPaymentId,
    ),
    uniqueIndex('payment_transactions_org_provider_ref_uq').on(
      table.organizationId,
      table.provider,
      table.providerReference,
    ),
    index('payment_transactions_checkout_status_idx').on(
      table.checkoutSessionId,
      table.status,
      table.createdAt,
    ),
    index('payment_transactions_org_order_idx').on(
      table.organizationId,
      table.orderId,
      table.createdAt,
    ),
  ],
);

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => paymentTransactions.id, { onDelete: 'cascade' }),
    type: paymentEventType('type').notNull(),
    providerEventId: varchar('provider_event_id', { length: 200 }),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('payment_events_org_provider_event_uq').on(
      table.organizationId,
      table.providerEventId,
    ),
    index('payment_events_payment_created_idx').on(
      table.paymentId,
      table.createdAt,
    ),
  ],
);

export const financialMutations = pgTable(
  'financial_mutations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    mutationId: uuid('mutation_id').notNull(),
    scopeType: varchar('scope_type', { length: 20 }).notNull(),
    scopeId: uuid('scope_id').notNull(),
    operation: varchar('operation', { length: 80 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('financial_mutations_org_device_mutation_uq').on(
      table.organizationId,
      table.deviceId,
      table.mutationId,
    ),
    index('financial_mutations_org_scope_idx').on(
      table.organizationId,
      table.scopeType,
      table.scopeId,
      table.createdAt,
    ),
  ],
);

export const diningAreas = pgTable(
  'dining_areas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: hospitalityStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('dining_areas_org_location_code_uq').on(
      table.organizationId,
      table.locationId,
      table.code,
    ),
    index('dining_areas_location_status_sort_idx').on(
      table.locationId,
      table.status,
      table.sortOrder,
    ),
  ],
);

export const diningTables = pgTable(
  'dining_tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    areaId: uuid('area_id')
      .notNull()
      .references(() => diningAreas.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    capacity: integer('capacity').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: hospitalityStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('dining_tables_org_location_code_uq').on(
      table.organizationId,
      table.locationId,
      table.code,
    ),
    index('dining_tables_area_status_sort_idx').on(
      table.areaId,
      table.status,
      table.sortOrder,
    ),
  ],
);

export const tableSessions = pgTable(
  'table_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    tableId: uuid('table_id')
      .notNull()
      .references(() => diningTables.id, { onDelete: 'restrict' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    openedByUserId: uuid('opened_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    clientSessionId: uuid('client_session_id').notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    status: tableSessionStatus('status').notNull().default('OPEN'),
    guestCount: integer('guest_count').notNull(),
    note: varchar('note', { length: 500 }),
    activeTableKey: varchar('active_table_key', { length: 100 }),
    version: integer('version').notNull().default(1),
    openedAt: timestamp('opened_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    closeReason: varchar('close_reason', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('table_sessions_org_device_client_uq').on(
      table.organizationId,
      table.deviceId,
      table.clientSessionId,
    ),
    uniqueIndex('table_sessions_org_active_table_uq').on(
      table.organizationId,
      table.activeTableKey,
    ),
    index('table_sessions_location_status_opened_idx').on(
      table.locationId,
      table.status,
      table.openedAt,
    ),
  ],
);

export const tableSessionOrders = pgTable(
  'table_session_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tableSessionId: uuid('table_session_id')
      .notNull()
      .references(() => tableSessions.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    attachedByUserId: uuid('attached_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    attachedAt: timestamp('attached_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('table_session_orders_order_uq').on(table.orderId),
    uniqueIndex('table_session_orders_session_order_uq').on(
      table.tableSessionId,
      table.orderId,
    ),
    index('table_session_orders_org_session_idx').on(
      table.organizationId,
      table.tableSessionId,
    ),
  ],
);

export const hospitalityMutations = pgTable(
  'hospitality_mutations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    mutationId: uuid('mutation_id').notNull(),
    scopeType: varchar('scope_type', { length: 30 }).notNull(),
    scopeId: uuid('scope_id').notNull(),
    operation: varchar('operation', { length: 80 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    responseVersion: integer('response_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('hospitality_mutations_org_device_mutation_uq').on(
      table.organizationId,
      table.deviceId,
      table.mutationId,
    ),
    index('hospitality_mutations_org_scope_idx').on(
      table.organizationId,
      table.scopeType,
      table.scopeId,
      table.createdAt,
    ),
  ],
);

export const kitchenStations = pgTable(
  'kitchen_stations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: hospitalityStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('kitchen_stations_org_location_code_uq').on(
      table.organizationId,
      table.locationId,
      table.code,
    ),
    index('kitchen_stations_location_status_sort_idx').on(
      table.locationId,
      table.status,
      table.sortOrder,
    ),
  ],
);

export const kitchenStationCategories = pgTable(
  'kitchen_station_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => kitchenStations.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('kitchen_station_categories_route_uq').on(
      table.organizationId,
      table.locationId,
      table.categoryId,
    ),
    index('kitchen_station_categories_station_idx').on(table.stationId),
  ],
);

export const kitchenTicketSequences = pgTable(
  'kitchen_ticket_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    businessDate: char('business_date', { length: 10 }).notNull(),
    lastValue: integer('last_value').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('kitchen_ticket_sequences_org_location_date_uq').on(
      table.organizationId,
      table.locationId,
      table.businessDate,
    ),
  ],
);

export const kitchenTicketBatches = pgTable(
  'kitchen_ticket_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    clientBatchId: uuid('client_batch_id').notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('kitchen_ticket_batches_org_device_client_uq').on(
      table.organizationId,
      table.deviceId,
      table.clientBatchId,
    ),
    index('kitchen_ticket_batches_org_order_idx').on(
      table.organizationId,
      table.orderId,
      table.createdAt,
    ),
  ],
);

export const kitchenTickets = pgTable(
  'kitchen_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => kitchenTicketBatches.id, { onDelete: 'cascade' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => kitchenStations.id, { onDelete: 'restrict' }),
    number: varchar('number', { length: 40 }).notNull(),
    status: kitchenTicketStatus('status').notNull().default('QUEUED'),
    version: integer('version').notNull().default(1),
    tableSessionId: uuid('table_session_id').references(
      () => tableSessions.id,
      { onDelete: 'set null' },
    ),
    tableCodeSnapshot: varchar('table_code_snapshot', { length: 40 }),
    queuedByUserId: uuid('queued_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    queuedAt: timestamp('queued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    servedAt: timestamp('served_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('kitchen_tickets_location_number_uq').on(
      table.locationId,
      table.number,
    ),
    uniqueIndex('kitchen_tickets_batch_station_uq').on(
      table.batchId,
      table.stationId,
    ),
    index('kitchen_tickets_location_station_status_idx').on(
      table.locationId,
      table.stationId,
      table.status,
      table.queuedAt,
    ),
    index('kitchen_tickets_org_order_idx').on(
      table.organizationId,
      table.orderId,
      table.queuedAt,
    ),
  ],
);

export const kitchenTicketItems = pgTable(
  'kitchen_ticket_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kitchenTicketId: uuid('kitchen_ticket_id')
      .notNull()
      .references(() => kitchenTickets.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    quantityAmount: integer('quantity_amount').notNull(),
    quantityScale: integer('quantity_scale').notNull(),
    productNameSnapshot: varchar('product_name_snapshot', {
      length: 180,
    }).notNull(),
    variantNameSnapshot: varchar('variant_name_snapshot', { length: 120 }),
    noteSnapshot: varchar('note_snapshot', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('kitchen_ticket_items_ticket_idx').on(
      table.kitchenTicketId,
      table.createdAt,
    ),
    index('kitchen_ticket_items_order_item_idx').on(table.orderItemId),
  ],
);

export const kitchenMutations = pgTable(
  'kitchen_mutations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    mutationId: uuid('mutation_id').notNull(),
    kitchenTicketId: uuid('kitchen_ticket_id')
      .notNull()
      .references(() => kitchenTickets.id, { onDelete: 'cascade' }),
    operation: varchar('operation', { length: 80 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    responseVersion: integer('response_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('kitchen_mutations_org_device_mutation_uq').on(
      table.organizationId,
      table.deviceId,
      table.mutationId,
    ),
    index('kitchen_mutations_ticket_idx').on(
      table.kitchenTicketId,
      table.createdAt,
    ),
  ],
);

export const printers = pgTable(
  'printers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    purpose: printerPurpose('purpose').notNull(),
    agentDeviceId: uuid('agent_device_id').references(() => devices.id, {
      onDelete: 'set null',
    }),
    driver: varchar('driver', { length: 80 }).notNull().default('ESC_POS_TEXT'),
    paperWidthMm: integer('paper_width_mm').notNull().default(80),
    charactersPerLine: integer('characters_per_line').notNull().default(48),
    supportsCut: boolean('supports_cut').notNull().default(true),
    supportsDrawer: boolean('supports_drawer').notNull().default(false),
    status: printerStatus('status').notNull().default('ACTIVE'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    agentVersion: varchar('agent_version', { length: 80 }),
    statusMessage: varchar('status_message', { length: 160 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('printers_org_location_code_uq').on(
      table.organizationId,
      table.locationId,
      table.code,
    ),
    index('printers_org_location_status_idx').on(
      table.organizationId,
      table.locationId,
      table.status,
    ),
    index('printers_agent_device_idx').on(table.agentDeviceId, table.status),
  ],
);

export const printerRoutes = pgTable(
  'printer_routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    routeKey: varchar('route_key', { length: 180 }).notNull(),
    documentType: printDocumentType('document_type').notNull(),
    kitchenStationId: uuid('kitchen_station_id').references(
      () => kitchenStations.id,
      { onDelete: 'cascade' },
    ),
    printerId: uuid('printer_id')
      .notNull()
      .references(() => printers.id, { onDelete: 'cascade' }),
    copies: integer('copies').notNull().default(1),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('printer_routes_location_key_printer_uq').on(
      table.locationId,
      table.routeKey,
      table.printerId,
    ),
    index('printer_routes_org_location_active_idx').on(
      table.organizationId,
      table.locationId,
      table.active,
    ),
    index('printer_routes_station_idx').on(table.kitchenStationId),
  ],
);

export const printJobs = pgTable(
  'print_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    printerId: uuid('printer_id')
      .notNull()
      .references(() => printers.id, { onDelete: 'restrict' }),
    documentType: printDocumentType('document_type').notNull(),
    sourceEntityType: varchar('source_entity_type', { length: 80 }).notNull(),
    sourceEntityId: uuid('source_entity_id'),
    dedupeKey: varchar('dedupe_key', { length: 220 }).notNull(),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    renderedText: text('rendered_text').notNull(),
    templateVersion: integer('template_version').notNull().default(1),
    copies: integer('copies').notNull().default(1),
    status: printJobStatus('status').notNull().default('QUEUED'),
    priority: integer('priority').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    claimedByDeviceId: uuid('claimed_by_device_id').references(
      () => devices.id,
      {
        onDelete: 'set null',
      },
    ),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    lastError: text('last_error'),
    version: integer('version').notNull().default(1),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    requestedByDeviceId: uuid('requested_by_device_id').references(
      () => devices.id,
      { onDelete: 'set null' },
    ),
    clientRequestId: uuid('client_request_id'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: varchar('cancel_reason', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('print_jobs_org_printer_dedupe_uq').on(
      table.organizationId,
      table.printerId,
      table.dedupeKey,
    ),
    index('print_jobs_claim_idx').on(
      table.organizationId,
      table.locationId,
      table.printerId,
      table.status,
      table.nextAttemptAt,
      table.priority,
    ),
    index('print_jobs_source_idx').on(
      table.organizationId,
      table.sourceEntityType,
      table.sourceEntityId,
    ),
  ],
);

export const printJobAttempts = pgTable(
  'print_job_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    printJobId: uuid('print_job_id')
      .notNull()
      .references(() => printJobs.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    attemptNo: integer('attempt_no').notNull(),
    leaseToken: uuid('lease_token').notNull(),
    outcome: printAttemptOutcome('outcome').notNull(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('print_job_attempts_job_lease_uq').on(
      table.printJobId,
      table.leaseToken,
    ),
    index('print_job_attempts_org_job_idx').on(
      table.organizationId,
      table.printJobId,
      table.attemptNo,
    ),
  ],
);

export const printJobMutations = pgTable(
  'print_job_mutations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    printJobId: uuid('print_job_id')
      .notNull()
      .references(() => printJobs.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    mutationId: uuid('mutation_id').notNull(),
    operation: varchar('operation', { length: 40 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    responseVersion: integer('response_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('print_job_mutations_job_device_mutation_uq').on(
      table.printJobId,
      table.deviceId,
      table.mutationId,
    ),
    index('print_job_mutations_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const fiscalProfiles = pgTable(
  'fiscal_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    provider: fiscalProvider('provider').notNull(),
    environment: fiscalEnvironment('environment').notNull(),
    fiscalId: varchar('fiscal_id', { length: 32 }).notNull(),
    enabled: boolean('enabled').notNull().default(false),
    autoIssueOnPaid: boolean('auto_issue_on_paid').notNull().default(false),
    receiptEmail: varchar('receipt_email', { length: 320 }),
    displayName: varchar('display_name', { length: 120 }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('fiscal_profiles_org_location_uq').on(
      table.organizationId,
      table.locationId,
    ),
    index('fiscal_profiles_org_enabled_idx').on(
      table.organizationId,
      table.enabled,
    ),
  ],
);

export const fiscalDocuments = pgTable(
  'fiscal_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    parentDocumentId: uuid('parent_document_id'),
    type: fiscalDocumentType('type').notNull(),
    status: fiscalDocumentStatus('status').notNull().default('QUEUED'),
    provider: fiscalProvider('provider').notNull(),
    environment: fiscalEnvironment('environment').notNull(),
    fiscalIdSnapshot: varchar('fiscal_id_snapshot', { length: 32 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    totalCents: integer('total_cents').notNull(),
    cashPaymentCents: integer('cash_payment_cents').notNull().default(0),
    electronicPaymentCents: integer('electronic_payment_cents')
      .notNull()
      .default(0),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    providerResponse:
      jsonb('provider_response').$type<Record<string, unknown>>(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    requestedByUserId: uuid('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    requestedByDeviceId: uuid('requested_by_device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    clientRequestId: uuid('client_request_id'),
    externalId: varchar('external_id', { length: 200 }),
    externalStatus: varchar('external_status', { length: 80 }),
    documentNumber: varchar('document_number', { length: 120 }),
    documentDate: varchar('document_date', { length: 80 }),
    errorCode: varchar('error_code', { length: 100 }),
    errorMessage: text('error_message'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    version: integer('version').notNull().default(1),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('fiscal_documents_org_device_request_uq').on(
      table.organizationId,
      table.requestedByDeviceId,
      table.clientRequestId,
    ),
    uniqueIndex('fiscal_documents_order_sale_uq').on(table.orderId, table.type),
    uniqueIndex('fiscal_documents_parent_type_uq').on(
      table.parentDocumentId,
      table.type,
    ),
    index('fiscal_documents_dispatch_idx').on(
      table.status,
      table.nextAttemptAt,
    ),
    index('fiscal_documents_org_location_created_idx').on(
      table.organizationId,
      table.locationId,
      table.createdAt,
    ),
  ],
);

export const fiscalDocumentItems = pgTable(
  'fiscal_document_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fiscalDocumentId: uuid('fiscal_document_id')
      .notNull()
      .references(() => fiscalDocuments.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, {
      onDelete: 'restrict',
    }),
    lineNo: integer('line_no').notNull(),
    description: varchar('description', { length: 1000 }).notNull(),
    quantityAmount: integer('quantity_amount').notNull(),
    quantityScale: integer('quantity_scale').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    grossCents: integer('gross_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    finalGrossCents: integer('final_gross_cents').notNull(),
    vatRateBasisPoints: integer('vat_rate_basis_points').notNull(),
    vatNatureCode: varchar('vat_nature_code', { length: 8 }),
    vatRateCode: varchar('vat_rate_code', { length: 8 }).notNull(),
  },
  (table) => [
    uniqueIndex('fiscal_document_items_document_line_uq').on(
      table.fiscalDocumentId,
      table.lineNo,
    ),
    index('fiscal_document_items_org_document_idx').on(
      table.organizationId,
      table.fiscalDocumentId,
    ),
  ],
);

export const fiscalDocumentVatSummaries = pgTable(
  'fiscal_document_vat_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fiscalDocumentId: uuid('fiscal_document_id')
      .notNull()
      .references(() => fiscalDocuments.id, { onDelete: 'cascade' }),
    vatKey: varchar('vat_key', { length: 32 }).notNull(),
    vatRateBasisPoints: integer('vat_rate_basis_points').notNull(),
    vatNatureCode: varchar('vat_nature_code', { length: 8 }),
    grossCents: integer('gross_cents').notNull(),
    netCents: integer('net_cents').notNull(),
    taxCents: integer('tax_cents').notNull(),
  },
  (table) => [
    uniqueIndex('fiscal_document_vat_document_key_uq').on(
      table.fiscalDocumentId,
      table.vatKey,
    ),
    index('fiscal_document_vat_org_document_idx').on(
      table.organizationId,
      table.fiscalDocumentId,
    ),
  ],
);

export const fiscalAttempts = pgTable(
  'fiscal_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fiscalDocumentId: uuid('fiscal_document_id')
      .notNull()
      .references(() => fiscalDocuments.id, { onDelete: 'cascade' }),
    attemptNo: integer('attempt_no').notNull(),
    outcome: fiscalAttemptOutcome('outcome').notNull(),
    errorCode: varchar('error_code', { length: 100 }),
    errorMessage: text('error_message'),
    response: jsonb('response')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('fiscal_attempts_document_attempt_uq').on(
      table.fiscalDocumentId,
      table.attemptNo,
    ),
    index('fiscal_attempts_org_document_idx').on(
      table.organizationId,
      table.fiscalDocumentId,
    ),
  ],
);

export const fiscalMutations = pgTable(
  'fiscal_mutations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fiscalDocumentId: uuid('fiscal_document_id')
      .notNull()
      .references(() => fiscalDocuments.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    mutationId: uuid('mutation_id').notNull(),
    operation: varchar('operation', { length: 40 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    responseVersion: integer('response_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('fiscal_mutations_document_device_mutation_uq').on(
      table.fiscalDocumentId,
      table.deviceId,
      table.mutationId,
    ),
    index('fiscal_mutations_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

// PHASE_2_EVENTS_RESERVATIONS_TABLES_START
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 220 }).notNull(),
    slug: varchar('slug', { length: 180 }).notNull(),
    description: text('description').notNull(),
    timezone: varchar('timezone', { length: 80 })
      .notNull()
      .default('Europe/Rome'),
    status: eventStatus('status').notNull().default('DRAFT'),
    coverImageUrl: varchar('cover_image_url', { length: 1000 }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    bookingOpensAt: timestamp('booking_opens_at', {
      withTimezone: true,
    }).notNull(),
    bookingClosesAt: timestamp('booking_closes_at', {
      withTimezone: true,
    }).notNull(),
    bookingAmountCents: integer('booking_amount_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    capacity: integer('capacity').notNull(),
    cancellationPolicy: text('cancellation_policy'),
    version: integer('version').notNull().default(1),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('events_slug_uq').on(table.slug),
    index('events_org_location_status_start_idx').on(
      table.organizationId,
      table.locationId,
      table.status,
      table.startsAt,
    ),
    index('events_public_status_booking_idx').on(
      table.status,
      table.bookingOpensAt,
      table.bookingClosesAt,
    ),
    check('events_time_window_ck', sql`${table.endsAt} > ${table.startsAt}`),
    check(
      'events_booking_window_ck',
      sql`${table.bookingOpensAt} < ${table.bookingClosesAt}`,
    ),
    check(
      'events_booking_before_start_ck',
      sql`${table.bookingClosesAt} <= ${table.startsAt}`,
    ),
    check(
      'events_booking_amount_nonnegative_ck',
      sql`${table.bookingAmountCents} >= 0`,
    ),
    check('events_capacity_positive_ck', sql`${table.capacity} > 0`),
    check('events_version_positive_ck', sql`${table.version} > 0`),
  ],
);

export const eventMedia = pgTable(
  'event_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    objectKey: varchar('object_key', { length: 1000 }).notNull(),
    publicUrl: varchar('public_url', { length: 1000 }),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    widthPx: integer('width_px'),
    heightPx: integer('height_px'),
    altText: varchar('alt_text', { length: 300 }),
    isCover: boolean('is_cover').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('event_media_event_object_key_uq').on(
      table.eventId,
      table.objectKey,
    ),
    index('event_media_event_cover_sort_idx').on(
      table.eventId,
      table.isCover,
      table.sortOrder,
    ),
    check('event_media_size_positive_ck', sql`${table.sizeBytes} > 0`),
    check('event_media_sort_nonnegative_ck', sql`${table.sortOrder} >= 0`),
    check(
      'event_media_width_positive_ck',
      sql`${table.widthPx} is null or ${table.widthPx} > 0`,
    ),
    check(
      'event_media_height_positive_ck',
      sql`${table.heightPx} is null or ${table.heightPx} > 0`,
    ),
  ],
);

export const eventTableInventory = pgTable(
  'event_table_inventory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    diningTableId: uuid('dining_table_id')
      .notNull()
      .references(() => diningTables.id, { onDelete: 'restrict' }),
    capacitySnapshot: integer('capacity_snapshot').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('event_table_inventory_event_table_uq').on(
      table.eventId,
      table.diningTableId,
    ),
    index('event_table_inventory_event_enabled_capacity_idx').on(
      table.eventId,
      table.enabled,
      table.capacitySnapshot,
    ),
    index('event_table_inventory_org_location_idx').on(
      table.organizationId,
      table.locationId,
    ),
    check(
      'event_table_inventory_capacity_positive_ck',
      sql`${table.capacitySnapshot} > 0`,
    ),
  ],
);

export const eventBookingRules = pgTable(
  'event_booking_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    minPartySize: integer('min_party_size').notNull().default(1),
    maxPartySize: integer('max_party_size').notNull(),
    holdMinutes: integer('hold_minutes').notNull().default(15),
    bookingCutoffMinutes: integer('booking_cutoff_minutes')
      .notNull()
      .default(0),
    cancellationCutoffMinutes: integer('cancellation_cutoff_minutes')
      .notNull()
      .default(0),
    autoAssignSmallestTable: boolean('auto_assign_smallest_table')
      .notNull()
      .default(true),
    allowManualAssignment: boolean('allow_manual_assignment')
      .notNull()
      .default(true),
    requirePhone: boolean('require_phone').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('event_booking_rules_event_uq').on(table.eventId),
    index('event_booking_rules_org_location_idx').on(
      table.organizationId,
      table.locationId,
    ),
    check(
      'event_booking_rules_party_range_ck',
      sql`${table.minPartySize} > 0 and ${table.maxPartySize} >= ${table.minPartySize}`,
    ),
    check(
      'event_booking_rules_hold_minutes_ck',
      sql`${table.holdMinutes} between 1 and 120`,
    ),
    check(
      'event_booking_rules_booking_cutoff_ck',
      sql`${table.bookingCutoffMinutes} >= 0`,
    ),
    check(
      'event_booking_rules_cancellation_cutoff_ck',
      sql`${table.cancellationCutoffMinutes} >= 0`,
    ),
  ],
);

export const platformFeeRules = pgTable(
  'platform_fee_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: platformFeeRuleScope('scope').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    eventId: uuid('event_id').references(() => events.id, {
      onDelete: 'cascade',
    }),
    basisPoints: integer('basis_points').notNull(),
    active: boolean('active').notNull().default(true),
    effectiveFrom: timestamp('effective_from', { withTimezone: true })
      .notNull()
      .defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
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
    index('platform_fee_rules_resolution_idx').on(
      table.scope,
      table.organizationId,
      table.eventId,
      table.active,
      table.effectiveFrom,
    ),
    check(
      'platform_fee_rules_basis_points_ck',
      sql`${table.basisPoints} between 0 and 10000`,
    ),
    check(
      'platform_fee_rules_effective_window_ck',
      sql`${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    check(
      'platform_fee_rules_scope_ck',
      sql`(
        (${table.scope} = 'GLOBAL' and ${table.organizationId} is null and ${table.eventId} is null)
        or
        (${table.scope} = 'ORGANIZATION' and ${table.organizationId} is not null and ${table.eventId} is null)
        or
        (${table.scope} = 'EVENT' and ${table.organizationId} is not null and ${table.eventId} is not null)
      )`,
    ),
  ],
);

export const reservationHolds = pgTable(
  'reservation_holds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    feeRuleId: uuid('fee_rule_id').references(() => platformFeeRules.id, {
      onDelete: 'set null',
    }),
    publicTokenHash: char('public_token_hash', { length: 64 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    status: reservationHoldStatus('status').notNull().default('ACTIVE'),
    partySize: integer('party_size').notNull(),
    amountCents: integer('amount_cents').notNull(),
    platformFeeBasisPoints: integer('platform_fee_basis_points').notNull(),
    platformFeeCents: integer('platform_fee_cents').notNull(),
    merchantGrossCents: integer('merchant_gross_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    version: integer('version').notNull().default(1),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    convertedAt: timestamp('converted_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('reservation_holds_public_token_hash_uq').on(
      table.publicTokenHash,
    ),
    uniqueIndex('reservation_holds_event_idempotency_uq').on(
      table.organizationId,
      table.eventId,
      table.idempotencyKey,
    ),
    index('reservation_holds_expiry_idx').on(table.status, table.expiresAt),
    index('reservation_holds_org_location_event_idx').on(
      table.organizationId,
      table.locationId,
      table.eventId,
      table.createdAt,
    ),
    check('reservation_holds_party_positive_ck', sql`${table.partySize} > 0`),
    check(
      'reservation_holds_amount_nonnegative_ck',
      sql`${table.amountCents} >= 0`,
    ),
    check(
      'reservation_holds_fee_basis_points_ck',
      sql`${table.platformFeeBasisPoints} between 0 and 10000`,
    ),
    check(
      'reservation_holds_fee_nonnegative_ck',
      sql`${table.platformFeeCents} >= 0`,
    ),
    check(
      'reservation_holds_merchant_gross_ck',
      sql`${table.merchantGrossCents} = ${table.amountCents} - ${table.platformFeeCents}`,
    ),
    check(
      'reservation_holds_expiry_after_creation_ck',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check('reservation_holds_version_positive_ck', sql`${table.version} > 0`),
  ],
);

export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    holdId: uuid('hold_id').references(() => reservationHolds.id, {
      onDelete: 'set null',
    }),
    feeRuleId: uuid('fee_rule_id').references(() => platformFeeRules.id, {
      onDelete: 'set null',
    }),
    tableSessionId: uuid('table_session_id').references(
      () => tableSessions.id,
      {
        onDelete: 'set null',
      },
    ),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    publicTokenHash: char('public_token_hash', { length: 64 }).notNull(),
    confirmationCode: varchar('confirmation_code', { length: 24 }).notNull(),
    status: reservationStatus('status').notNull().default('PENDING_PAYMENT'),
    customerName: varchar('customer_name', { length: 180 }).notNull(),
    customerEmail: varchar('customer_email', { length: 320 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 40 }),
    customerNote: varchar('customer_note', { length: 1000 }),
    partySize: integer('party_size').notNull(),
    amountCents: integer('amount_cents').notNull(),
    platformFeeBasisPoints: integer('platform_fee_basis_points').notNull(),
    platformFeeCents: integer('platform_fee_cents').notNull(),
    merchantGrossCents: integer('merchant_gross_cents').notNull(),
    providerFeeCents: integer('provider_fee_cents').notNull().default(0),
    merchantNetCents: integer('merchant_net_cents').notNull(),
    refundedCents: integer('refunded_cents').notNull().default(0),
    currency: char('currency', { length: 3 }).notNull().default('EUR'),
    version: integer('version').notNull().default(1),
    paymentExpiresAt: timestamp('payment_expires_at', {
      withTimezone: true,
    }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    seatedAt: timestamp('seated_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    noShowAt: timestamp('no_show_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('reservations_hold_uq').on(table.holdId),
    uniqueIndex('reservations_public_token_hash_uq').on(table.publicTokenHash),
    uniqueIndex('reservations_confirmation_code_uq').on(table.confirmationCode),
    uniqueIndex('reservations_table_session_uq').on(table.tableSessionId),
    index('reservations_org_location_event_status_idx').on(
      table.organizationId,
      table.locationId,
      table.eventId,
      table.status,
      table.createdAt,
    ),
    index('reservations_customer_email_idx').on(
      table.organizationId,
      table.customerEmail,
      table.createdAt,
    ),
    index('reservations_payment_expiry_idx').on(
      table.status,
      table.paymentExpiresAt,
    ),
    check('reservations_party_positive_ck', sql`${table.partySize} > 0`),
    check('reservations_amount_nonnegative_ck', sql`${table.amountCents} >= 0`),
    check(
      'reservations_fee_basis_points_ck',
      sql`${table.platformFeeBasisPoints} between 0 and 10000`,
    ),
    check(
      'reservations_fee_nonnegative_ck',
      sql`${table.platformFeeCents} >= 0`,
    ),
    check(
      'reservations_merchant_gross_ck',
      sql`${table.merchantGrossCents} = ${table.amountCents} - ${table.platformFeeCents}`,
    ),
    check(
      'reservations_provider_fee_nonnegative_ck',
      sql`${table.providerFeeCents} >= 0`,
    ),
    check(
      'reservations_merchant_net_ck',
      sql`${table.merchantNetCents} = ${table.merchantGrossCents} - ${table.providerFeeCents}`,
    ),
    check(
      'reservations_refunded_range_ck',
      sql`${table.refundedCents} between 0 and ${table.amountCents}`,
    ),
    check('reservations_version_positive_ck', sql`${table.version} > 0`),
    check(
      'reservations_payment_expiry_ck',
      sql`(
        (${table.status} = 'PENDING_PAYMENT' and ${table.paymentExpiresAt} is not null)
        or
        (${table.status} <> 'PENDING_PAYMENT')
      )`,
    ),
  ],
);

export const reservationTableAssignments = pgTable(
  'reservation_table_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    diningTableId: uuid('dining_table_id')
      .notNull()
      .references(() => diningTables.id, { onDelete: 'restrict' }),
    holdId: uuid('hold_id').references(() => reservationHolds.id, {
      onDelete: 'cascade',
    }),
    reservationId: uuid('reservation_id').references(() => reservations.id, {
      onDelete: 'cascade',
    }),
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: reservationAssignmentStatus('status').notNull().default('ACTIVE'),
    activeEventTableKey: varchar('active_event_table_key', { length: 200 }),
    version: integer('version').notNull().default(1),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releaseReason: varchar('release_reason', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('reservation_table_assignments_hold_uq').on(table.holdId),
    uniqueIndex('reservation_table_assignments_reservation_uq').on(
      table.reservationId,
    ),
    uniqueIndex('reservation_table_assignments_active_table_uq').on(
      table.organizationId,
      table.activeEventTableKey,
    ),
    index('reservation_table_assignments_event_status_idx').on(
      table.eventId,
      table.status,
      table.assignedAt,
    ),
    index('reservation_table_assignments_table_idx').on(
      table.diningTableId,
      table.status,
    ),
    check(
      'reservation_table_assignments_owner_ck',
      sql`(
        (${table.holdId} is not null and ${table.reservationId} is null)
        or
        (${table.holdId} is null and ${table.reservationId} is not null)
      )`,
    ),
    check(
      'reservation_table_assignments_active_state_ck',
      sql`(
        (${table.status} = 'ACTIVE' and ${table.activeEventTableKey} is not null and ${table.releasedAt} is null)
        or
        (${table.status} = 'RELEASED' and ${table.activeEventTableKey} is null and ${table.releasedAt} is not null)
      )`,
    ),
    check(
      'reservation_table_assignments_version_positive_ck',
      sql`${table.version} > 0`,
    ),
  ],
);

export const reservationPayments = pgTable(
  'reservation_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    status: reservationPaymentStatus('status').notNull().default('CREATED'),
    provider: varchar('provider', { length: 80 }).notNull(),
    providerPaymentId: varchar('provider_payment_id', { length: 240 }),
    providerSessionId: varchar('provider_session_id', { length: 240 }),
    providerEventId: varchar('provider_event_id', { length: 240 }),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    platformFeeCents: integer('platform_fee_cents').notNull(),
    merchantGrossCents: integer('merchant_gross_cents').notNull(),
    providerFeeCents: integer('provider_fee_cents').notNull().default(0),
    merchantNetCents: integer('merchant_net_cents').notNull(),
    refundedCents: integer('refunded_cents').notNull().default(0),
    currency: char('currency', { length: 3 }).notNull(),
    failureCode: varchar('failure_code', { length: 100 }),
    failureMessage: varchar('failure_message', { length: 1000 }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('reservation_payments_reservation_idempotency_uq').on(
      table.reservationId,
      table.idempotencyKey,
    ),
    uniqueIndex('reservation_payments_provider_payment_uq').on(
      table.provider,
      table.providerPaymentId,
    ),
    uniqueIndex('reservation_payments_provider_event_uq').on(
      table.provider,
      table.providerEventId,
    ),
    index('reservation_payments_reservation_status_idx').on(
      table.reservationId,
      table.status,
      table.createdAt,
    ),
    index('reservation_payments_org_location_created_idx').on(
      table.organizationId,
      table.locationId,
      table.createdAt,
    ),
    check(
      'reservation_payments_amount_positive_ck',
      sql`${table.amountCents} > 0`,
    ),
    check(
      'reservation_payments_platform_fee_nonnegative_ck',
      sql`${table.platformFeeCents} >= 0`,
    ),
    check(
      'reservation_payments_merchant_gross_ck',
      sql`${table.merchantGrossCents} = ${table.amountCents} - ${table.platformFeeCents}`,
    ),
    check(
      'reservation_payments_provider_fee_nonnegative_ck',
      sql`${table.providerFeeCents} >= 0`,
    ),
    check(
      'reservation_payments_merchant_net_ck',
      sql`${table.merchantNetCents} = ${table.merchantGrossCents} - ${table.providerFeeCents}`,
    ),
    check(
      'reservation_payments_refunded_range_ck',
      sql`${table.refundedCents} between 0 and ${table.amountCents}`,
    ),
  ],
);

export const platformFeeLedger = pgTable(
  'platform_fee_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'restrict' }),
    reservationPaymentId: uuid('reservation_payment_id').references(
      () => reservationPayments.id,
      { onDelete: 'restrict' },
    ),
    entryType: platformFeeLedgerEntryType('entry_type').notNull(),
    sourceKey: varchar('source_key', { length: 240 }).notNull(),
    customerAmountCents: integer('customer_amount_cents').notNull(),
    platformFeeCents: integer('platform_fee_cents').notNull(),
    providerFeeCents: integer('provider_fee_cents').notNull(),
    merchantNetCents: integer('merchant_net_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    description: varchar('description', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('platform_fee_ledger_source_key_uq').on(table.sourceKey),
    index('platform_fee_ledger_org_event_created_idx').on(
      table.organizationId,
      table.eventId,
      table.createdAt,
    ),
    index('platform_fee_ledger_reservation_idx').on(
      table.reservationId,
      table.createdAt,
    ),
    check(
      'platform_fee_ledger_balance_ck',
      sql`${table.customerAmountCents} = ${table.platformFeeCents} + ${table.providerFeeCents} + ${table.merchantNetCents}`,
    ),
  ],
);

export const reservationStatusHistory = pgTable(
  'reservation_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    reservationId: uuid('reservation_id')
      .notNull()
      .references(() => reservations.id, { onDelete: 'cascade' }),
    fromStatus: reservationStatus('from_status'),
    toStatus: reservationStatus('to_status').notNull(),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: varchar('reason', { length: 500 }),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('reservation_status_history_reservation_created_idx').on(
      table.reservationId,
      table.createdAt,
    ),
    index('reservation_status_history_org_location_created_idx').on(
      table.organizationId,
      table.locationId,
      table.createdAt,
    ),
  ],
);
// PHASE_2_EVENTS_RESERVATIONS_TABLES_END

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

// PHASE_2_EVENTS_RESERVATIONS_TYPES_START
export type EventStatus = (typeof eventStatus.enumValues)[number];
export type ReservationStatus = (typeof reservationStatus.enumValues)[number];
export type ReservationHoldStatus =
  (typeof reservationHoldStatus.enumValues)[number];
export type ReservationAssignmentStatus =
  (typeof reservationAssignmentStatus.enumValues)[number];
export type ReservationPaymentStatus =
  (typeof reservationPaymentStatus.enumValues)[number];
export type PlatformFeeRuleScope =
  (typeof platformFeeRuleScope.enumValues)[number];
export type PlatformFeeLedgerEntryType =
  (typeof platformFeeLedgerEntryType.enumValues)[number];
// PHASE_2_EVENTS_RESERVATIONS_TYPES_END

export type FiscalProvider = (typeof fiscalProvider.enumValues)[number];
export type FiscalEnvironment = (typeof fiscalEnvironment.enumValues)[number];
export type FiscalDocumentType = (typeof fiscalDocumentType.enumValues)[number];
export type FiscalDocumentStatus =
  (typeof fiscalDocumentStatus.enumValues)[number];
export type FiscalAttemptOutcome =
  (typeof fiscalAttemptOutcome.enumValues)[number];

export type HospitalityStatus = (typeof hospitalityStatus.enumValues)[number];
export type TableSessionStatus = (typeof tableSessionStatus.enumValues)[number];
export type PrinterStatus = (typeof printerStatus.enumValues)[number];
export type PrinterPurpose = (typeof printerPurpose.enumValues)[number];
export type PrintDocumentType = (typeof printDocumentType.enumValues)[number];
export type PrintJobStatus = (typeof printJobStatus.enumValues)[number];
export type PrintAttemptOutcome =
  (typeof printAttemptOutcome.enumValues)[number];

export type KitchenTicketStatus =
  (typeof kitchenTicketStatus.enumValues)[number];

export type CheckoutStatus = (typeof checkoutStatus.enumValues)[number];
export type PaymentMethod = (typeof paymentMethod.enumValues)[number];
export type PaymentProvider = (typeof paymentProvider.enumValues)[number];
export type PaymentStatus = (typeof paymentStatus.enumValues)[number];
export type PaymentEventType = (typeof paymentEventType.enumValues)[number];

export type OrderStatus = (typeof orderStatus.enumValues)[number];
export type OrderServiceMode = (typeof orderServiceMode.enumValues)[number];
export type OrderAdjustmentType =
  (typeof orderAdjustmentType.enumValues)[number];

export type CatalogStatus = (typeof catalogStatus.enumValues)[number];
export type ProductUnit = (typeof productUnit.enumValues)[number];
export type MembershipRole = (typeof membershipRole.enumValues)[number];
export type MembershipStatus = (typeof membershipStatus.enumValues)[number];
export type DevicePlatform = (typeof devicePlatform.enumValues)[number];
