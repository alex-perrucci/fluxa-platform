import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { QueryResultRow } from 'pg';
import { DatabaseService } from '@fluxa/database';
import type { AuthContext } from '../auth/auth.types';
import { assertOrganizationScope } from '../auth/tenant-scope';
import {
  overallStatus,
  statusFromJob,
  statusFromLastSeen,
  type OperationalHealthStatus,
} from './health-policy';

interface LocationRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
}
interface PrinterRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  status: string;
  lastSeenAt: Date | null;
  statusMessage: string | null;
}
interface JobRow extends QueryResultRow {
  id: string;
  status: string;
  printerName: string;
  documentType: string;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}
interface FiscalRow extends QueryResultRow {
  provider: string;
  environment: string;
  enabled: boolean;
  status: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: Date | null;
}
interface PaymentRow extends QueryResultRow {
  provider: string;
  status: string;
  failureCode: string | null;
  failureMessage: string | null;
  updatedAt: Date;
}
interface CountRow extends QueryResultRow {
  count: number;
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly release: { sha: string; version: string };

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService,
  ) {
    this.redis = new Redis({
      host: config.getOrThrow<string>('REDIS_HOST'),
      port: config.getOrThrow<number>('REDIS_PORT'),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      tls: config.get<boolean>('REDIS_TLS') ? {} : undefined,
      lazyConnect: true,
      connectTimeout: 5_000,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
    this.release = {
      sha: config.getOrThrow<string>('RELEASE_SHA'),
      version: config.getOrThrow<string>('RELEASE_VERSION'),
    };
  }

  live() {
    return {
      status: 'ok',
      service: 'fluxa-api',
      release: this.release,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async ready() {
    const startedAt = Date.now();
    const [databaseResult, redisResult] = await Promise.allSettled([
      this.database.ping(),
      this.redis.ping(),
    ]);
    const checks = {
      database:
        databaseResult.status === 'fulfilled' && databaseResult.value === true
          ? 'up'
          : 'down',
      redis:
        redisResult.status === 'fulfilled' && redisResult.value === 'PONG'
          ? 'up'
          : 'down',
    } as const;
    const response = {
      status:
        checks.database === 'up' && checks.redis === 'up' ? 'ok' : 'error',
      checks,
      release: this.release,
      durationMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
    if (response.status === 'error') {
      throw new ServiceUnavailableException(response);
    }
    return response;
  }

  async operational(auth: AuthContext, requestedLocationId?: string) {
    const organizationId = assertOrganizationScope(auth);
    const locationId =
      requestedLocationId ??
      (await this.currentDeviceLocation(auth.deviceId, organizationId));
    if (!locationId) {
      throw new BadRequestException({
        code: 'HEALTH_LOCATION_REQUIRED',
        message: 'Seleziona o assegna una sede per aprire la diagnostica.',
      });
    }

    const locationResult = await this.database.pool.query<LocationRow>(
      `SELECT id,code,name FROM locations
       WHERE id=$1 AND organization_id=$2 LIMIT 1`,
      [locationId, organizationId],
    );
    const location = locationResult.rows[0];
    if (!location) {
      throw new NotFoundException({
        code: 'HEALTH_LOCATION_NOT_FOUND',
        message: 'Sede non disponibile per questa organizzazione.',
      });
    }

    const startedAt = Date.now();
    const [printersResult, jobResult, fiscalResult, paymentResult] =
      await Promise.all([
        this.database.pool.query<PrinterRow>(
          `SELECT id,code,name,status,last_seen_at AS "lastSeenAt",
             status_message AS "statusMessage"
           FROM printers WHERE organization_id=$1 AND location_id=$2
           ORDER BY name,id`,
          [organizationId, locationId],
        ),
        this.database.pool.query<JobRow>(
          `SELECT pj.id,pj.status,p.name AS "printerName",
             pj.document_type AS "documentType",pj.attempts,
             pj.last_error AS "lastError",pj.created_at AS "createdAt",
             pj.updated_at AS "updatedAt"
           FROM print_jobs pj JOIN printers p ON p.id=pj.printer_id
           WHERE pj.organization_id=$1 AND pj.location_id=$2
           ORDER BY pj.created_at DESC,pj.id DESC LIMIT 1`,
          [organizationId, locationId],
        ),
        this.database.pool.query<FiscalRow>(
          `SELECT fp.provider,fp.environment,fp.enabled,
             fd.status,fd.error_code AS "errorCode",
             fd.error_message AS "errorMessage",fd.updated_at AS "updatedAt"
           FROM fiscal_profiles fp
           LEFT JOIN LATERAL (
             SELECT status,error_code,error_message,updated_at
             FROM fiscal_documents
             WHERE organization_id=fp.organization_id
               AND location_id=fp.location_id
             ORDER BY created_at DESC,id DESC LIMIT 1
           ) fd ON TRUE
           WHERE fp.organization_id=$1 AND fp.location_id=$2 LIMIT 1`,
          [organizationId, locationId],
        ),
        this.database.pool.query<PaymentRow>(
          `SELECT provider,status,failure_code AS "failureCode",
             failure_message AS "failureMessage",updated_at AS "updatedAt"
           FROM payment_transactions
           WHERE organization_id=$1 AND location_id=$2
             AND provider IN ('MANUAL_TERMINAL','EXTERNAL_TERMINAL')
           ORDER BY created_at DESC,id DESC LIMIT 1`,
          [organizationId, locationId],
        ),
      ]);

    const printers = printersResult.rows.map((printer) => ({
      ...printer,
      status: statusFromLastSeen(
        printer.status === 'ACTIVE',
        printer.lastSeenAt,
      ),
    }));
    const printerStatus = printers.length
      ? overallStatus(printers.map((printer) => printer.status))
      : 'NOT_CONFIGURED';
    const lastPrintJob = jobResult.rows[0] ?? null;
    const fiscal = fiscalResult.rows[0] ?? null;
    const terminal = paymentResult.rows[0] ?? null;
    const fiscalStatus: OperationalHealthStatus = !fiscal?.enabled
      ? 'NOT_CONFIGURED'
      : fiscal.status
        ? statusFromJob(fiscal.status)
        : 'UNKNOWN';
    const terminalStatus = terminal
      ? statusFromJob(terminal.status)
      : 'NOT_CONFIGURED';
    const statuses: OperationalHealthStatus[] = [
      printerStatus,
      fiscalStatus,
      terminalStatus,
    ];
    const suggestions = this.suggestions({
      printerStatus,
      lastPrintJobStatus: lastPrintJob?.status ?? null,
      fiscalStatus,
      terminalStatus,
    });

    return {
      generatedAt: new Date().toISOString(),
      release: this.release,
      location,
      overallStatus: overallStatus(statuses),
      api: { status: 'OK', latencyMs: Date.now() - startedAt },
      printers: {
        status: printerStatus,
        items: printers,
        lastJob: lastPrintJob
          ? {
              ...lastPrintJob,
              lastError: this.safeText(lastPrintJob.lastError),
            }
          : null,
      },
      fiscal: fiscal
        ? {
            provider: fiscal.provider,
            environment: fiscal.environment,
            status: fiscalStatus,
            lastDocumentStatus: fiscal.status,
            errorCode: fiscal.errorCode,
            errorMessage: this.safeText(fiscal.errorMessage),
            updatedAt: fiscal.updatedAt,
          }
        : { status: 'NOT_CONFIGURED' },
      paymentTerminal: terminal
        ? {
            provider: terminal.provider,
            status: terminalStatus,
            lastTransactionStatus: terminal.status,
            failureCode: terminal.failureCode,
            failureMessage: this.safeText(terminal.failureMessage),
            updatedAt: terminal.updatedAt,
          }
        : { status: 'NOT_CONFIGURED' },
      suggestions,
    };
  }

  async infrastructure() {
    const startedAt = Date.now();
    const [databaseResult, redisResult, fiscalBacklog, outboxBacklog] =
      await Promise.allSettled([
        this.database.ping(),
        this.redis.ping(),
        this.database.pool.query<CountRow>(
          `SELECT COUNT(*)::int AS count FROM fiscal_documents
           WHERE status IN ('QUEUED','PROCESSING','RETRY')`,
        ),
        this.database.pool.query<CountRow>(
          `SELECT COUNT(*)::int AS count FROM outbox_events
           WHERE status IN ('PENDING','PROCESSING','FAILED')`,
        ),
      ]);
    return {
      generatedAt: new Date().toISOString(),
      release: this.release,
      database: {
        status:
          databaseResult.status === 'fulfilled' && databaseResult.value
            ? 'OK'
            : 'DOWN',
      },
      redis: {
        status:
          redisResult.status === 'fulfilled' && redisResult.value === 'PONG'
            ? 'OK'
            : 'DOWN',
      },
      queues: {
        fiscalPending:
          fiscalBacklog.status === 'fulfilled'
            ? (fiscalBacklog.value.rows[0]?.count ?? 0)
            : null,
        outboxPending:
          outboxBacklog.status === 'fulfilled'
            ? (outboxBacklog.value.rows[0]?.count ?? 0)
            : null,
      },
      durationMs: Date.now() - startedAt,
    };
  }

  private async currentDeviceLocation(
    deviceId: string,
    organizationId: string,
  ): Promise<string | undefined> {
    const result = await this.database.pool.query<{ locationId: string }>(
      `SELECT location_id AS "locationId" FROM device_assignments
       WHERE device_id=$1 AND organization_id=$2 AND active=TRUE
       ORDER BY assigned_at DESC LIMIT 1`,
      [deviceId, organizationId],
    );
    return result.rows[0]?.locationId;
  }

  private suggestions(input: {
    printerStatus: OperationalHealthStatus;
    lastPrintJobStatus: string | null;
    fiscalStatus: OperationalHealthStatus;
    terminalStatus: OperationalHealthStatus;
  }): string[] {
    const suggestions: string[] = [];
    if (input.printerStatus === 'DOWN') {
      suggestions.push(
        'Verifica alimentazione, collegamento locale e agente della stampante.',
      );
    }
    if (['FAILED', 'CLAIMED'].includes(input.lastPrintJobStatus ?? '')) {
      suggestions.push(
        'Controlla l’ultimo job di stampa e riprova dal pannello amministrativo.',
      );
    }
    if (input.fiscalStatus === 'DOWN') {
      suggestions.push(
        'Controlla l’ultimo documento fiscale e le credenziali A-Cube nel Control Center.',
      );
    }
    if (input.terminalStatus === 'DOWN') {
      suggestions.push(
        'Verifica il terminale, la connettività e l’esito della transazione più recente.',
      );
    }
    if (!suggestions.length) {
      suggestions.push('Nessuna azione di ripristino richiesta.');
    }
    return suggestions;
  }

  private safeText(value: string | null): string | null {
    return value
      ? value
          .replace(
            /(token|secret|password|authorization)=[^\s]+/gi,
            '$1=[REDACTED]',
          )
          .slice(0, 500)
      : null;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status === 'end') return;
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
