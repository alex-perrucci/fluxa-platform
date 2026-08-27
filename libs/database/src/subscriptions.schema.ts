import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './schema';

export const subscriptionPlan = pgEnum('subscription_plan', [
  'START',
  'SALA',
  'PRO',
]);

export const subscriptionStatus = pgEnum('subscription_status', [
  'ACTIVE',
  'TRIAL',
  'SUSPENDED',
]);

export const organizationSubscriptions = pgTable(
  'organization_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    plan: subscriptionPlan('plan').notNull(),
    status: subscriptionStatus('status').notNull().default('ACTIVE'),
    startsAt: timestamp('starts_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('organization_subscriptions_org_uq').on(table.organizationId),
    index('organization_subscriptions_org_status_idx').on(
      table.organizationId,
      table.status,
    ),
  ],
);

export type SubscriptionPlan = (typeof subscriptionPlan.enumValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatus.enumValues)[number];
