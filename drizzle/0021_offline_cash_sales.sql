CREATE TABLE "offline_sale_replays" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "device_id" uuid NOT NULL,
  "sale_id" uuid NOT NULL,
  "request_hash" char(64) NOT NULL,
  "order_id" uuid NOT NULL,
  "checkout_id" uuid NOT NULL,
  "payment_id" uuid NOT NULL,
  "result_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offline_sale_replays" ADD CONSTRAINT "offline_sale_replays_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "offline_sale_replays" ADD CONSTRAINT "offline_sale_replays_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "offline_sale_replays" ADD CONSTRAINT "offline_sale_replays_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "offline_sale_replays" ADD CONSTRAINT "offline_sale_replays_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "offline_sale_replays" ADD CONSTRAINT "offline_sale_replays_checkout_id_checkout_sessions_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkout_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "offline_sale_replays" ADD CONSTRAINT "offline_sale_replays_payment_id_payment_transactions_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment_transactions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "offline_sale_replays_org_device_sale_uq" ON "offline_sale_replays" USING btree ("organization_id","device_id","sale_id");
--> statement-breakpoint
CREATE INDEX "offline_sale_replays_org_location_created_idx" ON "offline_sale_replays" USING btree ("organization_id","location_id","created_at");
