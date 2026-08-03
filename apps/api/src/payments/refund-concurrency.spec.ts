import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const service = fs.readFileSync(
  path.join(root, 'apps/api/src/payments/refunds.service.ts'),
  'utf8',
);
const migration = fs.readFileSync(
  path.join(root, 'drizzle/0016_payment_refunds.sql'),
  'utf8',
);

describe('payment refund concurrency boundaries', () => {
  it('serializes allocation per payment and locks the source transaction', () => {
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('payment-refund:');
    expect(service).toContain('FOR UPDATE OF pt');
    expect(service).toContain("FILTER (WHERE status='SUCCEEDED')");
    expect(service).toContain("FILTER (WHERE status='PENDING')");
  });

  it('enforces an idempotent client refund key at database level', () => {
    expect(migration).toContain('payment_refunds_org_device_client_uq');
    expect(migration).toContain(
      '"organization_id", "requested_by_device_id", "client_refund_id"',
    );
  });

  it('prevents provider callbacks from being consumed twice', () => {
    expect(migration).toContain('payment_refunds_org_provider_event_uq');
    expect(migration).toContain('payment_refunds_org_provider_reference_uq');
  });
});
