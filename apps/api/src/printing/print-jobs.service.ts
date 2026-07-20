import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import type { CancelPrintJobDto } from './dto/cancel-print-job.dto';
import type { ClaimPrintJobDto } from './dto/claim-print-job.dto';
import type { CompletePrintJobDto } from './dto/complete-print-job.dto';
import type { FailPrintJobDto } from './dto/fail-print-job.dto';
import type { PrintJobListQueryDto } from './dto/print-job-list-query.dto';
import type { PrintJobMutationDto } from './dto/print-job-mutation.dto';
import { assertAdminPrintTransition, retryDelaySeconds } from './print-policy';
import { printRequestHash } from './printing-idempotency';
import { PrintingAccessService } from './printing-access.service';
import type { PrintDocumentType, PrintJobStatus } from './printing.constants';

interface CountRow extends QueryResultRow {
  count: number;
}

interface PrintJobRow extends QueryResultRow {
  id: string;
  organizationId: string;
  locationId: string;
  printerId: string;
  documentType: PrintDocumentType;
  sourceEntityType: string;
  sourceEntityId: string | null;
  dedupeKey: string;
  payload: Record<string, unknown>;
  renderedText: string;
  templateVersion: number;
  copies: number;
  status: PrintJobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  claimedByDeviceId: string | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  lastError: string | null;
  version: number;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AttemptRow extends QueryResultRow {
  id: string;
  attemptNo: number;
  leaseToken: string;
  outcome: 'CLAIMED' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

interface MutationRow extends QueryResultRow {
  requestHash: string;
  responseVersion: number;
}

interface ClaimRow extends PrintJobRow {
  printerCode: string;
  printerName: string;
  driver: string;
  paperWidthMm: number;
  charactersPerLine: number;
  supportsCut: boolean;
  supportsDrawer: boolean;
}

@Injectable()
export class PrintJobsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: PrintingAccessService,
  ) {}

  async list(auth: AuthContext, query: PrintJobListQueryDto) {
    const access = await this.access.assertLocation(auth, query.locationId);
    const offset = (query.page - 1) * query.pageSize;
    const values = [
      access.organizationId,
      query.locationId,
      query.printerId ?? null,
      query.status ?? null,
      query.pageSize,
      offset,
    ];
    const [items, count] = await Promise.all([
      this.database.pool.query<PrintJobRow>(
        `${this.jobSelect()}
         WHERE pj.organization_id=$1 AND pj.location_id=$2
           AND ($3::uuid IS NULL OR pj.printer_id=$3)
           AND ($4::text IS NULL OR pj.status::text=$4)
         ORDER BY pj.created_at DESC,pj.id DESC LIMIT $5 OFFSET $6`,
        values,
      ),
      this.database.pool.query<CountRow>(
        `SELECT COUNT(*)::int AS count FROM print_jobs pj
         WHERE pj.organization_id=$1 AND pj.location_id=$2
           AND ($3::uuid IS NULL OR pj.printer_id=$3)
           AND ($4::text IS NULL OR pj.status::text=$4)`,
        values.slice(0, 4),
      ),
    ]);
    return {
      page: query.page,
      pageSize: query.pageSize,
      total: count.rows[0]?.count ?? 0,
      items: items.rows,
    };
  }

  async get(auth: AuthContext, jobId: string) {
    const organizationId = assertOrganizationScope(auth);
    const job = await this.findJob(organizationId, jobId);
    if (!job) throw this.notFound();
    await this.access.assertLocation(auth, job.locationId);
    const attempts = await this.database.pool.query<AttemptRow>(
      `SELECT id,attempt_no AS "attemptNo",lease_token AS "leaseToken",
        outcome,error,started_at AS "startedAt",finished_at AS "finishedAt"
       FROM print_job_attempts WHERE organization_id=$1 AND print_job_id=$2
       ORDER BY attempt_no,id`,
      [organizationId, jobId],
    );
    return { ...job, attempts: attempts.rows };
  }

  async claim(auth: AuthContext, dto: ClaimPrintJobDto) {
    const printer = await this.access.assertAgentPrinter(auth, dto.printerId);
    const claimed = await this.withTransaction(async (client) => {
      const candidate = await client.query<ClaimRow>(
        `SELECT ${this.jobColumns('pj')},
          p.code AS "printerCode",p.name AS "printerName",p.driver,
          p.paper_width_mm AS "paperWidthMm",
          p.characters_per_line AS "charactersPerLine",
          p.supports_cut AS "supportsCut",p.supports_drawer AS "supportsDrawer"
         FROM print_jobs pj
         JOIN printers p ON p.id=pj.printer_id
         WHERE pj.organization_id=$1 AND pj.location_id=$2
           AND pj.printer_id=$3
           AND (
             (pj.status='QUEUED' AND pj.attempts < pj.max_attempts
               AND pj.next_attempt_at<=NOW()) OR
             (pj.status='CLAIMED' AND pj.lease_expires_at<NOW())
           )
         ORDER BY pj.priority DESC,pj.created_at,pj.id
         FOR UPDATE OF pj SKIP LOCKED LIMIT 1`,
        [printer.organizationId, printer.locationId, printer.id],
      );
      const job = candidate.rows[0];
      if (!job) return null;

      if (job.status === 'CLAIMED' && job.leaseToken) {
        await client.query(
          `UPDATE print_job_attempts SET outcome='EXPIRED',finished_at=NOW(),
            error=COALESCE(error,'Lease scaduto')
           WHERE print_job_id=$1 AND lease_token=$2 AND outcome='CLAIMED'`,
          [job.id, job.leaseToken],
        );
        if (job.attempts >= job.maxAttempts) {
          await client.query(
            `UPDATE print_jobs SET status='FAILED',claimed_by_device_id=NULL,
              lease_token=NULL,lease_expires_at=NULL,
              last_error='Numero massimo di tentativi raggiunto dopo lease scaduto',
              version=version+1,updated_at=NOW()
             WHERE id=$1 AND organization_id=$2`,
            [job.id, printer.organizationId],
          );
          return null;
        }
      }

      const leaseToken = randomUUID();
      const attemptNo = job.attempts + 1;
      const updated = await client.query<ClaimRow>(
        `UPDATE print_jobs SET status='CLAIMED',attempts=$4,
           claimed_by_device_id=$5,lease_token=$6,
           lease_expires_at=NOW()+make_interval(secs=>$7::int),
           last_error=NULL,version=version+1,updated_at=NOW()
         WHERE id=$1 AND organization_id=$2 AND printer_id=$3
         RETURNING ${this.jobColumns('print_jobs')},
           $8::text AS "printerCode",$9::text AS "printerName",
           $10::text AS driver,$11::int AS "paperWidthMm",
           $12::int AS "charactersPerLine",$13::boolean AS "supportsCut",
           $14::boolean AS "supportsDrawer"`,
        [
          job.id,
          printer.organizationId,
          printer.id,
          attemptNo,
          auth.deviceId,
          leaseToken,
          dto.leaseSeconds,
          printer.code,
          printer.name,
          printer.driver,
          printer.paperWidthMm,
          printer.charactersPerLine,
          printer.supportsCut,
          printer.supportsDrawer,
        ],
      );
      await client.query(
        `INSERT INTO print_job_attempts(
          id,organization_id,print_job_id,device_id,attempt_no,lease_token,outcome
         ) VALUES($1,$2,$3,$4,$5,$6,'CLAIMED')`,
        [
          randomUUID(),
          printer.organizationId,
          job.id,
          auth.deviceId,
          attemptNo,
          leaseToken,
        ],
      );
      await client.query(
        `UPDATE printers SET last_seen_at=NOW(),updated_at=NOW() WHERE id=$1`,
        [printer.id],
      );
      return updated.rows[0] ?? null;
    });
    return { job: claimed };
  }

  async complete(auth: AuthContext, jobId: string, dto: CompletePrintJobDto) {
    const organizationId = assertOrganizationScope(auth);
    const previous = await this.findAttempt(
      organizationId,
      jobId,
      auth.deviceId,
      dto.leaseToken,
    );
    if (previous?.outcome === 'COMPLETED') return this.get(auth, jobId);
    if (previous && previous.outcome !== 'CLAIMED') {
      throw new ConflictException({
        code: 'PRINT_LEASE_ALREADY_FINISHED',
        message: 'Il tentativo di stampa è già stato concluso.',
      });
    }

    await this.withTransaction(async (client) => {
      const job = await this.lockJob(client, organizationId, jobId);
      await this.assertLease(auth, job, dto.leaseToken);
      await client.query(
        `UPDATE print_jobs SET status='COMPLETED',completed_at=NOW(),
          lease_expires_at=NULL,last_error=NULL,version=version+1,updated_at=NOW()
         WHERE id=$1 AND organization_id=$2`,
        [jobId, organizationId],
      );
      await client.query(
        `UPDATE print_job_attempts SET outcome='COMPLETED',finished_at=NOW()
         WHERE print_job_id=$1 AND lease_token=$2 AND outcome='CLAIMED'`,
        [jobId, dto.leaseToken],
      );
      await this.audit(client, auth, jobId, 'print.job.completed', {});
      await this.outbox(client, jobId, 'print.job.completed', {
        printerId: job.printerId,
      });
    });
    return this.get(auth, jobId);
  }

  async fail(auth: AuthContext, jobId: string, dto: FailPrintJobDto) {
    const organizationId = assertOrganizationScope(auth);
    const previous = await this.findAttempt(
      organizationId,
      jobId,
      auth.deviceId,
      dto.leaseToken,
    );
    if (previous?.outcome === 'FAILED') return this.get(auth, jobId);
    if (previous && previous.outcome !== 'CLAIMED') {
      throw new ConflictException({
        code: 'PRINT_LEASE_ALREADY_FINISHED',
        message: 'Il tentativo di stampa è già stato concluso.',
      });
    }

    await this.withTransaction(async (client) => {
      const job = await this.lockJob(client, organizationId, jobId);
      await this.assertLease(auth, job, dto.leaseToken);
      const retryable = dto.retryable && job.attempts < job.maxAttempts;
      const nextStatus: PrintJobStatus = retryable ? 'QUEUED' : 'FAILED';
      const delay = retryable ? retryDelaySeconds(job.attempts) : 0;
      await client.query(
        `UPDATE print_jobs SET status=$3::print_job_status,
          next_attempt_at=CASE WHEN $3::print_job_status='QUEUED'::print_job_status THEN
            NOW()+make_interval(secs=>$4::int) ELSE next_attempt_at END,
          claimed_by_device_id=NULL,lease_token=NULL,lease_expires_at=NULL,
          last_error=$5,version=version+1,updated_at=NOW()
         WHERE id=$1 AND organization_id=$2`,
        [jobId, organizationId, nextStatus, delay, dto.error.trim()],
      );
      await client.query(
        `UPDATE print_job_attempts SET outcome='FAILED',finished_at=NOW(),error=$3
         WHERE print_job_id=$1 AND lease_token=$2 AND outcome='CLAIMED'`,
        [jobId, dto.leaseToken, dto.error.trim()],
      );
      await this.audit(client, auth, jobId, 'print.job.failed', {
        retryable,
        nextStatus,
        delaySeconds: delay,
      });
      await this.outbox(client, jobId, 'print.job.failed', {
        printerId: job.printerId,
        retryable,
        nextStatus,
      });
    });
    return this.get(auth, jobId);
  }

  async retry(auth: AuthContext, jobId: string, dto: PrintJobMutationDto) {
    await this.adminMutation(auth, jobId, 'RETRY', dto, null);
    return this.get(auth, jobId);
  }

  async cancel(auth: AuthContext, jobId: string, dto: CancelPrintJobDto) {
    await this.adminMutation(auth, jobId, 'CANCEL', dto, dto.reason.trim());
    return this.get(auth, jobId);
  }

  private async adminMutation(
    auth: AuthContext,
    jobId: string,
    action: 'RETRY' | 'CANCEL',
    dto: PrintJobMutationDto,
    reason: string | null,
  ): Promise<void> {
    const organizationId = assertOrganizationScope(auth);
    const existingJob = await this.findJob(organizationId, jobId);
    if (!existingJob) throw this.notFound();
    await this.access.assertLocation(auth, existingJob.locationId);
    const requestHash = printRequestHash({
      action,
      expectedVersion: dto.expectedVersion,
      reason,
    });

    await this.withTransaction(async (client) => {
      const job = await this.lockJob(client, organizationId, jobId);
      const existing = await client.query<MutationRow>(
        `SELECT request_hash AS "requestHash",response_version AS "responseVersion"
         FROM print_job_mutations WHERE print_job_id=$1 AND device_id=$2
           AND mutation_id=$3 LIMIT 1`,
        [jobId, auth.deviceId, dto.mutationId],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].requestHash !== requestHash) {
          throw new ConflictException({
            code: 'PRINT_MUTATION_ID_REUSED',
            message: 'Il mutationId è già stato usato con dati differenti.',
          });
        }
        return;
      }
      if (job.version !== dto.expectedVersion) {
        throw new ConflictException({
          code: 'PRINT_JOB_VERSION_CONFLICT',
          message: 'Il lavoro di stampa è stato modificato da un altro client.',
          currentVersion: job.version,
        });
      }
      assertAdminPrintTransition(job.status, action);
      const updated = await client.query<{ version: number } & QueryResultRow>(
        action === 'RETRY'
          ? `UPDATE print_jobs SET status='QUEUED',attempts=0,
              next_attempt_at=NOW(),claimed_by_device_id=NULL,lease_token=NULL,
              lease_expires_at=NULL,last_error=NULL,cancelled_at=NULL,
              cancel_reason=NULL,version=version+1,updated_at=NOW()
             WHERE id=$1 AND organization_id=$2 RETURNING version`
          : `UPDATE print_jobs SET status='CANCELLED',cancelled_at=NOW(),
              cancel_reason=$3,version=version+1,updated_at=NOW()
             WHERE id=$1 AND organization_id=$2 RETURNING version`,
        action === 'RETRY'
          ? [jobId, organizationId]
          : [jobId, organizationId, reason],
      );
      const responseVersion = updated.rows[0]?.version;
      if (!responseVersion)
        throw new Error('Print mutation did not return version.');
      await client.query(
        `INSERT INTO print_job_mutations(
          id,organization_id,print_job_id,device_id,mutation_id,operation,
          request_hash,response_version
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          randomUUID(),
          organizationId,
          jobId,
          auth.deviceId,
          dto.mutationId,
          action,
          requestHash,
          responseVersion,
        ],
      );
      await this.audit(
        client,
        auth,
        jobId,
        `print.job.${action.toLowerCase()}`,
        {
          reason,
        },
      );
      await this.outbox(client, jobId, `print.job.${action.toLowerCase()}`, {
        printerId: job.printerId,
        reason,
      });
    });
  }

  private async assertLease(
    auth: AuthContext,
    job: PrintJobRow,
    leaseToken: string,
  ): Promise<void> {
    await this.access.assertAgentPrinter(auth, job.printerId);
    if (
      job.status !== 'CLAIMED' ||
      job.claimedByDeviceId !== auth.deviceId ||
      job.leaseToken !== leaseToken
    ) {
      throw new ConflictException({
        code: 'PRINT_LEASE_INVALID',
        message: 'Lease del lavoro di stampa non valido.',
      });
    }
    if (!job.leaseExpiresAt || job.leaseExpiresAt <= new Date()) {
      throw new ConflictException({
        code: 'PRINT_LEASE_EXPIRED',
        message: 'Il lease del lavoro di stampa è scaduto.',
      });
    }
  }

  private async findJob(
    organizationId: string,
    jobId: string,
  ): Promise<PrintJobRow | null> {
    const result = await this.database.pool.query<PrintJobRow>(
      `${this.jobSelect()} WHERE pj.id=$1 AND pj.organization_id=$2 LIMIT 1`,
      [jobId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async lockJob(
    client: PoolClient,
    organizationId: string,
    jobId: string,
  ): Promise<PrintJobRow> {
    const result = await client.query<PrintJobRow>(
      `${this.jobSelect()} WHERE pj.id=$1 AND pj.organization_id=$2
       FOR UPDATE OF pj`,
      [jobId, organizationId],
    );
    const job = result.rows[0];
    if (!job) throw this.notFound();
    return job;
  }

  private async findAttempt(
    organizationId: string,
    jobId: string,
    deviceId: string,
    leaseToken: string,
  ): Promise<AttemptRow | null> {
    const result = await this.database.pool.query<AttemptRow>(
      `SELECT id,attempt_no AS "attemptNo",lease_token AS "leaseToken",
        outcome,error,started_at AS "startedAt",finished_at AS "finishedAt"
       FROM print_job_attempts WHERE organization_id=$1 AND print_job_id=$2
         AND device_id=$3 AND lease_token=$4 LIMIT 1`,
      [organizationId, jobId, deviceId, leaseToken],
    );
    return result.rows[0] ?? null;
  }

  private jobColumns(alias: string): string {
    return `${alias}.id,${alias}.organization_id AS "organizationId",
      ${alias}.location_id AS "locationId",${alias}.printer_id AS "printerId",
      ${alias}.document_type AS "documentType",
      ${alias}.source_entity_type AS "sourceEntityType",
      ${alias}.source_entity_id AS "sourceEntityId",
      ${alias}.dedupe_key AS "dedupeKey",${alias}.payload,
      ${alias}.rendered_text AS "renderedText",
      ${alias}.template_version AS "templateVersion",${alias}.copies,
      ${alias}.status,${alias}.priority,${alias}.attempts,
      ${alias}.max_attempts AS "maxAttempts",
      ${alias}.next_attempt_at AS "nextAttemptAt",
      ${alias}.claimed_by_device_id AS "claimedByDeviceId",
      ${alias}.lease_token AS "leaseToken",
      ${alias}.lease_expires_at AS "leaseExpiresAt",
      ${alias}.last_error AS "lastError",${alias}.version,
      ${alias}.completed_at AS "completedAt",
      ${alias}.cancelled_at AS "cancelledAt",
      ${alias}.cancel_reason AS "cancelReason",
      ${alias}.created_at AS "createdAt",${alias}.updated_at AS "updatedAt"`;
  }

  private jobSelect(alias = 'pj'): string {
    return `SELECT ${this.jobColumns(alias)} FROM print_jobs ${alias}`;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'PRINT_JOB_NOT_FOUND',
      message: 'Lavoro di stampa non trovato.',
    });
  }

  private async audit(
    client: PoolClient,
    auth: AuthContext,
    jobId: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_events(
        id,organization_id,actor_user_id,action,entity_type,entity_id,payload
       ) VALUES($1,$2,$3,$4,'print_job',$5,$6::jsonb)`,
      [
        randomUUID(),
        assertOrganizationScope(auth),
        auth.userId,
        action,
        jobId,
        JSON.stringify(payload),
      ],
    );
  }

  private async outbox(
    client: PoolClient,
    jobId: string,
    topic: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO outbox_events(id,topic,aggregate_type,aggregate_id,payload)
       VALUES($1,$2,'print_job',$3,$4::jsonb)`,
      [randomUUID(), topic, jobId, JSON.stringify(payload)],
    );
  }

  private async withTransaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
