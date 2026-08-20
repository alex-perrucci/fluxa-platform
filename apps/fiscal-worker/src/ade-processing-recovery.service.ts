import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';

const RECOVERY_INTERVAL_MS = 60_000;
const STALE_AFTER_MINUTES = 5;

interface StaleDocumentRow extends QueryResultRow {
  id: string;
  organizationId: string;
  attempts: number;
}

@Injectable()
export class AdeProcessingRecoveryService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AdeProcessingRecoveryService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly database: DatabaseService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recover().catch((error) => {
      this.logger.error(
        `ADE stale-processing recovery failed at startup: ${this.message(error)}`,
      );
    });

    this.timer = setInterval(() => {
      void this.recover().catch((error) => {
        this.logger.error(
          `ADE stale-processing recovery failed: ${this.message(error)}`,
        );
      });
    }, RECOVERY_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async recover(): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const stale = await client.query<StaleDocumentRow>(
        `
          SELECT
            id,
            organization_id AS "organizationId",
            attempts
          FROM fiscal_documents
          WHERE provider='ADE_WEB'::fiscal_provider
            AND status='PROCESSING'::fiscal_document_status
            AND updated_at < NOW() - ($1::text || ' minutes')::interval
          FOR UPDATE SKIP LOCKED
        `,
        [STALE_AFTER_MINUTES],
      );

      for (const document of stale.rows) {
        await this.markUnknown(client, document);
      }

      await client.query('COMMIT');
      if (stale.rows.length > 0) {
        this.logger.warn(
          `Marked ${stale.rows.length} stale ADE_WEB PROCESSING document(s) as UNKNOWN.`,
        );
      }
      return stale.rows.length;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
      this.running = false;
    }
  }

  private async markUnknown(
    client: PoolClient,
    document: StaleDocumentRow,
  ): Promise<void> {
    const errorCode = 'ADE_WEB_STALE_PROCESSING';
    const errorMessage =
      'Il fiscal-worker è stato interrotto durante un tentativo ADE_WEB; esito da riconciliare manualmente.';

    await client.query(
      `
        UPDATE fiscal_documents
        SET status='UNKNOWN'::fiscal_document_status,
            error_code=$2,
            error_message=$3,
            version=version+1,
            updated_at=NOW()
        WHERE id=$1
          AND status='PROCESSING'::fiscal_document_status
      `,
      [document.id, errorCode, errorMessage],
    );

    await client.query(
      `
        UPDATE fiscal_attempts
        SET outcome='UNKNOWN'::fiscal_attempt_outcome,
            error_code=$3,
            error_message=$4,
            finished_at=NOW()
        WHERE fiscal_document_id=$1
          AND attempt_no=$2
          AND finished_at IS NULL
      `,
      [document.id, document.attempts, errorCode, errorMessage],
    );

    const payload = JSON.stringify({
      documentId: document.id,
      errorCode,
      errorMessage,
      retryable: false,
      recovery: 'stale-processing',
    });

    await client.query(
      `
        INSERT INTO audit_events (
          id, organization_id, action, entity_type, entity_id, payload
        ) VALUES ($1,$2,'fiscal.document.unknown','fiscal_document',$3,$4::jsonb)
      `,
      [randomUUID(), document.organizationId, document.id, payload],
    );
    await client.query(
      `
        INSERT INTO outbox_events (
          id, topic, aggregate_type, aggregate_id, payload
        ) VALUES ($1,'fiscal.document.unknown','fiscal_document',$2,$3::jsonb)
      `,
      [randomUUID(), document.id, payload],
    );
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
