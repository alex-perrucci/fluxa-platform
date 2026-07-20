CREATE TYPE "public"."checkout_status" AS ENUM('OPEN', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_event_type" AS ENUM('CREATED', 'CAPTURED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'CARD', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('CASH', 'MANUAL_TERMINAL', 'EXTERNAL_TERMINAL');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'CAPTURED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "checkout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"client_checkout_id" uuid NOT NULL,
	"request_hash" char(64) NOT NULL,
	"status" "checkout_status" DEFAULT 'OPEN' NOT NULL,
	"currency" char(3) NOT NULL,
	"order_version_snapshot" integer NOT NULL,
	"order_total_cents" integer NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"remaining_cents" integer NOT NULL,
	"change_cents" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"mutation_id" uuid NOT NULL,
	"scope_type" varchar(20) NOT NULL,
	"scope_id" uuid NOT NULL,
	"operation" varchar(80) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"type" "payment_event_type" NOT NULL,
	"provider_event_id" varchar(200),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"checkout_session_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"client_payment_id" uuid NOT NULL,
	"request_hash" char(64) NOT NULL,
	"method" "payment_method" NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"status" "payment_status" NOT NULL,
	"amount_cents" integer NOT NULL,
	"tendered_cents" integer,
	"change_cents" integer DEFAULT 0 NOT NULL,
	"provider_reference" varchar(200),
	"failure_code" varchar(80),
	"failure_message" varchar(500),
	"captured_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_mutations" ADD CONSTRAINT "financial_mutations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_mutations" ADD CONSTRAINT "financial_mutations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payment_transactions_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_checkout_session_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_session_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_sessions_org_device_client_uq" ON "checkout_sessions" USING btree ("organization_id","device_id","client_checkout_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_org_location_status_idx" ON "checkout_sessions" USING btree ("organization_id","location_id","status","created_at");--> statement-breakpoint
CREATE INDEX "checkout_sessions_org_order_status_idx" ON "checkout_sessions" USING btree ("organization_id","order_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_mutations_org_device_mutation_uq" ON "financial_mutations" USING btree ("organization_id","device_id","mutation_id");--> statement-breakpoint
CREATE INDEX "financial_mutations_org_scope_idx" ON "financial_mutations" USING btree ("organization_id","scope_type","scope_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_org_provider_event_uq" ON "payment_events" USING btree ("organization_id","provider_event_id");--> statement-breakpoint
CREATE INDEX "payment_events_payment_created_idx" ON "payment_events" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_org_device_client_uq" ON "payment_transactions" USING btree ("organization_id","device_id","client_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_org_provider_ref_uq" ON "payment_transactions" USING btree ("organization_id","provider","provider_reference");--> statement-breakpoint
CREATE INDEX "payment_transactions_checkout_status_idx" ON "payment_transactions" USING btree ("checkout_session_id","status","created_at");--> statement-breakpoint
CREATE INDEX "payment_transactions_org_order_idx" ON "payment_transactions" USING btree ("organization_id","order_id","created_at");