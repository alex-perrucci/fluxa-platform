CREATE TYPE "public"."location_kind" AS ENUM('PERMANENT', 'TEMPORARY');
CREATE TYPE "public"."location_lifecycle_status" AS ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED');

CREATE TABLE "location_lifecycle" (
  "location_id" uuid PRIMARY KEY NOT NULL,
  "organization_id" uuid NOT NULL,
  "kind" "location_kind" DEFAULT 'PERMANENT' NOT NULL,
  "lifecycle_status" "location_lifecycle_status" DEFAULT 'ACTIVE' NOT NULL,
  "active_from" timestamp with time zone,
  "active_until" timestamp with time zone,
  "source_location_id" uuid,
  "archived_at" timestamp with time zone,
  "archived_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "location_lifecycle_window_ck" CHECK (
    "active_until" IS NULL OR "active_from" IS NULL OR "active_until" > "active_from"
  ),
  CONSTRAINT "location_lifecycle_temporary_window_ck" CHECK (
    "kind" = 'PERMANENT' OR ("active_from" IS NOT NULL AND "active_until" IS NOT NULL)
  )
);

ALTER TABLE "location_lifecycle"
  ADD CONSTRAINT "location_lifecycle_location_id_locations_id_fk"
  FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "location_lifecycle"
  ADD CONSTRAINT "location_lifecycle_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "location_lifecycle"
  ADD CONSTRAINT "location_lifecycle_source_location_id_locations_id_fk"
  FOREIGN KEY ("source_location_id") REFERENCES "public"."locations"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "location_lifecycle"
  ADD CONSTRAINT "location_lifecycle_archived_by_user_id_users_id_fk"
  FOREIGN KEY ("archived_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX "location_lifecycle_org_status_kind_idx"
  ON "location_lifecycle" USING btree ("organization_id", "lifecycle_status", "kind");
CREATE INDEX "location_lifecycle_active_window_idx"
  ON "location_lifecycle" USING btree ("active_from", "active_until");

INSERT INTO "location_lifecycle" (
  "location_id", "organization_id", "kind", "lifecycle_status"
)
SELECT
  l.id,
  l.organization_id,
  'PERMANENT'::"location_kind",
  CASE
    WHEN l.status = 'ACTIVE' THEN 'ACTIVE'::"location_lifecycle_status"
    ELSE 'INACTIVE'::"location_lifecycle_status"
  END
FROM "locations" l
ON CONFLICT ("location_id") DO NOTHING;
