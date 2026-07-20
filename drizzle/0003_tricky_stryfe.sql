CREATE TYPE "public"."order_adjustment_type" AS ENUM('FIXED', 'PERCENTAGE');--> statement-breakpoint
CREATE TYPE "public"."order_service_mode" AS ENUM('COUNTER', 'TAKEAWAY', 'DELIVERY', 'TABLE');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('OPEN', 'HELD', 'AWAITING_PAYMENT', 'PAID', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "location_order_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"business_date" char(10) NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"client_adjustment_id" uuid NOT NULL,
	"type" "order_adjustment_type" NOT NULL,
	"value" integer NOT NULL,
	"reason" varchar(300) NOT NULL,
	"applied_cents" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"client_item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"product_code_snapshot" varchar(50) NOT NULL,
	"product_name_snapshot" varchar(180) NOT NULL,
	"variant_code_snapshot" varchar(50),
	"variant_name_snapshot" varchar(120),
	"sku_snapshot" varchar(80),
	"barcode_snapshot" varchar(80),
	"category_id_snapshot" uuid NOT NULL,
	"category_code_snapshot" varchar(40) NOT NULL,
	"category_name_snapshot" varchar(120) NOT NULL,
	"unit_snapshot" "product_unit" NOT NULL,
	"quantity_amount" integer NOT NULL,
	"quantity_scale" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"gross_total_cents" integer NOT NULL,
	"allocated_discount_cents" integer DEFAULT 0 NOT NULL,
	"final_gross_cents" integer NOT NULL,
	"final_net_cents" integer NOT NULL,
	"final_tax_cents" integer NOT NULL,
	"vat_rate_id_snapshot" uuid NOT NULL,
	"vat_code_snapshot" varchar(40) NOT NULL,
	"vat_rate_basis_points_snapshot" integer NOT NULL,
	"vat_nature_code_snapshot" varchar(8),
	"price_list_id_snapshot" uuid NOT NULL,
	"note" varchar(500),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"mutation_id" uuid NOT NULL,
	"operation" varchar(80) NOT NULL,
	"request_hash" char(64) NOT NULL,
	"response_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_vat_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"vat_key" varchar(32) NOT NULL,
	"vat_rate_basis_points" integer NOT NULL,
	"vat_nature_code" varchar(8),
	"gross_cents" integer NOT NULL,
	"net_cents" integer NOT NULL,
	"tax_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"client_order_id" uuid NOT NULL,
	"number" varchar(40) NOT NULL,
	"business_date" char(10) NOT NULL,
	"status" "order_status" DEFAULT 'OPEN' NOT NULL,
	"service_mode" "order_service_mode" NOT NULL,
	"customer_note" text,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"net_total_cents" integer DEFAULT 0 NOT NULL,
	"tax_total_cents" integer DEFAULT 0 NOT NULL,
	"held_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"cancel_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "location_order_sequences" ADD CONSTRAINT "location_order_sequences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_order_sequences" ADD CONSTRAINT "location_order_sequences_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_adjustments" ADD CONSTRAINT "order_adjustments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_mutations" ADD CONSTRAINT "order_mutations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_mutations" ADD CONSTRAINT "order_mutations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_mutations" ADD CONSTRAINT "order_mutations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_vat_summaries" ADD CONSTRAINT "order_vat_summaries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_vat_summaries" ADD CONSTRAINT "order_vat_summaries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "location_order_sequences_org_location_date_uq" ON "location_order_sequences" USING btree ("organization_id","location_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "order_adjustments_order_client_uq" ON "order_adjustments" USING btree ("order_id","client_adjustment_id");--> statement-breakpoint
CREATE INDEX "order_adjustments_org_order_idx" ON "order_adjustments" USING btree ("organization_id","order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_client_uq" ON "order_items" USING btree ("order_id","client_item_id");--> statement-breakpoint
CREATE INDEX "order_items_org_order_sort_idx" ON "order_items" USING btree ("organization_id","order_id","sort_order");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_mutations_order_device_mutation_uq" ON "order_mutations" USING btree ("order_id","device_id","mutation_id");--> statement-breakpoint
CREATE INDEX "order_mutations_org_created_idx" ON "order_mutations" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_vat_summaries_order_key_uq" ON "order_vat_summaries" USING btree ("order_id","vat_key");--> statement-breakpoint
CREATE INDEX "order_vat_summaries_org_order_idx" ON "order_vat_summaries" USING btree ("organization_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_org_device_client_uq" ON "orders" USING btree ("organization_id","device_id","client_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_location_number_uq" ON "orders" USING btree ("location_id","number");--> statement-breakpoint
CREATE INDEX "orders_org_location_status_created_idx" ON "orders" USING btree ("organization_id","location_id","status","created_at");--> statement-breakpoint
CREATE INDEX "orders_created_by_idx" ON "orders" USING btree ("created_by_user_id","created_at");