import { Injectable } from '@nestjs/common';
import { FiscalProviderError } from '../fiscal-provider.service';
import {
  FiscalProviderSafetyError,
  type FiscalProviderAdapter,
  type FiscalProviderExecutionInput,
  type FiscalProviderExecutionResult,
  type FiscalProviderName,
} from './fiscal-provider';

const DEFAULT_ADE_WORKER_BASE_URL = 'http://ade-fiscal-worker:3010';
const DEFAULT_ADE_PROVIDER_TIMEOUT_MS = 240_000;
const ALLOWED_VAT_RATES = new Set([4, 5, 10, 22]);

interface AdeWorkerResponse {
  status?: string;
  code?: string;
  message?: string;
  operationId?: string;
  transport?: string;
  finalUrl?: string;
  confirmationEvidence?: string;
  externalId?: string;
  documentNumber?: string;
  documentDate?: string;
  submitAttempted?: boolean;
  retrySafe?: boolean;
}

function recordField(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function optionalStringField(value: unknown): string | undefined {
  const normalized = stringField(value).trim();
  return normalized || undefined;
}

function parseDecimalCents(value: unknown, field: string): number {
  const normalized = stringField(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new FiscalProviderError(
      `ADE_WEB invalid money field: ${field}.`,
      false,
      'ADE_WEB_PAYLOAD_INVALID',
    );
  }

  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new FiscalProviderError(
      `ADE_WEB invalid money field: ${field}.`,
      false,
      'ADE_WEB_PAYLOAD_INVALID',
    );
  }
  return cents;
}

function timeoutMs(): number {
  const configured = Number(process.env.ADE_PROVIDER_TIMEOUT_MS);
  return Number.isInteger(configured) &&
    configured >= 30_000 &&
    configured <= 600_000
    ? configured
    : DEFAULT_ADE_PROVIDER_TIMEOUT_MS;
}

function sanitizedWorkerResponse(raw: unknown): AdeWorkerResponse {
  const value = recordField(raw);
  return {
    status: optionalStringField(value.status),
    code: optionalStringField(value.code),
    message: optionalStringField(value.message),
    operationId: optionalStringField(value.operationId),
    transport: optionalStringField(value.transport),
    finalUrl: optionalStringField(value.finalUrl),
    confirmationEvidence: optionalStringField(value.confirmationEvidence),
    externalId: optionalStringField(value.externalId),
    documentNumber: optionalStringField(value.documentNumber),
    documentDate: optionalStringField(value.documentDate),
    submitAttempted:
      typeof value.submitAttempted === 'boolean'
        ? value.submitAttempted
        : undefined,
    retrySafe:
      typeof value.retrySafe === 'boolean' ? value.retrySafe : undefined,
  };
}

@Injectable()
export class AdeWebFiscalProvider implements FiscalProviderAdapter {
  supports(provider: FiscalProviderName): boolean {
    return provider === 'ADE_WEB';
  }

  async execute(
    input: FiscalProviderExecutionInput,
  ): Promise<FiscalProviderExecutionResult> {
    if (input.type !== 'SALE') {
      throw new FiscalProviderError(
        'ADE_WEB void flow is not implemented yet.',
        false,
        'ADE_WEB_VOID_NOT_IMPLEMENTED',
      );
    }
    if (input.environment !== 'PRODUCTION') {
      throw new FiscalProviderError(
        'ADE_WEB uses the real AdE portal and supports only PRODUCTION.',
        false,
        'ADE_WEB_ENVIRONMENT_UNSUPPORTED',
      );
    }

    const token = process.env.ADE_WORKER_INTERNAL_TOKEN?.trim() ?? '';
    if (token.length < 32) {
      throw new FiscalProviderError(
        'ADE worker internal token is not configured.',
        false,
        'ADE_WEB_INTERNAL_TOKEN_MISSING',
      );
    }

    const body = this.workerPayload(input);
    const baseUrl = this.workerBaseUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/internal/document/submit`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-fluxa-internal-token': token,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      // A transport failure is intrinsically ambiguous: the remote worker may
      // have received the request and crossed either irreversible boundary.
      // Never convert this into a queue retry.
      throw new FiscalProviderSafetyError(
        error instanceof Error
          ? `ADE worker transport result unknown: ${error.message}`
          : 'ADE worker transport result unknown.',
        'ADE_WEB_TRANSPORT_UNKNOWN',
        'UNKNOWN',
      );
    } finally {
      clearTimeout(timer);
    }

    let payload: unknown = {};
    try {
      const text = await response.text();
      payload = text ? (JSON.parse(text) as unknown) : {};
    } catch {
      throw new FiscalProviderSafetyError(
        'ADE worker returned an unreadable result; submit outcome is unknown.',
        'ADE_WEB_RESPONSE_UNKNOWN',
        'UNKNOWN',
      );
    }

    const worker = sanitizedWorkerResponse(payload);
    if (
      response.ok &&
      worker.status === 'DOCUMENT_SUBMITTED_CONFIRMED' &&
      worker.submitAttempted === true &&
      worker.operationId === input.documentId
    ) {
      const now = new Date().toISOString();
      const realExternalId = worker.externalId;
      const externalId = realExternalId ?? `ADE-WEB:${input.documentId}`;
      return {
        externalId,
        externalStatus: 'issued',
        documentNumber: worker.documentNumber ?? null,
        documentDate: worker.documentDate ?? now,
        response: {
          provider: 'ADE_WEB',
          operationId: input.documentId,
          transport: worker.transport ?? 'BROWSER',
          externalIdKind: realExternalId ? 'ade-idtrx' : 'fluxa-correlation',
          confirmationEvidence: worker.confirmationEvidence ?? null,
          finalUrl: worker.finalUrl ?? null,
          documentNumber: worker.documentNumber ?? null,
          documentDate: worker.documentDate ?? null,
          submitAttempted: true,
        },
      };
    }

    const code = worker.code || `ADE_WEB_HTTP_${response.status}`;
    const message = worker.message || `ADE worker HTTP ${response.status}`;
    if (
      worker.submitAttempted === true ||
      code === 'ADE_DOCUMENT_SUBMIT_UNKNOWN' ||
      code === 'ADE_DOCUMENT_SUBMIT_DUPLICATE_OPERATION'
    ) {
      throw new FiscalProviderSafetyError(
        message,
        code,
        'UNKNOWN',
        recordField(worker),
        worker.externalId ?? `ADE-WEB:${input.documentId}`,
        'unknown',
      );
    }

    if (
      code === 'ADE_SESSION_REQUIRED' ||
      code === 'ADE_SESSION_INVALID' ||
      code.startsWith('ADE_CIE_') ||
      code.startsWith('ADE_AUTH_')
    ) {
      throw new FiscalProviderSafetyError(
        message,
        code,
        'AUTH_REQUIRED',
        recordField(worker),
      );
    }

    throw new FiscalProviderError(message, false, code, recordField(worker));
  }

  private workerPayload(input: FiscalProviderExecutionInput) {
    const payload = input.payload;
    const fiscalId = stringField(payload.fiscal_id).trim();
    if (!/^\d{11}$/.test(fiscalId)) {
      throw new FiscalProviderError(
        'ADE_WEB fiscal profile must contain a valid 11-digit fiscal ID.',
        false,
        'ADE_WEB_FISCAL_ID_INVALID',
      );
    }

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new FiscalProviderError(
        'ADE_WEB requires at least one item.',
        false,
        'ADE_WEB_PAYLOAD_INVALID',
      );
    }

    const items = payload.items.map((rawItem, index) => {
      const item = recordField(rawItem);
      const description = stringField(item.description).trim();
      const quantity = Number(item.quantity);
      const vatRate = Number(item.vat_rate_code);
      const discountCents =
        item.discount === undefined
          ? 0
          : parseDecimalCents(item.discount, `items[${index}].discount`);

      if (
        !description ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 999
      ) {
        throw new FiscalProviderError(
          `ADE_WEB unsupported quantity/description at item ${index}.`,
          false,
          'ADE_WEB_PAYLOAD_INVALID',
        );
      }
      if (!ALLOWED_VAT_RATES.has(vatRate)) {
        throw new FiscalProviderError(
          `ADE_WEB unsupported VAT rate at item ${index}.`,
          false,
          'ADE_WEB_PAYLOAD_INVALID',
        );
      }
      if (discountCents > 0) {
        throw new FiscalProviderError(
          'ADE_WEB line discounts are not enabled yet; refusing to alter the fiscal total.',
          false,
          'ADE_WEB_DISCOUNT_NOT_SUPPORTED',
        );
      }

      return {
        description,
        quantity,
        grossUnitPriceCents: parseDecimalCents(
          item.unit_price,
          `items[${index}].unit_price`,
        ),
        vatRate,
      };
    });

    const cashCents = parseDecimalCents(
      payload.cash_payment_amount ?? 0,
      'cash_payment_amount',
    );
    const electronicCents = parseDecimalCents(
      payload.electronic_payment_amount ?? 0,
      'electronic_payment_amount',
    );
    const grossTotalCents = items.reduce(
      (total, item) => total + item.quantity * item.grossUnitPriceCents,
      0,
    );
    if (cashCents + electronicCents !== grossTotalCents) {
      throw new FiscalProviderError(
        'ADE_WEB payment total does not match the document total.',
        false,
        'ADE_WEB_PAYMENT_TOTAL_MISMATCH',
      );
    }

    return {
      operationId: input.documentId,
      fiscalId,
      items,
      payment: { cashCents, electronicCents },
    };
  }

  private workerBaseUrl(): string {
    const configured =
      process.env.ADE_WORKER_BASE_URL?.trim() || DEFAULT_ADE_WORKER_BASE_URL;
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new FiscalProviderError(
        'ADE_WORKER_BASE_URL is invalid.',
        false,
        'ADE_WEB_WORKER_URL_INVALID',
      );
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new FiscalProviderError(
        'ADE_WORKER_BASE_URL protocol is invalid.',
        false,
        'ADE_WEB_WORKER_URL_INVALID',
      );
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  }
}
