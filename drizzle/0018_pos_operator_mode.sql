DO $$ BEGIN
 CREATE TYPE "public"."pos_operator_mode" AS ENUM('AUTO', 'CASHIER', 'KITCHEN', 'MANAGER');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "device_assignments"
  ADD COLUMN "operator_mode" "pos_operator_mode" DEFAULT 'AUTO' NOT NULL;
--> statement-breakpoint
CREATE INDEX "device_assignments_org_mode_active_idx"
  ON "device_assignments" USING btree
  ("organization_id", "operator_mode", "active");
