ALTER TYPE "payment_status" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
--> statement-breakpoint
ALTER TYPE "payment_status" ADD VALUE IF NOT EXISTS 'REFUNDED';
--> statement-breakpoint
ALTER TYPE "payment_event_type" ADD VALUE IF NOT EXISTS 'REFUND_REQUESTED';
--> statement-breakpoint
ALTER TYPE "payment_event_type" ADD VALUE IF NOT EXISTS 'REFUND_SUCCEEDED';
--> statement-breakpoint
ALTER TYPE "payment_event_type" ADD VALUE IF NOT EXISTS 'REFUND_FAILED';
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "payment_refund_status" AS ENUM (
    'PENDING',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
CREATE TABLE "payment_refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "payment_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "requested_by_user_id" uuid NOT NULL,
  "requested_by_device_id" uuid NOT NULL,
  "client_refund_id" uuid NOT NULL,
  "request_hash" char(64) NOT NULL,
  "method" "payment_method" NOT NULL,
  "provider" "payment_provider" NOT NULL,
  "status" "payment_refund_status" DEFAULT 'PENDING' NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" char(3) NOT NULL,
  "reason" varchar(500) NOT NULL,
  "provider_reference" varchar(200),
  "provider_event_id" varchar(200),
  "failure_code" varchar(80),
  "failure_message" varchar(500),
  "version" integer DEFAULT 1 NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_refunds_amount_positive_ck" CHECK ("amount_cents" > 0),
  CONSTRAINT "payment_refunds_method_ck" CHECK ("method" IN ('CASH', 'CARD')),
  CONSTRAINT "payment_refunds_provider_ck" CHECK (
    ("method" = 'CASH' AND "provider" = 'CASH')
    OR
    ("method" = 'CARD' AND "provider" <> 'CASH')
  )
);
--> statement-breakpoint
ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_payment_id_payment_transactions_id_fk"
  FOREIGN KEY ("payment_id") REFERENCES "public"."payment_transactions"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_order_id_orders_id_fk"
  FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_requested_by_user_id_users_id_fk"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_requested_by_device_id_devices_id_fk"
  FOREIGN KEY ("requested_by_device_id") REFERENCES "public"."devices"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_org_device_client_uq"
  ON "payment_refunds" USING btree
  ("organization_id", "requested_by_device_id", "client_refund_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_org_provider_reference_uq"
  ON "payment_refunds" USING btree
  ("organization_id", "provider", "provider_reference")
  WHERE "provider_reference" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_org_provider_event_uq"
  ON "payment_refunds" USING btree
  ("organization_id", "provider_event_id")
  WHERE "provider_event_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "payment_refunds_payment_status_created_idx"
  ON "payment_refunds" USING btree
  ("payment_id", "status", "created_at");
--> statement-breakpoint
CREATE INDEX "payment_refunds_org_location_created_idx"
  ON "payment_refunds" USING btree
  ("organization_id", "location_id", "created_at");
