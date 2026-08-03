import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const service = fs.readFileSync(
  path.join(root, 'apps/api/src/control-center/sales-backoffice.service.ts'),
  'utf8',
);
const controller = fs.readFileSync(
  path.join(root, 'apps/api/src/control-center/control-center.controller.ts'),
  'utf8',
);

describe('merchant sales backoffice boundaries', () => {
  it('exposes orders, payments, fiscal documents, reports and CSV', () => {
    expect(controller).toContain("@Get('sales/orders')");
    expect(controller).toContain("@Get('sales/orders/:orderId')");
    expect(controller).toContain("@Get('sales/payments')");
    expect(controller).toContain("@Get('sales/fiscal-documents')");
    expect(controller).toContain("@Get('sales/reports')");
    expect(controller).toContain("@Get('sales/reports.csv')");
  });

  it('keeps POS revenue separate from booking deposits', () => {
    expect(service).toContain('FROM payment_transactions pt');
    expect(service).toContain("pt.status='CAPTURED'");
    expect(service).toContain('AS "posRevenueCents"');
    expect(service).toContain('FROM reservation_payments rp');
    expect(service).toContain('AS "bookingDepositsCents"');
  });

  it('does not depend on cash shifts', () => {
    expect(service).not.toMatch(/cash[_-]?shift/i);
    expect(service).not.toMatch(/register[_-]?shift/i);
    expect(service).not.toMatch(/drawer[_-]?session/i);
  });

  it('applies membership location scope to aggregate views', () => {
    expect(service).toContain('organization_membership_locations');
    expect(service).toContain('oml.membership_id=$2');
    expect(service).toContain('l.id=ANY($2::uuid[])');
  });
});
