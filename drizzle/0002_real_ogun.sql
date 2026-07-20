CREATE TYPE "public"."catalog_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."product_unit" AS ENUM('EACH', 'WEIGHT', 'VOLUME');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500),
	"color_hex" char(7),
	"image_url" varchar(500),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "catalog_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(140) NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" "catalog_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"price_key" varchar(160) NOT NULL,
	"amount_cents" integer NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" "catalog_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"sku" varchar(80),
	"barcode" varchar(80),
	"name" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "catalog_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"vat_rate_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"sku" varchar(80),
	"barcode" varchar(80),
	"name" varchar(180) NOT NULL,
	"description" text,
	"image_url" varchar(500),
	"unit" "product_unit" DEFAULT 'EACH' NOT NULL,
	"quantity_scale" integer DEFAULT 0 NOT NULL,
	"track_availability" boolean DEFAULT false NOT NULL,
	"status" "catalog_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vat_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"rate_basis_points" integer NOT NULL,
	"nature_code" varchar(8),
	"fiscal_description" varchar(220),
	"is_default" boolean DEFAULT false NOT NULL,
	"status" "catalog_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_price_lists" ADD CONSTRAINT "location_price_lists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_price_lists" ADD CONSTRAINT "location_price_lists_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_price_lists" ADD CONSTRAINT "location_price_lists_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_products" ADD CONSTRAINT "location_products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_products" ADD CONSTRAINT "location_products_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_products" ADD CONSTRAINT "location_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_vat_rate_id_vat_rates_id_fk" FOREIGN KEY ("vat_rate_id") REFERENCES "public"."vat_rates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_rates" ADD CONSTRAINT "vat_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_org_code_uq" ON "categories" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "categories_org_status_sort_idx" ON "categories" USING btree ("organization_id","status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "location_price_lists_location_list_uq" ON "location_price_lists" USING btree ("location_id","price_list_id");--> statement-breakpoint
CREATE INDEX "location_price_lists_org_location_idx" ON "location_price_lists" USING btree ("organization_id","location_id","active","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "location_products_location_product_uq" ON "location_products" USING btree ("location_id","product_id");--> statement-breakpoint
CREATE INDEX "location_products_org_location_idx" ON "location_products" USING btree ("organization_id","location_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "price_lists_org_code_uq" ON "price_lists" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "price_lists_org_status_priority_idx" ON "price_lists" USING btree ("organization_id","status","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "product_prices_list_key_uq" ON "product_prices" USING btree ("price_list_id","price_key");--> statement-breakpoint
CREATE INDEX "product_prices_org_product_idx" ON "product_prices" USING btree ("organization_id","product_id","status");--> statement-breakpoint
CREATE INDEX "product_prices_list_status_idx" ON "product_prices" USING btree ("price_list_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_product_code_uq" ON "product_variants" USING btree ("product_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_org_sku_uq" ON "product_variants" USING btree ("organization_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_org_barcode_uq" ON "product_variants" USING btree ("organization_id","barcode");--> statement-breakpoint
CREATE INDEX "product_variants_product_status_idx" ON "product_variants" USING btree ("product_id","status","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_code_uq" ON "products" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_sku_uq" ON "products" USING btree ("organization_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_barcode_uq" ON "products" USING btree ("organization_id","barcode");--> statement-breakpoint
CREATE INDEX "products_org_status_idx" ON "products" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_vat_rate_idx" ON "products" USING btree ("vat_rate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vat_rates_org_code_uq" ON "vat_rates" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "vat_rates_org_status_idx" ON "vat_rates" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "vat_rates_org_default_idx" ON "vat_rates" USING btree ("organization_id","is_default");