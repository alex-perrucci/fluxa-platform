CREATE TYPE "public"."fiscal_attempt_outcome" AS ENUM('STARTED', 'SUCCEEDED', 'RETRY', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."fiscal_document_status" AS ENUM('QUEUED', 'PROCESSING', 'ISSUED', 'RETRY', 'REJECTED', 'VOIDED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."fiscal_document_type" AS ENUM('SALE', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."fiscal_environment" AS ENUM('SANDBOX', 'PRODUCTION');--> statement-breakpoint
CREATE TYPE "public"."fiscal_provider" AS ENUM('MOCK', 'ACUBE_SMART_RECEIPTS');--> statement-breakpoint
CREATE TABLE "fiscal_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"fiscal_document_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"outcome" "fiscal_attempt_outcome" NOT NULL,
	"error_code" varchar(100),
	"error_message" text,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fiscal_document_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"fiscal_document_id" uuid NOT NULL,
	"order_item_id" uuid,
	"line_no" integer NOT NULL,
	"description" varchar(1000) NOT NULL,
	"quantity_amount" integer NOT NULL,
	"quantity_scale" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"gross_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"final_gross_cents" integer NOT NULL,
	"vat_rate_basis_points" integer NOT NULL,
	"vat_nature_code" varchar(8),
	"vat_rate_code" varchar(8) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_document_vat_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"fiscal_document_id" uuid NOT NULL,
	"vat_key" varchar(32) NOT NULL,
	"vat_rate_basis_points" integer NOT NULL,
	"vat_nature_code" varchar(8),
	"gross_cents" integer NOT NULL,
	"net_cents" integer NOT NULL,
	"tax_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"parent_document_id" uuid,
	"type" "fiscal_document_type" NOT NULL,
	"status" "fiscal_document_status" DEFAULT 'QUEUED' NOT NULL,
	"provider" "fiscal_provider" NOT NULL,
	"environment" "fiscal_environment" NOT NULL,
	"fiscal_id_snapshot" varchar(32) NOT NULL,
	"currency" char(3) NOT NULL,
	"total_cents" integer NOT NULL,
	"cash_payment_cents" integer DEFAULT 0 NOT NULL,
	"electronic_payment_cents" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"provider_response" jsonb,
	"request_hash" char(64) NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"requested_by_device_id" uuid NOT NULL,
	"client_request_id" uuid,
	"external_id" varchar(200),
	"external_status" varchar(80),
	"document_number" varchar(120),
	"document_date" varchar(80),
	"error_code" varchar(100),
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"issued_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"fiscal_document_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"mutation_id" uuid NOT NULL,
	"operation" varchar(40) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"response_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"provider" "fiscal_provider" NOT NULL,
	"environment" "fiscal_environment" NOT NULL,
	"fiscal_id" varchar(32) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"auto_issue_on_paid" boolean DEFAULT false NOT NULL,
	"receipt_email" varchar(320),
	"display_name" varchar(120),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fiscal_attempts" ADD CONSTRAINT "fiscal_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_attempts" ADD CONSTRAINT "fiscal_attempts_fiscal_document_id_fiscal_documents_id_fk" FOREIGN KEY ("fiscal_document_id") REFERENCES "public"."fiscal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_document_items" ADD CONSTRAINT "fiscal_document_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_document_items" ADD CONSTRAINT "fiscal_document_items_fiscal_document_id_fiscal_documents_id_fk" FOREIGN KEY ("fiscal_document_id") REFERENCES "public"."fiscal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_document_items" ADD CONSTRAINT "fiscal_document_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_document_vat_summaries" ADD CONSTRAINT "fiscal_document_vat_summaries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_document_vat_summaries" ADD CONSTRAINT "fiscal_document_vat_summaries_fiscal_document_id_fiscal_documents_id_fk" FOREIGN KEY ("fiscal_document_id") REFERENCES "public"."fiscal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_requested_by_device_id_devices_id_fk" FOREIGN KEY ("requested_by_device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_mutations" ADD CONSTRAINT "fiscal_mutations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_mutations" ADD CONSTRAINT "fiscal_mutations_fiscal_document_id_fiscal_documents_id_fk" FOREIGN KEY ("fiscal_document_id") REFERENCES "public"."fiscal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_mutations" ADD CONSTRAINT "fiscal_mutations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_profiles" ADD CONSTRAINT "fiscal_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_profiles" ADD CONSTRAINT "fiscal_profiles_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_attempts_document_attempt_uq" ON "fiscal_attempts" USING btree ("fiscal_document_id","attempt_no");--> statement-breakpoint
CREATE INDEX "fiscal_attempts_org_document_idx" ON "fiscal_attempts" USING btree ("organization_id","fiscal_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_document_items_document_line_uq" ON "fiscal_document_items" USING btree ("fiscal_document_id","line_no");--> statement-breakpoint
CREATE INDEX "fiscal_document_items_org_document_idx" ON "fiscal_document_items" USING btree ("organization_id","fiscal_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_document_vat_document_key_uq" ON "fiscal_document_vat_summaries" USING btree ("fiscal_document_id","vat_key");--> statement-breakpoint
CREATE INDEX "fiscal_document_vat_org_document_idx" ON "fiscal_document_vat_summaries" USING btree ("organization_id","fiscal_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_documents_org_device_request_uq" ON "fiscal_documents" USING btree ("organization_id","requested_by_device_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_documents_order_sale_uq" ON "fiscal_documents" USING btree ("order_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_documents_parent_type_uq" ON "fiscal_documents" USING btree ("parent_document_id","type");--> statement-breakpoint
CREATE INDEX "fiscal_documents_dispatch_idx" ON "fiscal_documents" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "fiscal_documents_org_location_created_idx" ON "fiscal_documents" USING btree ("organization_id","location_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_mutations_document_device_mutation_uq" ON "fiscal_mutations" USING btree ("fiscal_document_id","device_id","mutation_id");--> statement-breakpoint
CREATE INDEX "fiscal_mutations_org_created_idx" ON "fiscal_mutations" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_profiles_org_location_uq" ON "fiscal_profiles" USING btree ("organization_id","location_id");--> statement-breakpoint
CREATE INDEX "fiscal_profiles_org_enabled_idx" ON "fiscal_profiles" USING btree ("organization_id","enabled");