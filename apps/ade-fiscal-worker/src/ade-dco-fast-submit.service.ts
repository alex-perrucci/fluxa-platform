import { Injectable } from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import { AdeDcoHttpClient } from './ade-dco-http.client';
import { mapAdeDcoSalePayload } from './ade-dco-payload.mapper';
import type {
  AdeDocumentItemInput,
  AdeDocumentPaymentInput,
} from './ade-document-browser.service';

const INFO_ME_PATH = '/common/testata/v1/info/me';
const FISCAL_DATA_PATH = '/ser/api/documenti/v1/doc/documenti/dati/fiscali';
const LAST_DOCUMENT_PATH = '/ser/api/documenti/v1/doc/documenti/ultimo/';

export type AdeFastSubmitConfirmationEvidence =
  | 'HTTP_RESPONSE'
  | 'HTTP_RECONCILED';

export interface AdeDcoFastSubmitResult {
  confirmationEvidence: AdeFastSubmitConfirmationEvidence;
  externalId: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  submitAttempted: true;
}

interface AdeDcoEvidence {
  esito: boolean | null;
  idtrx: string | null;
  progressivo: string | null;
  documentDate: string | null;
  grossTotalCents: number | null;
}

interface AdeDcoPreparedSubmit {
  payload: unknown;
  baseline: AdeDcoEvidence;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function directPath(root: unknown, path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function findField(root: unknown, keys: Set<string>, depth = 0): unknown {
  if (depth > 7 || root == null) return undefined;
  if (Array.isArray(root)) {
    for (const item of root) {
      const found = findField(item, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isRecord(root)) return undefined;
  for (const [key, value] of Object.entries(root)) {
    if (keys.has(key) && value != null) return value;
  }
  for (const value of Object.values(root)) {
    const found = findField(value, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function decimalToCents(value: unknown): number | null {
  const raw = stringValue(value)?.replace(',', '.');
  if (!raw || !/^-?\d+(?:\.\d+)?$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const cents = Math.round(parsed * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function normalizeDocumentDate(value: unknown): string | null {
  const raw = stringValue(value);
  if (!raw) return null;
  const italian = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+.*)?$/.exec(raw);
  if (italian) return `${italian[3]}-${italian[2]}-${italian[1]}`;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? raw : new Date(parsed).toISOString();
}

export function extractAdeDcoEvidence(raw: unknown): AdeDcoEvidence {
  const top = isRecord(raw) ? raw : {};
  const esito = typeof top.esito === 'boolean' ? top.esito : null;
  const idtrx =
    stringValue(top.idtrx) ??
    stringValue(findField(raw, new Set(['idtrx', 'idTrx', 'idTRX'])));
  const progressivo =
    stringValue(top.progressivo) ??
    stringValue(
      directPath(raw, ['documentoCommerciale', 'numeroProgressivo']),
    ) ??
    stringValue(findField(raw, new Set(['progressivo', 'numeroProgressivo'])));
  const documentDate = normalizeDocumentDate(
    directPath(raw, ['documentoCommerciale', 'dataOra']) ??
      findField(raw, new Set(['dataOra', 'dataDocumento'])),
  );
  const grossTotalCents = decimalToCents(
    directPath(raw, ['documentoCommerciale', 'ammontareComplessivo']) ??
      findField(raw, new Set(['ammontareComplessivo'])),
  );

  return { esito, idtrx, progressivo, documentDate, grossTotalCents };
}

function sameIdentifier(a: AdeDcoEvidence, b: AdeDcoEvidence): boolean {
  if (a.idtrx && b.idtrx) return a.idtrx === b.idtrx;
  if (a.progressivo && b.progressivo) return a.progressivo === b.progressivo;
  return false;
}

function reconcilesNewDocument(
  before: AdeDcoEvidence,
  after: AdeDcoEvidence,
  expectedGrossTotalCents: number,
): boolean {
  const hasIdentifier = Boolean(after.idtrx || after.progressivo);
  const totalMatches = after.grossTotalCents === expectedGrossTotalCents;
  return hasIdentifier && totalMatches && !sameIdentifier(before, after);
}

function submitUnknown(message: string): AdeAutomationError {
  return new AdeAutomationError(
    message,
    'ADE_DOCUMENT_SUBMIT_UNKNOWN',
    'SUBMIT_UNKNOWN',
    false,
    true,
  );
}

function submitRejected(message: string): AdeAutomationError {
  return new AdeAutomationError(
    message,
    'ADE_DOCUMENT_SUBMIT_REJECTED',
    'SUBMIT_UNKNOWN',
    false,
    true,
  );
}

@Injectable()
export class AdeDcoFastSubmitService {
  constructor(private readonly http: AdeDcoHttpClient) {}

  async submit(input: {
    storageStatePath: string;
    fiscalId: string;
    items: AdeDocumentItemInput[];
    payment: AdeDocumentPaymentInput;
    expectedGrossTotalCents: number;
    timeoutMs: number;
  }): Promise<AdeDcoFastSubmitResult> {
    const prepared = await this.preflight(input);

    try {
      const response = await this.http.postDocumentJson({
        storageStatePath: input.storageStatePath,
        body: prepared.payload,
        timeoutMs: input.timeoutMs,
      });
      return await this.reconcileResponse(input, prepared.baseline, response);
    } catch (error) {
      if (!(error instanceof AdeAutomationError) || !error.submitAttempted) {
        throw error;
      }

      const recovered = await this.tryReconcileLastDocument(
        input,
        prepared.baseline,
      );
      if (recovered) return recovered;
      throw error;
    }
  }

  private async preflight(input: {
    storageStatePath: string;
    fiscalId: string;
    items: AdeDocumentItemInput[];
    payment: AdeDocumentPaymentInput;
    expectedGrossTotalCents: number;
    timeoutMs: number;
  }): Promise<AdeDcoPreparedSubmit> {
    await this.http.bootstrapDco({
      storageStatePath: input.storageStatePath,
      timeoutMs: input.timeoutMs,
    });

    await this.http.getJson({
      storageStatePath: input.storageStatePath,
      path: INFO_ME_PATH,
      timeoutMs: input.timeoutMs,
    });
    const fiscalData = await this.http.getJson({
      storageStatePath: input.storageStatePath,
      path: FISCAL_DATA_PATH,
      timeoutMs: input.timeoutMs,
    });
    const lastDocument = await this.http.getJson({
      storageStatePath: input.storageStatePath,
      path: LAST_DOCUMENT_PATH,
      timeoutMs: input.timeoutMs,
    });

    return {
      payload: mapAdeDcoSalePayload({
        fiscalId: input.fiscalId,
        fiscalData: fiscalData.body,
        items: input.items,
        payment: input.payment,
        expectedGrossTotalCents: input.expectedGrossTotalCents,
      }),
      baseline: extractAdeDcoEvidence(lastDocument.body),
    };
  }

  private async reconcileResponse(
    input: {
      storageStatePath: string;
      expectedGrossTotalCents: number;
      timeoutMs: number;
    },
    baseline: AdeDcoEvidence,
    response: {
      status: number;
      body: unknown;
      submitAttempted: true;
    },
  ): Promise<AdeDcoFastSubmitResult> {
    const postEvidence = extractAdeDcoEvidence(response.body);
    if (postEvidence.esito === false) {
      throw submitRejected(
        'AdE ha rifiutato esplicitamente il documento commerciale inviato via HTTP.',
      );
    }

    const strongPostEvidence =
      postEvidence.esito === true &&
      Boolean(postEvidence.idtrx || postEvidence.progressivo);

    const reconciled = await this.tryReconcileLastDocument(input, baseline);
    if (reconciled) return reconciled;

    if (response.status >= 200 && response.status < 300 && strongPostEvidence) {
      return {
        confirmationEvidence: 'HTTP_RESPONSE',
        externalId: postEvidence.idtrx,
        documentNumber: postEvidence.progressivo,
        documentDate: postEvidence.documentDate,
        submitAttempted: true,
      };
    }

    if (response.status >= 400 && response.status < 500) {
      throw submitRejected(
        `AdE ha rifiutato il POST del documento commerciale con HTTP ${response.status}.`,
      );
    }

    throw submitUnknown(
      `Il POST DCO è stato eseguito (HTTP ${response.status}) ma non è disponibile una prova positiva univoca dell’emissione.`,
    );
  }

  private async tryReconcileLastDocument(
    input: {
      storageStatePath: string;
      expectedGrossTotalCents: number;
      timeoutMs: number;
    },
    baseline: AdeDcoEvidence,
  ): Promise<AdeDcoFastSubmitResult | null> {
    try {
      const latest = await this.http.getJson({
        storageStatePath: input.storageStatePath,
        path: LAST_DOCUMENT_PATH,
        timeoutMs: input.timeoutMs,
      });
      const after = extractAdeDcoEvidence(latest.body);
      if (
        !reconcilesNewDocument(baseline, after, input.expectedGrossTotalCents)
      ) {
        return null;
      }

      return {
        confirmationEvidence: 'HTTP_RECONCILED',
        externalId: after.idtrx,
        documentNumber: after.progressivo,
        documentDate: after.documentDate,
        submitAttempted: true,
      };
    } catch {
      return null;
    }
  }
}
