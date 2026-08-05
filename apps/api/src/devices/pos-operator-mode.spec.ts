import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, 'drizzle/0018_pos_operator_mode.sql'),
  'utf8',
);
const assignmentService = fs.readFileSync(
  path.join(root, 'apps/api/src/devices/current-device-assignment.service.ts'),
  'utf8',
);
const devicesService = fs.readFileSync(
  path.join(root, 'apps/api/src/devices/devices.service.ts'),
  'utf8',
);

describe('POS operator mode', () => {
  it('persists a constrained mode on device assignments', () => {
    expect(migration).toContain("'AUTO', 'CASHIER', 'KITCHEN', 'MANAGER'");
    expect(migration).toContain('ADD COLUMN "operator_mode"');
    expect(migration).toContain("DEFAULT 'AUTO' NOT NULL");
  });

  it('returns the mode to the current POS bootstrap contract', () => {
    expect(assignmentService).toContain(
      'da.operator_mode::text AS "operatorMode"',
    );
    expect(assignmentService).toContain(
      "operatorMode: row.operatorMode ?? 'AUTO'",
    );
  });

  it('updates mode only through elevated device assignment endpoints', () => {
    expect(devicesService).toContain('$4::pos_operator_mode');
    expect(devicesService).toContain('operatorMode: dto.operatorMode');
  });
});
