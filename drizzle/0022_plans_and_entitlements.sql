DO $$
BEGIN
  CREATE TYPE "subscription_plan" AS ENUM ('START', 'SALA', 'PRO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "subscription_status" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action,
  "plan" "subscription_plan" NOT NULL,
  "status" "subscription_status" DEFAULT 'ACTIVE' NOT NULL,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_subscriptions_org_uq" ON "organization_subscriptions" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_subscriptions_org_status_idx" ON "organization_subscriptions" USING btree ("organization_id", "status");
--> statement-breakpoint
INSERT INTO "organization_subscriptions" (
  "organization_id",
  "plan",
  "status",
  "starts_at",
  "created_at",
  "updated_at"
)
SELECT
  o."id",
  'PRO'::"subscription_plan",
  'ACTIVE'::"subscription_status",
  COALESCE(o."created_at", now()),
  now(),
  now()
FROM "organizations" o
ON CONFLICT ("organization_id") DO NOTHING;
