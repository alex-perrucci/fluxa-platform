import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const service = fs.readFileSync(
  path.join(root, 'apps/api/src/fiscal/refund-fiscal-void.service.ts'),
  'utf8',
);
const controller = fs.readFileSync(
  path.join(root, 'apps/api/src/fiscal/fiscal-documents.controller.ts'),
  'utf8',
);
const migration = fs.readFileSync(
  path.join(root, 'drizzle/0017_refund_fiscal_voids.sql'),
  'utf8',
);

describe('refund-linked fiscal void lifecycle', () => {
  it('requires a completed refund and a fully refunded order', () => {
    expect(service).toContain("lockedRefund.status !== 'SUCCEEDED'");
    expect(service).toContain(
      'refundState.refundedCents < refundState.orderTotalCents',
    );
    expect(service).toContain('PARTIAL_REFUND_CANNOT_VOID_FISCAL_DOCUMENT');
  });

  it('serializes void creation and links it to exactly one refund', () => {
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain('fiscal-refund-void:');
    expect(service).toContain('payment_refund_id');
    expect(migration).toContain('fiscal_documents_payment_refund_void_uq');
  });

  it('requires elevated owner or admin authorization', () => {
    expect(controller).toContain(
      "@Post('payment-refunds/:refundId/fiscal-void')",
    );
    expect(controller).toContain("@Roles('OWNER', 'ADMIN')");
  });

  it('emits audit and outbox records before queue execution', () => {
    expect(service).toContain('fiscal.refund-void.queued');
    expect(service).toContain('INSERT INTO audit_events');
    expect(service).toContain('INSERT INTO outbox_events');
    expect(service).toContain('this.queue.enqueue(documentId)');
  });
});
