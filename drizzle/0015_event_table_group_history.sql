ALTER TABLE "reservation_table_assignments"
  ADD COLUMN "table_group_code_snapshot" varchar(40),
  ADD COLUMN "table_group_name_snapshot" varchar(120),
  ADD COLUMN "table_group_capacity_snapshot" integer,
  ADD COLUMN "table_group_members_snapshot" jsonb;
--> statement-breakpoint
UPDATE "reservation_table_assignments" assignment
SET
  "table_group_code_snapshot" = group_row."code",
  "table_group_name_snapshot" = group_row."name",
  "table_group_capacity_snapshot" = group_row."capacity_snapshot",
  "table_group_members_snapshot" = members."snapshot"
FROM "event_table_groups" group_row
CROSS JOIN LATERAL (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'diningTableId', member."dining_table_id",
        'code', dining_table."code",
        'name', dining_table."name",
        'capacity', member."capacity_snapshot",
        'sortOrder', member."sort_order"
      )
      ORDER BY member."sort_order", member."id"
    ),
    '[]'::jsonb
  ) AS "snapshot"
  FROM "event_table_group_members" member
  JOIN "dining_tables" dining_table
    ON dining_table."id" = member."dining_table_id"
  WHERE member."group_id" = group_row."id"
) members
WHERE assignment."table_group_id" = group_row."id";
--> statement-breakpoint
ALTER TABLE "reservation_table_assignments"
  DROP CONSTRAINT "reservation_table_assignments_table_group_id_event_table_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "reservation_table_assignments"
  ADD CONSTRAINT "reservation_table_assignments_table_group_id_event_table_groups_id_fk"
  FOREIGN KEY ("table_group_id") REFERENCES "public"."event_table_groups"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reservation_table_assignments"
  ADD CONSTRAINT "reservation_table_assignments_group_history_ck"
  CHECK (
    (
      "table_group_code_snapshot" IS NULL
      AND "table_group_name_snapshot" IS NULL
      AND "table_group_capacity_snapshot" IS NULL
      AND "table_group_members_snapshot" IS NULL
    )
    OR
    (
      "table_group_code_snapshot" IS NOT NULL
      AND "table_group_name_snapshot" IS NOT NULL
      AND "table_group_capacity_snapshot" > 0
      AND jsonb_typeof("table_group_members_snapshot") = 'array'
      AND jsonb_array_length("table_group_members_snapshot") >= 2
    )
  );
--> statement-breakpoint
CREATE OR REPLACE FUNCTION snapshot_reservation_table_group()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  group_code varchar(40);
  group_name varchar(120);
  group_capacity integer;
  group_members jsonb;
BEGIN
  IF NEW.table_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    group_row.code,
    group_row.name,
    group_row.capacity_snapshot,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'diningTableId', member.dining_table_id,
          'code', dining_table.code,
          'name', dining_table.name,
          'capacity', member.capacity_snapshot,
          'sortOrder', member.sort_order
        )
        ORDER BY member.sort_order, member.id
      ) FILTER (WHERE member.id IS NOT NULL),
      '[]'::jsonb
    )
  INTO group_code, group_name, group_capacity, group_members
  FROM event_table_groups group_row
  LEFT JOIN event_table_group_members member
    ON member.group_id = group_row.id
  LEFT JOIN dining_tables dining_table
    ON dining_table.id = member.dining_table_id
  WHERE group_row.id = NEW.table_group_id
  GROUP BY group_row.id;

  IF group_code IS NULL OR jsonb_array_length(group_members) < 2 THEN
    RAISE EXCEPTION 'Table group snapshot cannot be created for assignment.';
  END IF;

  NEW.table_group_code_snapshot := group_code;
  NEW.table_group_name_snapshot := group_name;
  NEW.table_group_capacity_snapshot := group_capacity;
  NEW.table_group_members_snapshot := group_members;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "reservation_assignment_group_snapshot_trg"
BEFORE INSERT OR UPDATE OF "table_group_id"
ON "reservation_table_assignments"
FOR EACH ROW
WHEN (NEW."table_group_id" IS NOT NULL)
EXECUTE FUNCTION snapshot_reservation_table_group();
--> statement-breakpoint
CREATE INDEX "reservation_assignments_group_history_idx"
  ON "reservation_table_assignments" USING btree
  ("event_id", "table_group_code_snapshot", "assigned_at")
  WHERE "table_group_code_snapshot" IS NOT NULL;
