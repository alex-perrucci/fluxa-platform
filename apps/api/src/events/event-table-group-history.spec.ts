import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, 'drizzle/0015_event_table_group_history.sql'),
  'utf8',
);
const service = fs.readFileSync(
  path.join(root, 'apps/api/src/events/event-table-groups.service.ts'),
  'utf8',
);

describe('event table group assignment history', () => {
  it('separates the operational group reference from immutable history', () => {
    expect(migration).toContain(
      'ADD COLUMN "table_group_members_snapshot" jsonb',
    );
    expect(migration).toContain(
      'ADD COLUMN "table_group_code_snapshot" varchar(40)',
    );
    expect(migration).toContain(
      'ADD COLUMN "table_group_name_snapshot" varchar(120)',
    );
    expect(migration).toContain(
      'ADD COLUMN "table_group_capacity_snapshot" integer',
    );
  });

  it('backfills existing active and released group assignments', () => {
    expect(migration).toContain(
      'UPDATE "reservation_table_assignments" assignment',
    );
    expect(migration).toContain(
      'WHERE assignment."table_group_id" = group_row."id"',
    );
    expect(migration).not.toContain(
      "WHERE assignment.\"status\" = 'ACTIVE'",
    );
  });

  it('keeps released or cancelled reservation history after a split', () => {
    expect(migration).toContain('ON DELETE set null ON UPDATE no action');
    expect(migration).toContain(
      'CREATE TRIGGER "reservation_assignment_group_snapshot_trg"',
    );
    expect(migration).toContain(
      "jsonb_array_length(\"table_group_members_snapshot\") >= 2",
    );
  });

  it('still blocks a split while an assignment is active', () => {
    expect(service).toContain(
      "WHERE event_id=$1 AND table_group_id=$2 AND status='ACTIVE'",
    );
    expect(service).toContain(
      'assertTablesNotAssigned(groupAssignments.rows[0]?.count ?? 0)',
    );
  });

  it('keeps repeated split attempts deterministic', () => {
    expect(service).toContain("code: 'EVENT_TABLE_GROUP_NOT_FOUND'");
    expect(service).toContain("message: 'Gruppo tavoli non trovato per questo evento.'");
  });
});
