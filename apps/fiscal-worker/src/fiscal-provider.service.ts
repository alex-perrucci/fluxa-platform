import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface FiscalExecutionInput {
  documentId: string;
  type: 'SALE' | 'VOID';
  provider: 'MOCK' | 'ACUBE_SMART_RECEIPTS' | 'OPENAPI_SMART_RECEIPTS';
  environment: 'SANDBOX' | 'PRODUCTION';
  payload: Record<string, unknown>;
  externalId?: string | null;
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

function recordField(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class FiscalProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly code: string,
    readonly response?: Record<string, unknown>,
    readonly externalId?: string,
    readonly externalStatus?: string,
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
    if (input.provider === 'OPENAPI_SMART_RECEIPTS') {
      return input.type === 'SALE'
        ? this.issueOpenApi(input)
        : this.voidOpenApi(input);
    }
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

  private async issueOpenApi(
    input: FiscalExecutionInput,
  ): Promise<FiscalExecutionResult> {
    const response = input.externalId
      ? await this.openApiRequest(
          input.environment,
          `/IT-receipts/${encodeURIComponent(input.externalId)}`,
          { method: 'GET' },
        )
      : await this.openApiRequest(input.environment, '/IT-receipts', {
          method: 'POST',
          body: JSON.stringify(this.openApiSalePayload(input.payload)),
        });
    return this.openApiResult(input, response, input.externalId ?? undefined);
  }

  private async voidOpenApi(
    input: FiscalExecutionInput,
  ): Promise<FiscalExecutionResult> {
    if (input.externalId) {
      const response = await this.openApiRequest(
        input.environment,
        `/IT-receipts/${encodeURIComponent(input.externalId)}`,
        { method: 'GET' },
      );
      return this.openApiResult(input, response, input.externalId);
    }

    const parentExternalId = stringField(input.payload.externalId);
    if (!parentExternalId) {
      throw new FiscalProviderError(
        'External receipt id missing.',
        false,
        'EXTERNAL_ID_MISSING',
      );
    }
    const response = await this.openApiRequest(
      input.environment,
      `/IT-receipts/${encodeURIComponent(parentExternalId)}`,
      { method: 'DELETE' },
    );
    return this.openApiResult(input, response);
  }

  private openApiSalePayload(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const fiscalId = stringField(payload.fiscal_id).trim();
    if (!/^\d{11}$/.test(fiscalId)) {
      throw new FiscalProviderError(
        'OpenAPI fiscal_id must be an 11-digit VAT number.',
        false,
        'OPENAPI_PAYLOAD_INVALID',
      );
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new FiscalProviderError(
        'OpenAPI Smart Receipt requires at least one item.',
        false,
        'OPENAPI_PAYLOAD_INVALID',
      );
    }

    const items = payload.items.map((rawItem, index) => {
      const item = recordField(rawItem);
      const description = stringField(item.description).trim();
      const vatRateCode = stringField(item.vat_rate_code).trim();
      if (!description || !vatRateCode) {
        throw new FiscalProviderError(
          `Invalid OpenAPI item at index ${index}.`,
          false,
          'OPENAPI_PAYLOAD_INVALID',
        );
      }
      const mapped: Record<string, unknown> = {
        quantity: this.openApiNumber(item.quantity, `items[${index}].quantity`),
        description,
        unit_price: this.openApiNumber(
          item.unit_price,
          `items[${index}].unit_price`,
        ),
        vat_rate_code: vatRateCode,
      };
      if (item.discount !== undefined) {
        const discount = this.openApiNumber(
          item.discount,
          `items[${index}].discount`,
        );
        if (discount > 0) mapped.discount = discount;
      }
      return mapped;
    });

    const result: Record<string, unknown> = {
      fiscal_id: fiscalId,
      items,
      cash_payment_amount: this.openApiNumber(
        payload.cash_payment_amount ?? 0,
        'cash_payment_amount',
      ),
      electronic_payment_amount: this.openApiNumber(
        payload.electronic_payment_amount ?? 0,
        'electronic_payment_amount',
      ),
    };
    const lotteryCode = stringField(payload.lottery_code).trim();
    if (lotteryCode) result.lottery_code = lotteryCode.toUpperCase();
    return result;
  }

  private openApiNumber(value: unknown, field: string): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      throw new FiscalProviderError(
        `Invalid OpenAPI field: ${field}.`,
        false,
        'OPENAPI_PAYLOAD_INVALID',
      );
    }
    return parsed;
  }

  private openApiResult(
    input: FiscalExecutionInput,
    response: Record<string, unknown>,
    fallbackExternalId?: string,
  ): FiscalExecutionResult {
    const data = recordField(response.data);
    const externalId = stringField(data.id, fallbackExternalId ?? '');
    const externalStatus = stringField(data.status, 'new').toLowerCase();
    const message =
      stringField(data.error_message) ||
      stringField(response.message) ||
      `OpenAPI receipt status ${externalStatus}`;

    if (!externalId) {
      throw new FiscalProviderError(
        'OpenAPI response did not contain a receipt id; automatic resubmission was stopped to avoid duplicates.',
        false,
        'OPENAPI_RECEIPT_ID_MISSING',
        response,
      );
    }

    if (externalStatus === 'failed') {
      throw new FiscalProviderError(
        message,
        false,
        stringField(data.error_code, 'OPENAPI_RECEIPT_FAILED'),
        response,
        externalId,
        externalStatus,
      );
    }

    const terminal =
      externalStatus === 'ready' ||
      (input.type === 'VOID' && externalStatus === 'voided');
    if (terminal) {
      return {
        externalId,
        externalStatus,
        documentNumber: stringField(data.document_number) || null,
        documentDate: stringField(data.document_date) || null,
        response,
      };
    }

    if (['new', 'retry', 'submitted', 'waiting'].includes(externalStatus)) {
      throw new FiscalProviderError(
        message,
        true,
        'OPENAPI_RECEIPT_PENDING',
        response,
        externalId,
        externalStatus,
      );
    }

    throw new FiscalProviderError(
      `Unsupported OpenAPI receipt status: ${externalStatus}.`,
      true,
      'OPENAPI_STATUS_UNSUPPORTED',
      response,
      externalId,
      externalStatus,
    );
  }

  private async openApiRequest(
    environment: 'SANDBOX' | 'PRODUCTION',
    path: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    const token = process.env.OPENAPI_BEARER_TOKEN?.trim();
    if (!token) {
      throw new FiscalProviderError(
        'OpenAPI bearer token not configured.',
        false,
        'OPENAPI_CREDENTIALS_MISSING',
      );
    }
    const configuredBase = process.env.OPENAPI_API_BASE_URL?.trim();
    const base = (
      configuredBase ||
      (environment === 'SANDBOX'
        ? 'https://test.invoice.openapi.com'
        : 'https://invoice.openapi.com')
    ).replace(/\/+$/, '');

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
        error instanceof Error ? error.message : 'OpenAPI network error',
        true,
        'OPENAPI_NETWORK_ERROR',
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
    const data = recordField(payload.data);
    if (!response.ok || payload.success === false) {
      const retryable =
        response.status >= 500 ||
        response.status === 408 ||
        response.status === 429;
      throw new FiscalProviderError(
        stringField(data.error_message) ||
          stringField(payload.message) ||
          `OpenAPI HTTP ${response.status}`,
        retryable,
        stringField(data.error_code) || `OPENAPI_HTTP_${response.status}`,
        payload,
      );
    }
    return payload;
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
