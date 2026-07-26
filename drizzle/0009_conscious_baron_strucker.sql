CREATE TYPE "public"."event_status" AS ENUM('DRAFT', 'PUBLISHED', 'SOLD_OUT', 'CANCELLED', 'COMPLETED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."platform_fee_ledger_entry_type" AS ENUM('CHARGE', 'REFUND', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."platform_fee_rule_scope" AS ENUM('GLOBAL', 'ORGANIZATION', 'EVENT');--> statement-breakpoint
CREATE TYPE "public"."reservation_assignment_status" AS ENUM('ACTIVE', 'RELEASED');--> statement-breakpoint
CREATE TYPE "public"."reservation_hold_status" AS ENUM('ACTIVE', 'CONVERTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."reservation_payment_status" AS ENUM('CREATED', 'REQUIRES_ACTION', 'PAID', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'SEATED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW', 'REFUND_PENDING', 'REFUNDED');--> statement-breakpoint
CREATE TABLE "event_booking_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"min_party_size" integer DEFAULT 1 NOT NULL,
	"max_party_size" integer NOT NULL,
	"hold_minutes" integer DEFAULT 15 NOT NULL,
	"booking_cutoff_minutes" integer DEFAULT 0 NOT NULL,
	"cancellation_cutoff_minutes" integer DEFAULT 0 NOT NULL,
	"auto_assign_smallest_table" boolean DEFAULT true NOT NULL,
	"allow_manual_assignment" boolean DEFAULT true NOT NULL,
	"require_phone" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_booking_rules_party_range_ck" CHECK ("event_booking_rules"."min_party_size" > 0 and "event_booking_rules"."max_party_size" >= "event_booking_rules"."min_party_size"),
	CONSTRAINT "event_booking_rules_hold_minutes_ck" CHECK ("event_booking_rules"."hold_minutes" between 1 and 120),
	CONSTRAINT "event_booking_rules_booking_cutoff_ck" CHECK ("event_booking_rules"."booking_cutoff_minutes" >= 0),
	CONSTRAINT "event_booking_rules_cancellation_cutoff_ck" CHECK ("event_booking_rules"."cancellation_cutoff_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"object_key" varchar(1000) NOT NULL,
	"public_url" varchar(1000),
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"width_px" integer,
	"height_px" integer,
	"alt_text" varchar(300),
	"is_cover" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_media_size_positive_ck" CHECK ("event_media"."size_bytes" > 0),
	CONSTRAINT "event_media_sort_nonnegative_ck" CHECK ("event_media"."sort_order" >= 0),
	CONSTRAINT "event_media_width_positive_ck" CHECK ("event_media"."width_px" is null or "event_media"."width_px" > 0),
	CONSTRAINT "event_media_height_positive_ck" CHECK ("event_media"."height_px" is null or "event_media"."height_px" > 0)
);
--> statement-breakpoint
CREATE TABLE "event_table_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"dining_table_id" uuid NOT NULL,
	"capacity_snapshot" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_table_inventory_capacity_positive_ck" CHECK ("event_table_inventory"."capacity_snapshot" > 0)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"title" varchar(220) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"timezone" varchar(80) DEFAULT 'Europe/Rome' NOT NULL,
	"status" "event_status" DEFAULT 'DRAFT' NOT NULL,
	"cover_image_url" varchar(1000),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"booking_opens_at" timestamp with time zone NOT NULL,
	"booking_closes_at" timestamp with time zone NOT NULL,
	"booking_amount_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"capacity" integer NOT NULL,
	"cancellation_policy" text,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_time_window_ck" CHECK ("events"."ends_at" > "events"."starts_at"),
	CONSTRAINT "events_booking_window_ck" CHECK ("events"."booking_opens_at" < "events"."booking_closes_at"),
	CONSTRAINT "events_booking_before_start_ck" CHECK ("events"."booking_closes_at" <= "events"."starts_at"),
	CONSTRAINT "events_booking_amount_nonnegative_ck" CHECK ("events"."booking_amount_cents" >= 0),
	CONSTRAINT "events_capacity_positive_ck" CHECK ("events"."capacity" > 0),
	CONSTRAINT "events_version_positive_ck" CHECK ("events"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "platform_fee_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"reservation_payment_id" uuid,
	"entry_type" "platform_fee_ledger_entry_type" NOT NULL,
	"source_key" varchar(240) NOT NULL,
	"customer_amount_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"provider_fee_cents" integer NOT NULL,
	"merchant_net_cents" integer NOT NULL,
	"currency" char(3) NOT NULL,
	"description" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_fee_ledger_balance_ck" CHECK ("platform_fee_ledger"."customer_amount_cents" = "platform_fee_ledger"."platform_fee_cents" + "platform_fee_ledger"."provider_fee_cents" + "platform_fee_ledger"."merchant_net_cents")
);
--> statement-breakpoint
CREATE TABLE "platform_fee_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "platform_fee_rule_scope" NOT NULL,
	"organization_id" uuid,
	"event_id" uuid,
	"basis_points" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_fee_rules_basis_points_ck" CHECK ("platform_fee_rules"."basis_points" between 0 and 10000),
	CONSTRAINT "platform_fee_rules_effective_window_ck" CHECK ("platform_fee_rules"."effective_to" is null or "platform_fee_rules"."effective_to" > "platform_fee_rules"."effective_from"),
	CONSTRAINT "platform_fee_rules_scope_ck" CHECK ((
        ("platform_fee_rules"."scope" = 'GLOBAL' and "platform_fee_rules"."organization_id" is null and "platform_fee_rules"."event_id" is null)
        or
        ("platform_fee_rules"."scope" = 'ORGANIZATION' and "platform_fee_rules"."organization_id" is not null and "platform_fee_rules"."event_id" is null)
        or
        ("platform_fee_rules"."scope" = 'EVENT' and "platform_fee_rules"."organization_id" is not null and "platform_fee_rules"."event_id" is not null)
      ))
);
--> statement-breakpoint
CREATE TABLE "reservation_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"fee_rule_id" uuid,
	"public_token_hash" char(64) NOT NULL,
	"idempotency_key" varchar(200) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"status" "reservation_hold_status" DEFAULT 'ACTIVE' NOT NULL,
	"party_size" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"platform_fee_basis_points" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"merchant_gross_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"converted_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_holds_party_positive_ck" CHECK ("reservation_holds"."party_size" > 0),
	CONSTRAINT "reservation_holds_amount_nonnegative_ck" CHECK ("reservation_holds"."amount_cents" >= 0),
	CONSTRAINT "reservation_holds_fee_basis_points_ck" CHECK ("reservation_holds"."platform_fee_basis_points" between 0 and 10000),
	CONSTRAINT "reservation_holds_fee_nonnegative_ck" CHECK ("reservation_holds"."platform_fee_cents" >= 0),
	CONSTRAINT "reservation_holds_merchant_gross_ck" CHECK ("reservation_holds"."merchant_gross_cents" = "reservation_holds"."amount_cents" - "reservation_holds"."platform_fee_cents"),
	CONSTRAINT "reservation_holds_expiry_after_creation_ck" CHECK ("reservation_holds"."expires_at" > "reservation_holds"."created_at"),
	CONSTRAINT "reservation_holds_version_positive_ck" CHECK ("reservation_holds"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "reservation_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"status" "reservation_payment_status" DEFAULT 'CREATED' NOT NULL,
	"provider" varchar(80) NOT NULL,
	"provider_payment_id" varchar(240),
	"provider_session_id" varchar(240),
	"provider_event_id" varchar(240),
	"idempotency_key" varchar(200) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"amount_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"merchant_gross_cents" integer NOT NULL,
	"provider_fee_cents" integer DEFAULT 0 NOT NULL,
	"merchant_net_cents" integer NOT NULL,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"currency" char(3) NOT NULL,
	"failure_code" varchar(100),
	"failure_message" varchar(1000),
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_payments_amount_positive_ck" CHECK ("reservation_payments"."amount_cents" > 0),
	CONSTRAINT "reservation_payments_platform_fee_nonnegative_ck" CHECK ("reservation_payments"."platform_fee_cents" >= 0),
	CONSTRAINT "reservation_payments_merchant_gross_ck" CHECK ("reservation_payments"."merchant_gross_cents" = "reservation_payments"."amount_cents" - "reservation_payments"."platform_fee_cents"),
	CONSTRAINT "reservation_payments_provider_fee_nonnegative_ck" CHECK ("reservation_payments"."provider_fee_cents" >= 0),
	CONSTRAINT "reservation_payments_merchant_net_ck" CHECK ("reservation_payments"."merchant_net_cents" = "reservation_payments"."merchant_gross_cents" - "reservation_payments"."provider_fee_cents"),
	CONSTRAINT "reservation_payments_refunded_range_ck" CHECK ("reservation_payments"."refunded_cents" between 0 and "reservation_payments"."amount_cents")
);
--> statement-breakpoint
CREATE TABLE "reservation_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"from_status" "reservation_status",
	"to_status" "reservation_status" NOT NULL,
	"changed_by_user_id" uuid,
	"reason" varchar(500),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_table_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"dining_table_id" uuid NOT NULL,
	"hold_id" uuid,
	"reservation_id" uuid,
	"assigned_by_user_id" uuid,
	"status" "reservation_assignment_status" DEFAULT 'ACTIVE' NOT NULL,
	"active_event_table_key" varchar(200),
	"version" integer DEFAULT 1 NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"release_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_table_assignments_owner_ck" CHECK ((
        ("reservation_table_assignments"."hold_id" is not null and "reservation_table_assignments"."reservation_id" is null)
        or
        ("reservation_table_assignments"."hold_id" is null and "reservation_table_assignments"."reservation_id" is not null)
      )),
	CONSTRAINT "reservation_table_assignments_active_state_ck" CHECK ((
        ("reservation_table_assignments"."status" = 'ACTIVE' and "reservation_table_assignments"."active_event_table_key" is not null and "reservation_table_assignments"."released_at" is null)
        or
        ("reservation_table_assignments"."status" = 'RELEASED' and "reservation_table_assignments"."active_event_table_key" is null and "reservation_table_assignments"."released_at" is not null)
      )),
	CONSTRAINT "reservation_table_assignments_version_positive_ck" CHECK ("reservation_table_assignments"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"hold_id" uuid,
	"fee_rule_id" uuid,
	"table_session_id" uuid,
	"created_by_user_id" uuid,
	"public_token_hash" char(64) NOT NULL,
	"confirmation_code" varchar(24) NOT NULL,
	"status" "reservation_status" DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"customer_name" varchar(180) NOT NULL,
	"customer_email" varchar(320) NOT NULL,
	"customer_phone" varchar(40),
	"customer_note" varchar(1000),
	"party_size" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"platform_fee_basis_points" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"merchant_gross_cents" integer NOT NULL,
	"provider_fee_cents" integer DEFAULT 0 NOT NULL,
	"merchant_net_cents" integer NOT NULL,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"confirmed_at" timestamp with time zone,
	"checked_in_at" timestamp with time zone,
	"seated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"no_show_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_party_positive_ck" CHECK ("reservations"."party_size" > 0),
	CONSTRAINT "reservations_amount_nonnegative_ck" CHECK ("reservations"."amount_cents" >= 0),
	CONSTRAINT "reservations_fee_basis_points_ck" CHECK ("reservations"."platform_fee_basis_points" between 0 and 10000),
	CONSTRAINT "reservations_fee_nonnegative_ck" CHECK ("reservations"."platform_fee_cents" >= 0),
	CONSTRAINT "reservations_merchant_gross_ck" CHECK ("reservations"."merchant_gross_cents" = "reservations"."amount_cents" - "reservations"."platform_fee_cents"),
	CONSTRAINT "reservations_provider_fee_nonnegative_ck" CHECK ("reservations"."provider_fee_cents" >= 0),
	CONSTRAINT "reservations_merchant_net_ck" CHECK ("reservations"."merchant_net_cents" = "reservations"."merchant_gross_cents" - "reservations"."provider_fee_cents"),
	CONSTRAINT "reservations_refunded_range_ck" CHECK ("reservations"."refunded_cents" between 0 and "reservations"."amount_cents"),
	CONSTRAINT "reservations_version_positive_ck" CHECK ("reservations"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "event_booking_rules" ADD CONSTRAINT "event_booking_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_booking_rules" ADD CONSTRAINT "event_booking_rules_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_booking_rules" ADD CONSTRAINT "event_booking_rules_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_table_inventory" ADD CONSTRAINT "event_table_inventory_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_table_inventory" ADD CONSTRAINT "event_table_inventory_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_table_inventory" ADD CONSTRAINT "event_table_inventory_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_table_inventory" ADD CONSTRAINT "event_table_inventory_dining_table_id_dining_tables_id_fk" FOREIGN KEY ("dining_table_id") REFERENCES "public"."dining_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_fee_ledger" ADD CONSTRAINT "platform_fee_ledger_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_fee_ledger" ADD CONSTRAINT "platform_fee_ledger_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_fee_ledger" ADD CONSTRAINT "platform_fee_ledger_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_fee_ledger" ADD CONSTRAINT "platform_fee_ledger_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_fee_ledger" ADD CONSTRAINT "platform_fee_ledger_reservation_payment_id_reservation_payments_id_fk" FOREIGN KEY ("reservation_payment_id") REFERENCES "public"."reservation_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_fee_rules" ADD CONSTRAINT "platform_fee_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_fee_rules" ADD CONSTRAINT "platform_fee_rules_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_fee_rules" ADD CONSTRAINT "platform_fee_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_holds" ADD CONSTRAINT "reservation_holds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_holds" ADD CONSTRAINT "reservation_holds_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_holds" ADD CONSTRAINT "reservation_holds_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_holds" ADD CONSTRAINT "reservation_holds_fee_rule_id_platform_fee_rules_id_fk" FOREIGN KEY ("fee_rule_id") REFERENCES "public"."platform_fee_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_payments" ADD CONSTRAINT "reservation_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_payments" ADD CONSTRAINT "reservation_payments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_payments" ADD CONSTRAINT "reservation_payments_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_status_history" ADD CONSTRAINT "reservation_status_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_table_assignments" ADD CONSTRAINT "reservation_table_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_table_assignments" ADD CONSTRAINT "reservation_table_assignments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_table_assignments" ADD CONSTRAINT "reservation_table_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_table_assignments" ADD CONSTRAINT "reservation_table_assignments_dining_table_id_dining_tables_id_fk" FOREIGN KEY ("dining_table_id") REFERENCES "public"."dining_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_table_assignments" ADD CONSTRAINT "reservation_table_assignments_hold_id_reservation_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."reservation_holds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_table_assignments" ADD CONSTRAINT "reservation_table_assignments_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_table_assignments" ADD CONSTRAINT "reservation_table_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_hold_id_reservation_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."reservation_holds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_fee_rule_id_platform_fee_rules_id_fk" FOREIGN KEY ("fee_rule_id") REFERENCES "public"."platform_fee_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_session_id_table_sessions_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_booking_rules_event_uq" ON "event_booking_rules" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_booking_rules_org_location_idx" ON "event_booking_rules" USING btree ("organization_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_media_event_object_key_uq" ON "event_media" USING btree ("event_id","object_key");--> statement-breakpoint
CREATE INDEX "event_media_event_cover_sort_idx" ON "event_media" USING btree ("event_id","is_cover","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "event_table_inventory_event_table_uq" ON "event_table_inventory" USING btree ("event_id","dining_table_id");--> statement-breakpoint
CREATE INDEX "event_table_inventory_event_enabled_capacity_idx" ON "event_table_inventory" USING btree ("event_id","enabled","capacity_snapshot");--> statement-breakpoint
CREATE INDEX "event_table_inventory_org_location_idx" ON "event_table_inventory" USING btree ("organization_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_uq" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "events_org_location_status_start_idx" ON "events" USING btree ("organization_id","location_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "events_public_status_booking_idx" ON "events" USING btree ("status","booking_opens_at","booking_closes_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_fee_ledger_source_key_uq" ON "platform_fee_ledger" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "platform_fee_ledger_org_event_created_idx" ON "platform_fee_ledger" USING btree ("organization_id","event_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_fee_ledger_reservation_idx" ON "platform_fee_ledger" USING btree ("reservation_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_fee_rules_resolution_idx" ON "platform_fee_rules" USING btree ("scope","organization_id","event_id","active","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_holds_public_token_hash_uq" ON "reservation_holds" USING btree ("public_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_holds_event_idempotency_uq" ON "reservation_holds" USING btree ("organization_id","event_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "reservation_holds_expiry_idx" ON "reservation_holds" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "reservation_holds_org_location_event_idx" ON "reservation_holds" USING btree ("organization_id","location_id","event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_payments_reservation_idempotency_uq" ON "reservation_payments" USING btree ("reservation_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_payments_provider_payment_uq" ON "reservation_payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_payments_provider_event_uq" ON "reservation_payments" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "reservation_payments_reservation_status_idx" ON "reservation_payments" USING btree ("reservation_id","status","created_at");--> statement-breakpoint
CREATE INDEX "reservation_payments_org_location_created_idx" ON "reservation_payments" USING btree ("organization_id","location_id","created_at");--> statement-breakpoint
CREATE INDEX "reservation_status_history_reservation_created_idx" ON "reservation_status_history" USING btree ("reservation_id","created_at");--> statement-breakpoint
CREATE INDEX "reservation_status_history_org_location_created_idx" ON "reservation_status_history" USING btree ("organization_id","location_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_table_assignments_hold_uq" ON "reservation_table_assignments" USING btree ("hold_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_table_assignments_reservation_uq" ON "reservation_table_assignments" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_table_assignments_active_table_uq" ON "reservation_table_assignments" USING btree ("organization_id","active_event_table_key");--> statement-breakpoint
CREATE INDEX "reservation_table_assignments_event_status_idx" ON "reservation_table_assignments" USING btree ("event_id","status","assigned_at");--> statement-breakpoint
CREATE INDEX "reservation_table_assignments_table_idx" ON "reservation_table_assignments" USING btree ("dining_table_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_hold_uq" ON "reservations" USING btree ("hold_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_public_token_hash_uq" ON "reservations" USING btree ("public_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_confirmation_code_uq" ON "reservations" USING btree ("confirmation_code");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_table_session_uq" ON "reservations" USING btree ("table_session_id");--> statement-breakpoint
CREATE INDEX "reservations_org_location_event_status_idx" ON "reservations" USING btree ("organization_id","location_id","event_id","status","created_at");--> statement-breakpoint
CREATE INDEX "reservations_customer_email_idx" ON "reservations" USING btree ("organization_id","customer_email","created_at");