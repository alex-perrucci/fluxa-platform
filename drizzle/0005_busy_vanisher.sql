CREATE TYPE "public"."hospitality_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."kitchen_ticket_status" AS ENUM('QUEUED', 'IN_PROGRESS', 'READY', 'SERVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."table_session_status" AS ENUM('OPEN', 'CLOSED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "dining_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "hospitality_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"capacity" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "hospitality_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospitality_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"mutation_id" uuid NOT NULL,
	"scope_type" varchar(30) NOT NULL,
	"scope_id" uuid NOT NULL,
	"operation" varchar(80) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"response_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"mutation_id" uuid NOT NULL,
	"kitchen_ticket_id" uuid NOT NULL,
	"operation" varchar(80) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"response_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_station_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "hospitality_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_ticket_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"client_batch_id" uuid NOT NULL,
	"request_hash" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_ticket_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kitchen_ticket_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity_amount" integer NOT NULL,
	"quantity_scale" integer NOT NULL,
	"product_name_snapshot" varchar(180) NOT NULL,
	"variant_name_snapshot" varchar(120),
	"note_snapshot" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_ticket_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"business_date" char(10) NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"number" varchar(40) NOT NULL,
	"status" "kitchen_ticket_status" DEFAULT 'QUEUED' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"table_session_id" uuid,
	"table_code_snapshot" varchar(40),
	"queued_by_user_id" uuid NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"served_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_session_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"table_session_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"attached_by_user_id" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"opened_by_user_id" uuid NOT NULL,
	"client_session_id" uuid NOT NULL,
	"request_hash" char(64) NOT NULL,
	"status" "table_session_status" DEFAULT 'OPEN' NOT NULL,
	"guest_count" integer NOT NULL,
	"note" varchar(500),
	"active_table_key" varchar(100),
	"version" integer DEFAULT 1 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"close_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dining_areas" ADD CONSTRAINT "dining_areas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_areas" ADD CONSTRAINT "dining_areas_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_area_id_dining_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."dining_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospitality_mutations" ADD CONSTRAINT "hospitality_mutations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hospitality_mutations" ADD CONSTRAINT "hospitality_mutations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_mutations" ADD CONSTRAINT "kitchen_mutations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_mutations" ADD CONSTRAINT "kitchen_mutations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_mutations" ADD CONSTRAINT "kitchen_mutations_kitchen_ticket_id_kitchen_tickets_id_fk" FOREIGN KEY ("kitchen_ticket_id") REFERENCES "public"."kitchen_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_station_categories" ADD CONSTRAINT "kitchen_station_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_station_categories" ADD CONSTRAINT "kitchen_station_categories_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_station_categories" ADD CONSTRAINT "kitchen_station_categories_station_id_kitchen_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_station_categories" ADD CONSTRAINT "kitchen_station_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_batches" ADD CONSTRAINT "kitchen_ticket_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_batches" ADD CONSTRAINT "kitchen_ticket_batches_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_batches" ADD CONSTRAINT "kitchen_ticket_batches_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_batches" ADD CONSTRAINT "kitchen_ticket_batches_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_batches" ADD CONSTRAINT "kitchen_ticket_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_items" ADD CONSTRAINT "kitchen_ticket_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_items" ADD CONSTRAINT "kitchen_ticket_items_kitchen_ticket_id_kitchen_tickets_id_fk" FOREIGN KEY ("kitchen_ticket_id") REFERENCES "public"."kitchen_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_items" ADD CONSTRAINT "kitchen_ticket_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_sequences" ADD CONSTRAINT "kitchen_ticket_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_ticket_sequences" ADD CONSTRAINT "kitchen_ticket_sequences_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_batch_id_kitchen_ticket_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."kitchen_ticket_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_station_id_kitchen_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_table_session_id_table_sessions_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_queued_by_user_id_users_id_fk" FOREIGN KEY ("queued_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_session_orders" ADD CONSTRAINT "table_session_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_session_orders" ADD CONSTRAINT "table_session_orders_table_session_id_table_sessions_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_session_orders" ADD CONSTRAINT "table_session_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_session_orders" ADD CONSTRAINT "table_session_orders_attached_by_user_id_users_id_fk" FOREIGN KEY ("attached_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dining_areas_org_location_code_uq" ON "dining_areas" USING btree ("organization_id","location_id","code");--> statement-breakpoint
CREATE INDEX "dining_areas_location_status_sort_idx" ON "dining_areas" USING btree ("location_id","status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_org_location_code_uq" ON "dining_tables" USING btree ("organization_id","location_id","code");--> statement-breakpoint
CREATE INDEX "dining_tables_area_status_sort_idx" ON "dining_tables" USING btree ("area_id","status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "hospitality_mutations_org_device_mutation_uq" ON "hospitality_mutations" USING btree ("organization_id","device_id","mutation_id");--> statement-breakpoint
CREATE INDEX "hospitality_mutations_org_scope_idx" ON "hospitality_mutations" USING btree ("organization_id","scope_type","scope_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_mutations_org_device_mutation_uq" ON "kitchen_mutations" USING btree ("organization_id","device_id","mutation_id");--> statement-breakpoint
CREATE INDEX "kitchen_mutations_ticket_idx" ON "kitchen_mutations" USING btree ("kitchen_ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_station_categories_route_uq" ON "kitchen_station_categories" USING btree ("organization_id","location_id","category_id");--> statement-breakpoint
CREATE INDEX "kitchen_station_categories_station_idx" ON "kitchen_station_categories" USING btree ("station_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_stations_org_location_code_uq" ON "kitchen_stations" USING btree ("organization_id","location_id","code");--> statement-breakpoint
CREATE INDEX "kitchen_stations_location_status_sort_idx" ON "kitchen_stations" USING btree ("location_id","status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_ticket_batches_org_device_client_uq" ON "kitchen_ticket_batches" USING btree ("organization_id","device_id","client_batch_id");--> statement-breakpoint
CREATE INDEX "kitchen_ticket_batches_org_order_idx" ON "kitchen_ticket_batches" USING btree ("organization_id","order_id","created_at");--> statement-breakpoint
CREATE INDEX "kitchen_ticket_items_ticket_idx" ON "kitchen_ticket_items" USING btree ("kitchen_ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "kitchen_ticket_items_order_item_idx" ON "kitchen_ticket_items" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_ticket_sequences_org_location_date_uq" ON "kitchen_ticket_sequences" USING btree ("organization_id","location_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_tickets_location_number_uq" ON "kitchen_tickets" USING btree ("location_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_tickets_batch_station_uq" ON "kitchen_tickets" USING btree ("batch_id","station_id");--> statement-breakpoint
CREATE INDEX "kitchen_tickets_location_station_status_idx" ON "kitchen_tickets" USING btree ("location_id","station_id","status","queued_at");--> statement-breakpoint
CREATE INDEX "kitchen_tickets_org_order_idx" ON "kitchen_tickets" USING btree ("organization_id","order_id","queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "table_session_orders_order_uq" ON "table_session_orders" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "table_session_orders_session_order_uq" ON "table_session_orders" USING btree ("table_session_id","order_id");--> statement-breakpoint
CREATE INDEX "table_session_orders_org_session_idx" ON "table_session_orders" USING btree ("organization_id","table_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "table_sessions_org_device_client_uq" ON "table_sessions" USING btree ("organization_id","device_id","client_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "table_sessions_org_active_table_uq" ON "table_sessions" USING btree ("organization_id","active_table_key");--> statement-breakpoint
CREATE INDEX "table_sessions_location_status_opened_idx" ON "table_sessions" USING btree ("location_id","status","opened_at");