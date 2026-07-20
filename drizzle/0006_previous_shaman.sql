CREATE TYPE "public"."print_attempt_outcome" AS ENUM('CLAIMED', 'COMPLETED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."print_document_type" AS ENUM('KITCHEN_TICKET', 'ORDER_RECEIPT', 'PAYMENT_RECEIPT', 'TEST_PAGE');--> statement-breakpoint
CREATE TYPE "public"."print_job_status" AS ENUM('QUEUED', 'CLAIMED', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."printer_purpose" AS ENUM('RECEIPT', 'KITCHEN', 'LABEL', 'GENERIC');--> statement-breakpoint
CREATE TYPE "public"."printer_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TABLE "print_job_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"print_job_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"lease_token" uuid NOT NULL,
	"outcome" "print_attempt_outcome" NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "print_job_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"print_job_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"mutation_id" uuid NOT NULL,
	"operation" varchar(40) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"response_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"printer_id" uuid NOT NULL,
	"document_type" "print_document_type" NOT NULL,
	"source_entity_type" varchar(80) NOT NULL,
	"source_entity_id" uuid,
	"dedupe_key" varchar(220) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rendered_text" text NOT NULL,
	"template_version" integer DEFAULT 1 NOT NULL,
	"copies" integer DEFAULT 1 NOT NULL,
	"status" "print_job_status" DEFAULT 'QUEUED' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_by_device_id" uuid,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"last_error" text,
	"version" integer DEFAULT 1 NOT NULL,
	"requested_by_user_id" uuid,
	"requested_by_device_id" uuid,
	"client_request_id" uuid,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printer_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"route_key" varchar(180) NOT NULL,
	"document_type" "print_document_type" NOT NULL,
	"kitchen_station_id" uuid,
	"printer_id" uuid NOT NULL,
	"copies" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"purpose" "printer_purpose" NOT NULL,
	"agent_device_id" uuid,
	"driver" varchar(80) DEFAULT 'ESC_POS_TEXT' NOT NULL,
	"paper_width_mm" integer DEFAULT 80 NOT NULL,
	"characters_per_line" integer DEFAULT 48 NOT NULL,
	"supports_cut" boolean DEFAULT true NOT NULL,
	"supports_drawer" boolean DEFAULT false NOT NULL,
	"status" "printer_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"agent_version" varchar(80),
	"status_message" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "print_job_attempts" ADD CONSTRAINT "print_job_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_attempts" ADD CONSTRAINT "print_job_attempts_print_job_id_print_jobs_id_fk" FOREIGN KEY ("print_job_id") REFERENCES "public"."print_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_attempts" ADD CONSTRAINT "print_job_attempts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_mutations" ADD CONSTRAINT "print_job_mutations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_mutations" ADD CONSTRAINT "print_job_mutations_print_job_id_print_jobs_id_fk" FOREIGN KEY ("print_job_id") REFERENCES "public"."print_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_job_mutations" ADD CONSTRAINT "print_job_mutations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_claimed_by_device_id_devices_id_fk" FOREIGN KEY ("claimed_by_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_requested_by_device_id_devices_id_fk" FOREIGN KEY ("requested_by_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printer_routes" ADD CONSTRAINT "printer_routes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printer_routes" ADD CONSTRAINT "printer_routes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printer_routes" ADD CONSTRAINT "printer_routes_kitchen_station_id_kitchen_stations_id_fk" FOREIGN KEY ("kitchen_station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printer_routes" ADD CONSTRAINT "printer_routes_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_agent_device_id_devices_id_fk" FOREIGN KEY ("agent_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "print_job_attempts_job_lease_uq" ON "print_job_attempts" USING btree ("print_job_id","lease_token");--> statement-breakpoint
CREATE INDEX "print_job_attempts_org_job_idx" ON "print_job_attempts" USING btree ("organization_id","print_job_id","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "print_job_mutations_job_device_mutation_uq" ON "print_job_mutations" USING btree ("print_job_id","device_id","mutation_id");--> statement-breakpoint
CREATE INDEX "print_job_mutations_org_created_idx" ON "print_job_mutations" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "print_jobs_org_printer_dedupe_uq" ON "print_jobs" USING btree ("organization_id","printer_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "print_jobs_claim_idx" ON "print_jobs" USING btree ("organization_id","location_id","printer_id","status","next_attempt_at","priority");--> statement-breakpoint
CREATE INDEX "print_jobs_source_idx" ON "print_jobs" USING btree ("organization_id","source_entity_type","source_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "printer_routes_location_key_printer_uq" ON "printer_routes" USING btree ("location_id","route_key","printer_id");--> statement-breakpoint
CREATE INDEX "printer_routes_org_location_active_idx" ON "printer_routes" USING btree ("organization_id","location_id","active");--> statement-breakpoint
CREATE INDEX "printer_routes_station_idx" ON "printer_routes" USING btree ("kitchen_station_id");--> statement-breakpoint
CREATE UNIQUE INDEX "printers_org_location_code_uq" ON "printers" USING btree ("organization_id","location_id","code");--> statement-breakpoint
CREATE INDEX "printers_org_location_status_idx" ON "printers" USING btree ("organization_id","location_id","status");--> statement-breakpoint
CREATE INDEX "printers_agent_device_idx" ON "printers" USING btree ("agent_device_id","status");