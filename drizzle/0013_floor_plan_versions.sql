CREATE TYPE "floor_plan_version_status" AS ENUM ('DRAFT', 'PUBLISHED');
--> statement-breakpoint
CREATE TABLE "floor_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "name" varchar(180) DEFAULT 'Piantina principale' NOT NULL,
  "published_version_id" uuid,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "floor_plans_organization_location_uq"
    UNIQUE("organization_id", "location_id")
);
--> statement-breakpoint
CREATE TABLE "floor_plan_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "floor_plan_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "status" "floor_plan_version_status" DEFAULT 'DRAFT' NOT NULL,
  "document" jsonb NOT NULL,
  "created_by_user_id" uuid,
  "published_by_user_id" uuid,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "floor_plan_versions_plan_version_uq"
    UNIQUE("floor_plan_id", "version_number"),
  CONSTRAINT "floor_plan_versions_version_positive_ck"
    CHECK ("version_number" > 0),
  CONSTRAINT "floor_plan_versions_revision_positive_ck"
    CHECK ("revision" > 0),
  CONSTRAINT "floor_plan_versions_publication_state_ck"
    CHECK (
      ("status" = 'DRAFT' AND "published_at" IS NULL)
      OR
      ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL)
    )
);
--> statement-breakpoint
ALTER TABLE "floor_plans"
  ADD CONSTRAINT "floor_plans_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floor_plans"
  ADD CONSTRAINT "floor_plans_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floor_plans"
  ADD CONSTRAINT "floor_plans_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floor_plan_versions"
  ADD CONSTRAINT "floor_plan_versions_floor_plan_id_floor_plans_id_fk"
  FOREIGN KEY ("floor_plan_id") REFERENCES "public"."floor_plans"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floor_plan_versions"
  ADD CONSTRAINT "floor_plan_versions_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floor_plan_versions"
  ADD CONSTRAINT "floor_plan_versions_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floor_plan_versions"
  ADD CONSTRAINT "floor_plan_versions_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floor_plan_versions"
  ADD CONSTRAINT "floor_plan_versions_published_by_user_id_users_id_fk"
  FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "floor_plans"
  ADD CONSTRAINT "floor_plans_published_version_id_floor_plan_versions_id_fk"
  FOREIGN KEY ("published_version_id") REFERENCES "public"."floor_plan_versions"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "floor_plans_org_location_idx"
  ON "floor_plans" USING btree ("organization_id", "location_id");
--> statement-breakpoint
CREATE INDEX "floor_plan_versions_plan_status_idx"
  ON "floor_plan_versions" USING btree
  ("floor_plan_id", "status", "version_number");
--> statement-breakpoint
CREATE INDEX "floor_plan_versions_org_location_idx"
  ON "floor_plan_versions" USING btree
  ("organization_id", "location_id", "version_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "floor_plan_versions_one_draft_uq"
  ON "floor_plan_versions" USING btree ("floor_plan_id")
  WHERE "status" = 'DRAFT';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_floor_plan_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  plan_organization uuid;
  plan_location uuid;
  location_organization uuid;
BEGIN
  SELECT organization_id, location_id
  INTO plan_organization, plan_location
  FROM floor_plans
  WHERE id = NEW.floor_plan_id;

  SELECT organization_id
  INTO location_organization
  FROM locations
  WHERE id = NEW.location_id;

  IF plan_organization IS NULL OR plan_location IS NULL THEN
    RAISE EXCEPTION 'Floor plan does not exist.';
  END IF;

  IF location_organization IS NULL THEN
    RAISE EXCEPTION 'Location does not exist.';
  END IF;

  IF NEW.organization_id <> plan_organization
     OR NEW.location_id <> plan_location
     OR NEW.organization_id <> location_organization THEN
    RAISE EXCEPTION 'Floor plan version scope mismatch.';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "floor_plan_versions_scope_trg"
BEFORE INSERT OR UPDATE ON "floor_plan_versions"
FOR EACH ROW EXECUTE FUNCTION enforce_floor_plan_scope();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_floor_plan_publication_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_plan uuid;
  version_status floor_plan_version_status;
BEGIN
  IF NEW.published_version_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT floor_plan_id, status
  INTO version_plan, version_status
  FROM floor_plan_versions
  WHERE id = NEW.published_version_id;

  IF version_plan IS NULL
     OR version_plan <> NEW.id
     OR version_status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'Published version must belong to the floor plan and be published.';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "floor_plans_publication_reference_trg"
BEFORE INSERT OR UPDATE OF published_version_id ON "floor_plans"
FOR EACH ROW EXECUTE FUNCTION enforce_floor_plan_publication_reference();
