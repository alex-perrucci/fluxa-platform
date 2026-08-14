import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { FiscalAutoIssueService } from './fiscal-auto-issue.service';
import { FiscalDocumentsService } from './fiscal-documents.service';

const auth: AuthContext = {
  userId: 'user-1',
  sessionId: 'session-1',
  deviceId: 'device-1',
  email: 'cashier@example.com',
  displayName: 'Cashier',
  platformAdmin: false,
  organizationId: 'org-1',
  membershipId: 'membership-1',
  role: 'CASHIER',
};

describe('FiscalAutoIssueService', () => {
  it('issues a fiscal document when the paid location enables auto issue', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ enabled: true, autoIssueOnPaid: true }],
    });
    const issue = jest.fn().mockResolvedValue({ id: 'document-1' });
    const service = new FiscalAutoIssueService(
      { pool: { query } } as unknown as DatabaseService,
      { issue } as unknown as FiscalDocumentsService,
    );

    await service.issueAfterPaidOrder(auth, 'order-1');

    expect(issue).toHaveBeenCalledTimes(1);
  });

  it('does nothing when auto issue is disabled', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ enabled: true, autoIssueOnPaid: false }],
    });
    const issue = jest.fn();
    const service = new FiscalAutoIssueService(
      { pool: { query } } as unknown as DatabaseService,
      { issue } as unknown as FiscalDocumentsService,
    );

    await service.issueAfterPaidOrder(auth, 'order-1');

    expect(issue).not.toHaveBeenCalled();
  });

  it('does not turn a committed payment into an error when fiscalization fails', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ enabled: true, autoIssueOnPaid: true }],
    });
    const issue = jest
      .fn()
      .mockRejectedValue(new Error('provider unavailable'));
    const service = new FiscalAutoIssueService(
      { pool: { query } } as unknown as DatabaseService,
      { issue } as unknown as FiscalDocumentsService,
    );

    await expect(
      service.issueAfterPaidOrder(auth, 'order-1'),
    ).resolves.toBeUndefined();
  });
});
