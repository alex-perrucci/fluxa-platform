CREATE TABLE "organization_membership_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "membership_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "can_manage_location" boolean DEFAULT false NOT NULL,
  "can_manage_events" boolean DEFAULT false NOT NULL,
  "can_manage_tables" boolean DEFAULT false NOT NULL,
  "can_manage_floor_plan" boolean DEFAULT false NOT NULL,
  "can_manage_staff" boolean DEFAULT false NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_membership_locations_membership_location_uq"
    UNIQUE("membership_id", "location_id")
);
--> statement-breakpoint
ALTER TABLE "organization_membership_locations"
  ADD CONSTRAINT "organization_membership_locations_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_membership_locations"
  ADD CONSTRAINT "organization_membership_locations_membership_id_organization_memberships_id_fk"
  FOREIGN KEY ("membership_id") REFERENCES "public"."organization_memberships"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_membership_locations"
  ADD CONSTRAINT "organization_membership_locations_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_membership_locations"
  ADD CONSTRAINT "organization_membership_locations_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "organization_membership_locations_membership_active_idx"
  ON "organization_membership_locations" USING btree
  ("membership_id", "active");
--> statement-breakpoint
CREATE INDEX "organization_membership_locations_location_active_idx"
  ON "organization_membership_locations" USING btree
  ("organization_id", "location_id", "active");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_membership_location_organization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  membership_organization uuid;
  location_organization uuid;
BEGIN
  SELECT organization_id
  INTO membership_organization
  FROM organization_memberships
  WHERE id = NEW.membership_id;

  SELECT organization_id
  INTO location_organization
  FROM locations
  WHERE id = NEW.location_id;

  IF membership_organization IS NULL OR location_organization IS NULL THEN
    RAISE EXCEPTION 'Membership or location does not exist.';
  END IF;

  IF NEW.organization_id <> membership_organization
     OR NEW.organization_id <> location_organization THEN
    RAISE EXCEPTION 'Membership and location must belong to the same organization.';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "organization_membership_locations_scope_trg"
BEFORE INSERT OR UPDATE ON "organization_membership_locations"
FOR EACH ROW EXECUTE FUNCTION enforce_membership_location_organization();
--> statement-breakpoint
INSERT INTO "organization_membership_locations" (
  "organization_id",
  "membership_id",
  "location_id",
  "can_manage_location",
  "can_manage_events",
  "can_manage_tables",
  "can_manage_floor_plan",
  "can_manage_staff",
  "active"
)
SELECT
  om.organization_id,
  om.id,
  om.default_location_id,
  om.role = 'MANAGER',
  om.role = 'MANAGER',
  om.role = 'MANAGER',
  om.role = 'MANAGER',
  om.role = 'MANAGER',
  om.status = 'ACTIVE'
FROM organization_memberships om
WHERE om.default_location_id IS NOT NULL
  AND om.role NOT IN ('OWNER', 'ADMIN')
ON CONFLICT ("membership_id", "location_id") DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ensure_default_membership_location_access()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IN ('OWNER', 'ADMIN') OR NEW.status <> 'ACTIVE' THEN
    UPDATE organization_membership_locations
    SET active = false, updated_at = now()
    WHERE membership_id = NEW.id;
    RETURN NEW;
  END IF;

  IF NEW.role <> 'MANAGER' THEN
    UPDATE organization_membership_locations
    SET
      can_manage_location = false,
      can_manage_events = false,
      can_manage_tables = false,
      can_manage_floor_plan = false,
      can_manage_staff = false,
      updated_at = now()
    WHERE membership_id = NEW.id;
  END IF;

  IF NEW.default_location_id IS NOT NULL THEN
    INSERT INTO organization_membership_locations (
      organization_id,
      membership_id,
      location_id,
      can_manage_location,
      can_manage_events,
      can_manage_tables,
      can_manage_floor_plan,
      can_manage_staff,
      active
    ) VALUES (
      NEW.organization_id,
      NEW.id,
      NEW.default_location_id,
      NEW.role = 'MANAGER',
      NEW.role = 'MANAGER',
      NEW.role = 'MANAGER',
      NEW.role = 'MANAGER',
      NEW.role = 'MANAGER',
      true
    )
    ON CONFLICT (membership_id, location_id)
    DO UPDATE SET
      active = true,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "organization_memberships_default_location_access_trg"
AFTER INSERT OR UPDATE OF role, status, default_location_id
ON "organization_memberships"
FOR EACH ROW EXECUTE FUNCTION ensure_default_membership_location_access();
