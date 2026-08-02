CREATE TABLE "event_table_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "code" varchar(40) NOT NULL,
  "name" varchar(120) NOT NULL,
  "capacity_snapshot" integer NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_table_groups_capacity_positive_ck"
    CHECK ("capacity_snapshot" > 0)
);
--> statement-breakpoint
CREATE TABLE "event_table_group_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  "dining_table_id" uuid NOT NULL,
  "capacity_snapshot" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_table_group_members_capacity_positive_ck"
    CHECK ("capacity_snapshot" > 0),
  CONSTRAINT "event_table_group_members_sort_nonnegative_ck"
    CHECK ("sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "event_table_inventory"
  ADD COLUMN "table_group_id" uuid;
--> statement-breakpoint
ALTER TABLE "event_table_inventory"
  ALTER COLUMN "dining_table_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "event_table_inventory"
  ADD CONSTRAINT "event_table_inventory_unit_ck"
  CHECK (
    ("dining_table_id" IS NOT NULL AND "table_group_id" IS NULL)
    OR
    ("dining_table_id" IS NULL AND "table_group_id" IS NOT NULL)
  );
--> statement-breakpoint
ALTER TABLE "reservation_table_assignments"
  ADD COLUMN "table_group_id" uuid;
--> statement-breakpoint
ALTER TABLE "reservation_table_assignments"
  ALTER COLUMN "dining_table_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "reservation_table_assignments"
  ADD CONSTRAINT "reservation_table_assignments_unit_ck"
  CHECK (
    ("dining_table_id" IS NOT NULL AND "table_group_id" IS NULL)
    OR
    ("dining_table_id" IS NULL AND "table_group_id" IS NOT NULL)
  );
--> statement-breakpoint
CREATE TABLE "reservation_table_assignment_tables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assignment_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "dining_table_id" uuid NOT NULL,
  "active_event_table_key" varchar(200),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_table_groups"
  ADD CONSTRAINT "event_table_groups_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_table_groups"
  ADD CONSTRAINT "event_table_groups_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_table_groups"
  ADD CONSTRAINT "event_table_groups_event_id_events_id_fk"
  FOREIGN KEY ("event_id") REFERENCES "public"."events"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_table_groups"
  ADD CONSTRAINT "event_table_groups_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_table_group_members"
  ADD CONSTRAINT "event_table_group_members_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_table_group_members"
  ADD CONSTRAINT "event_table_group_members_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_table_group_members"
  ADD CONSTRAINT "event_table_group_members_event_id_events_id_fk"
  FOREIGN KEY ("event_id") REFERENCES "public"."events"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_table_group_members"
  ADD CONSTRAINT "event_table_group_members_group_id_event_table_groups_id_fk"
  FOREIGN KEY ("group_id") REFERENCES "public"."event_table_groups"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_table_group_members"
  ADD CONSTRAINT "event_table_group_members_dining_table_id_dining_tables_id_fk"
  FOREIGN KEY ("dining_table_id") REFERENCES "public"."dining_tables"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event_table_inventory"
  ADD CONSTRAINT "event_table_inventory_table_group_id_event_table_groups_id_fk"
  FOREIGN KEY ("table_group_id") REFERENCES "public"."event_table_groups"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_table_assignments"
  ADD CONSTRAINT "reservation_table_assignments_table_group_id_event_table_groups_id_fk"
  FOREIGN KEY ("table_group_id") REFERENCES "public"."event_table_groups"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_table_assignment_tables"
  ADD CONSTRAINT "reservation_assignment_tables_assignment_id_assignments_id_fk"
  FOREIGN KEY ("assignment_id") REFERENCES "public"."reservation_table_assignments"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_table_assignment_tables"
  ADD CONSTRAINT "reservation_assignment_tables_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_table_assignment_tables"
  ADD CONSTRAINT "reservation_assignment_tables_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_table_assignment_tables"
  ADD CONSTRAINT "reservation_assignment_tables_event_id_events_id_fk"
  FOREIGN KEY ("event_id") REFERENCES "public"."events"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_table_assignment_tables"
  ADD CONSTRAINT "reservation_assignment_tables_dining_table_id_dining_tables_id_fk"
  FOREIGN KEY ("dining_table_id") REFERENCES "public"."dining_tables"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "event_table_inventory_event_table_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "event_table_inventory_event_table_uq"
  ON "event_table_inventory" USING btree ("event_id", "dining_table_id")
  WHERE "dining_table_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "event_table_inventory_event_group_uq"
  ON "event_table_inventory" USING btree ("event_id", "table_group_id")
  WHERE "table_group_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "event_table_groups_event_code_uq"
  ON "event_table_groups" USING btree ("event_id", "code");
--> statement-breakpoint
CREATE INDEX "event_table_groups_event_enabled_capacity_idx"
  ON "event_table_groups" USING btree
  ("event_id", "enabled", "capacity_snapshot");
--> statement-breakpoint
CREATE UNIQUE INDEX "event_table_group_members_group_table_uq"
  ON "event_table_group_members" USING btree
  ("group_id", "dining_table_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "event_table_group_members_event_table_uq"
  ON "event_table_group_members" USING btree
  ("event_id", "dining_table_id");
--> statement-breakpoint
CREATE INDEX "event_table_group_members_group_sort_idx"
  ON "event_table_group_members" USING btree ("group_id", "sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_assignment_tables_assignment_table_uq"
  ON "reservation_table_assignment_tables" USING btree
  ("assignment_id", "dining_table_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_assignment_tables_active_physical_uq"
  ON "reservation_table_assignment_tables" USING btree
  ("organization_id", "active_event_table_key")
  WHERE "active_event_table_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "reservation_assignment_tables_event_table_idx"
  ON "reservation_table_assignment_tables" USING btree
  ("event_id", "dining_table_id");
--> statement-breakpoint
INSERT INTO "reservation_table_assignment_tables" (
  "id",
  "assignment_id",
  "organization_id",
  "location_id",
  "event_id",
  "dining_table_id",
  "active_event_table_key"
)
SELECT
  gen_random_uuid(),
  rta.id,
  rta.organization_id,
  rta.location_id,
  rta.event_id,
  rta.dining_table_id,
  CASE
    WHEN rta.status = 'ACTIVE'
      THEN rta.event_id::text || ':' || rta.dining_table_id::text
    ELSE NULL
  END
FROM reservation_table_assignments rta
WHERE rta.dining_table_id IS NOT NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION release_assignment_physical_tables()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'ACTIVE' AND NEW.status = 'RELEASED' THEN
    UPDATE reservation_table_assignment_tables
    SET active_event_table_key = NULL
    WHERE assignment_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "reservation_assignment_release_physical_tables_trg"
AFTER UPDATE OF status ON "reservation_table_assignments"
FOR EACH ROW EXECUTE FUNCTION release_assignment_physical_tables();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_event_table_group_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  group_organization uuid;
  group_location uuid;
  group_event uuid;
  table_organization uuid;
  table_location uuid;
BEGIN
  SELECT organization_id, location_id, event_id
  INTO group_organization, group_location, group_event
  FROM event_table_groups
  WHERE id = NEW.group_id;

  SELECT organization_id, location_id
  INTO table_organization, table_location
  FROM dining_tables
  WHERE id = NEW.dining_table_id;

  IF group_organization IS NULL OR table_organization IS NULL THEN
    RAISE EXCEPTION 'Event table group or dining table does not exist.';
  END IF;

  IF NEW.organization_id <> group_organization
     OR NEW.location_id <> group_location
     OR NEW.event_id <> group_event
     OR NEW.organization_id <> table_organization
     OR NEW.location_id <> table_location THEN
    RAISE EXCEPTION 'Event table group member scope mismatch.';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "event_table_group_members_scope_trg"
BEFORE INSERT OR UPDATE ON "event_table_group_members"
FOR EACH ROW EXECUTE FUNCTION enforce_event_table_group_scope();
