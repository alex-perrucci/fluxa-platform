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
