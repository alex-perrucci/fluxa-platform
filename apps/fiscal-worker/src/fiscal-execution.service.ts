import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import {
  FiscalProviderError,
  FiscalProviderService,
} from './fiscal-provider.service';

interface DocumentRow extends QueryResultRow {
  id: string;
  organizationId: string;
  type: 'SALE' | 'VOID';
  status: string;
  provider: 'MOCK' | 'ACUBE_SMART_RECEIPTS';
  environment: 'SANDBOX' | 'PRODUCTION';
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

@Injectable()
export class FiscalExecutionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly provider: FiscalProviderService,
  ) {}

  async execute(documentId: string): Promise<Record<string, unknown>> {
    const document = await this.claim(documentId);
    if (!document) return { skipped: true, documentId };
    try {
      const result = await this.provider.execute({
        documentId,
        type: document.type,
        provider: document.provider,
        environment: document.environment,
        payload: document.payload,
      });
      await this.succeed(document, result);
      return {
        documentId,
        status: document.type === 'SALE' ? 'ISSUED' : 'VOIDED',
        externalId: result.externalId,
      };
    } catch (error) {
      const providerError =
        error instanceof FiscalProviderError
          ? error
          : new FiscalProviderError(
              error instanceof Error ? error.message : 'Unknown fiscal error',
              true,
              'FISCAL_UNKNOWN_ERROR',
            );
      const retryable =
        providerError.retryable && document.attempts < document.maxAttempts;
      await this.fail(document, providerError, retryable);
      if (retryable) throw providerError;
      return { documentId, status: 'REJECTED', errorCode: providerError.code };
    }
  }

  private async claim(documentId: string): Promise<DocumentRow | null> {
    return this.withTransaction(async (client) => {
      const result = await client.query<DocumentRow>(
        `SELECT id, organization_id AS "organizationId", type, status, provider, environment, payload, attempts, max_attempts AS "maxAttempts" FROM fiscal_documents WHERE id=$1 FOR UPDATE`,
        [documentId],
      );
      const document = result.rows[0];
      if (!document || !['QUEUED', 'RETRY'].includes(document.status))
        return null;
      const nextAttempt = document.attempts + 1;
      await client.query(
        `UPDATE fiscal_documents SET status='PROCESSING', attempts=$2, updated_at=NOW() WHERE id=$1`,
        [documentId, nextAttempt],
      );
      await client.query(
        `INSERT INTO fiscal_attempts (id, organization_id, fiscal_document_id, attempt_no, outcome, started_at) VALUES ($1,$2,$3,$4,'STARTED',NOW())`,
        [randomUUID(), document.organizationId, documentId, nextAttempt],
      );
      return { ...document, attempts: nextAttempt };
    });
  }

  private async succeed(
    document: DocumentRow,
    result: {
      externalId: string;
      externalStatus: string;
      documentNumber: string | null;
      documentDate: string | null;
      response: Record<string, unknown>;
    },
  ) {
    await this.withTransaction(async (client) => {
      const status = document.type === 'SALE' ? 'ISSUED' : 'VOIDED';
      await client.query(
        `UPDATE fiscal_documents SET status=$2::fiscal_document_status, external_id=$3, external_status=$4, document_number=$5, document_date=$6, provider_response=$7::jsonb, error_code=NULL, error_message=NULL, issued_at=CASE WHEN $2::fiscal_document_status='ISSUED'::fiscal_document_status THEN NOW() ELSE issued_at END, voided_at=CASE WHEN $2::fiscal_document_status='VOIDED'::fiscal_document_status THEN NOW() ELSE voided_at END, version=version+1, updated_at=NOW() WHERE id=$1`,
        [
          document.id,
          status,
          result.externalId,
          result.externalStatus,
          result.documentNumber,
          result.documentDate,
          JSON.stringify(result.response),
        ],
      );
      await client.query(
        `UPDATE fiscal_attempts SET outcome='SUCCEEDED', finished_at=NOW() WHERE fiscal_document_id=$1 AND attempt_no=$2`,
        [document.id, document.attempts],
      );
      await this.events(
        client,
        document,
        `fiscal.document.${status.toLowerCase()}`,
        {
          externalId: result.externalId,
          externalStatus: result.externalStatus,
          documentNumber: result.documentNumber,
        },
      );
      if (document.type === 'VOID')
        await client.query(
          `UPDATE fiscal_documents SET external_status='voided', updated_at=NOW() WHERE id=(SELECT parent_document_id FROM fiscal_documents WHERE id=$1)`,
          [document.id],
        );
    });
  }

  private async fail(
    document: DocumentRow,
    error: FiscalProviderError,
    retryable: boolean,
  ) {
    await this.withTransaction(async (client) => {
      const status = retryable ? 'RETRY' : 'REJECTED';
      const delaySeconds = Math.min(
        300,
        5 * 2 ** Math.min(document.attempts - 1, 6),
      );
      await client.query(
        `UPDATE fiscal_documents SET status=$2::fiscal_document_status, error_code=$3, error_message=$4, provider_response=$5::jsonb, next_attempt_at=NOW()+($6::text || ' seconds')::interval, version=version+1, updated_at=NOW() WHERE id=$1`,
        [
          document.id,
          status,
          error.code,
          error.message.slice(0, 1000),
          JSON.stringify(error.response ?? {}),
          delaySeconds,
        ],
      );
      await client.query(
        `UPDATE fiscal_attempts SET outcome=$3::fiscal_attempt_outcome, error_code=$4, error_message=$5, response=$6::jsonb, finished_at=NOW() WHERE fiscal_document_id=$1 AND attempt_no=$2`,
        [
          document.id,
          document.attempts,
          retryable ? 'RETRY' : 'REJECTED',
          error.code,
          error.message.slice(0, 1000),
          JSON.stringify(error.response ?? {}),
        ],
      );
      await this.events(
        client,
        document,
        retryable ? 'fiscal.document.retry' : 'fiscal.document.rejected',
        { errorCode: error.code, errorMessage: error.message },
      );
    });
  }

  private events(
    client: PoolClient,
    document: DocumentRow,
    topic: string,
    payload: Record<string, unknown>,
  ) {
    return Promise.all([
      client.query(
        `INSERT INTO audit_events (id, organization_id, action, entity_type, entity_id, payload) VALUES ($1,$2,$3,'fiscal_document',$4,$5::jsonb)`,
        [
          randomUUID(),
          document.organizationId,
          topic,
          document.id,
          JSON.stringify(payload),
        ],
      ),
      client.query(
        `INSERT INTO outbox_events (id, topic, aggregate_type, aggregate_id, payload) VALUES ($1,$2,'fiscal_document',$3,$4::jsonb)`,
        [
          randomUUID(),
          topic,
          document.id,
          JSON.stringify({
            organizationId: document.organizationId,
            documentId: document.id,
            ...payload,
          }),
        ],
      ),
    ]);
  }
  private async withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
