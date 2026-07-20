import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface FiscalExecutionInput {
  documentId: string;
  type: 'SALE' | 'VOID';
  provider: 'MOCK' | 'ACUBE_SMART_RECEIPTS';
  environment: 'SANDBOX' | 'PRODUCTION';
  payload: Record<string, unknown>;
}
export interface FiscalExecutionResult {
  externalId: string;
  externalStatus: string;
  documentNumber: string | null;
  documentDate: string | null;
  response: Record<string, unknown>;
}

function stringField(value: unknown, fallback = ''): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallback;
}

export class FiscalProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly code: string,
    readonly response?: Record<string, unknown>,
  ) {
    super(message);
  }
}

@Injectable()
export class FiscalProviderService {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  async execute(input: FiscalExecutionInput): Promise<FiscalExecutionResult> {
    if (input.provider === 'MOCK') return this.mock(input);
    return input.type === 'SALE'
      ? this.issueAcube(input)
      : this.voidAcube(input);
  }

  private mock(input: FiscalExecutionInput): FiscalExecutionResult {
    const digest = createHash('sha256')
      .update(`${input.type}:${input.documentId}`)
      .digest('hex');
    const externalId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const now = new Date().toISOString();
    return {
      externalId,
      externalStatus: input.type === 'SALE' ? 'ready' : 'voided',
      documentNumber:
        input.type === 'SALE'
          ? `MOCK-${digest.slice(0, 10).toUpperCase()}`
          : null,
      documentDate: now,
      response: {
        uuid: externalId,
        status: input.type === 'SALE' ? 'ready' : 'voided',
        document_number:
          input.type === 'SALE'
            ? `MOCK-${digest.slice(0, 10).toUpperCase()}`
            : null,
        document_date: now,
      },
    };
  }

  private async issueAcube(
    input: FiscalExecutionInput,
  ): Promise<FiscalExecutionResult> {
    const response = await this.acubeRequest(input.environment, '/receipts', {
      method: 'POST',
      body: JSON.stringify(input.payload),
    });
    return {
      externalId: stringField(response.uuid),
      externalStatus: stringField(response.status, 'new'),
      documentNumber: stringField(response.document_number) || null,
      documentDate: stringField(response.document_date) || null,
      response,
    };
  }

  private async voidAcube(
    input: FiscalExecutionInput,
  ): Promise<FiscalExecutionResult> {
    const externalId = stringField(input.payload.externalId);
    if (!externalId)
      throw new FiscalProviderError(
        'External receipt id missing.',
        false,
        'EXTERNAL_ID_MISSING',
      );
    const response = await this.acubeRequest(
      input.environment,
      `/receipts/${encodeURIComponent(externalId)}`,
      { method: 'DELETE' },
    );
    return {
      externalId,
      externalStatus: stringField(response.status, 'voided'),
      documentNumber: null,
      documentDate: null,
      response,
    };
  }

  private async acubeRequest(
    environment: 'SANDBOX' | 'PRODUCTION',
    path: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    const token = await this.getToken(environment);
    const base =
      process.env.ACUBE_API_BASE_URL ||
      (environment === 'SANDBOX'
        ? 'https://api-sandbox.acubeapi.com'
        : 'https://api.acubeapi.com');
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      throw new FiscalProviderError(
        error instanceof Error ? error.message : 'A-Cube network error',
        true,
        'ACUBE_NETWORK_ERROR',
      );
    }
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        payload = { raw: text };
      }
    }
    if (!response.ok) {
      const retryable =
        response.status >= 500 ||
        response.status === 408 ||
        response.status === 429;
      throw new FiscalProviderError(
        stringField(payload.detail) ||
          stringField(payload.message) ||
          `A-Cube HTTP ${response.status}`,
        retryable,
        `ACUBE_HTTP_${response.status}`,
        payload,
      );
    }
    return payload;
  }

  private async getToken(
    environment: 'SANDBOX' | 'PRODUCTION',
  ): Promise<string> {
    if (process.env.ACUBE_BEARER_TOKEN) return process.env.ACUBE_BEARER_TOKEN;
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const email = process.env.ACUBE_EMAIL;
    const password = process.env.ACUBE_PASSWORD;
    if (!email || !password)
      throw new FiscalProviderError(
        'A-Cube credentials not configured.',
        false,
        'ACUBE_CREDENTIALS_MISSING',
      );
    const base =
      process.env.ACUBE_AUTH_BASE_URL || 'https://common.api.acubeapi.com';
    let response: Response;
    try {
      response = await fetch(`${base}/login`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          environment: environment.toLowerCase(),
        }),
      });
    } catch (error) {
      throw new FiscalProviderError(
        error instanceof Error ? error.message : 'A-Cube auth network error',
        true,
        'ACUBE_AUTH_NETWORK_ERROR',
      );
    }
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok || !payload.token)
      throw new FiscalProviderError(
        stringField(payload.message, 'A-Cube authentication failed.'),
        response.status >= 500,
        `ACUBE_AUTH_${response.status}`,
        payload,
      );
    this.token = stringField(payload.token);
    this.tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
    return this.token;
  }
}
