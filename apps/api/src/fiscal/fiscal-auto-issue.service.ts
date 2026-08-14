import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import { FiscalDocumentsService } from './fiscal-documents.service';

interface AutoIssueProfileRow extends QueryResultRow {
  enabled: boolean;
  autoIssueOnPaid: boolean;
}

@Injectable()
export class FiscalAutoIssueService {
  private readonly logger = new Logger(FiscalAutoIssueService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly fiscalDocuments: FiscalDocumentsService,
  ) {}

  async issueAfterPaidOrder(auth: AuthContext, orderId: string): Promise<void> {
    const organizationId = assertOrganizationScope(auth);
    const result = await this.database.pool.query<AutoIssueProfileRow>(
      `
        SELECT
          fp.enabled,
          fp.auto_issue_on_paid AS "autoIssueOnPaid"
        FROM orders o
        INNER JOIN fiscal_profiles fp
          ON fp.organization_id = o.organization_id
         AND fp.location_id = o.location_id
        WHERE o.id = $1
          AND o.organization_id = $2
          AND o.status = 'PAID'
        LIMIT 1
      `,
      [orderId, organizationId],
    );
    const profile = result.rows[0];

    if (!profile?.enabled || !profile.autoIssueOnPaid) return;

    try {
      await this.fiscalDocuments.issue(auth, orderId, {
        clientRequestId: randomUUID(),
      });
    } catch (error) {
      // The payment is already committed at this point. Never turn a successful
      // payment into a client-visible failure that could cause the operator to
      // retry the charge. The paid order remains available for manual fiscalization.
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Automatic fiscalization failed for order ${orderId}: ${message}`);
    }
  }
}
