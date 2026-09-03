import { Injectable } from '@nestjs/common';
import { AdeAuthService } from './ade-auth.service';
import { AdeAutomationError } from './ade-automation-error';
import {
  AdeDcoFastSubmitService,
  type AdeFastSubmitConfirmationEvidence,
} from './ade-dco-fast-submit.service';
import type {
  AdeDocumentItemInput,
  AdeDocumentPaymentInput,
} from './ade-document-browser.service';
import { AdeDocumentOperationLockService } from './ade-document-operation-lock.service';
import {
  AdeDocumentSubmitBrowserService,
  type AdeSubmitConfirmationEvidence,
} from './ade-document-submit-browser.service';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSessionService } from './ade-session.service';

const SUPPORTED_VAT_RATES = new Set([4, 5, 10, 22]);
const MAX_ITEMS = 50;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_QUANTITY = 999;
const MAX_UNIT_PRICE_CENTS = 100_000_000;
const MAX_OPERATION_ID_LENGTH = 128;
const DCO_ENTRY_UNAVAILABLE_MESSAGE =
  'Documento Commerciale on line non disponibile.';
const DCO_DIRECT_URL =
  'https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/';

interface NormalizedSubmitInput {
  operationId: string;
  fiscalId: string;
  items: AdeDocumentItemInput[];
  payment: AdeDocumentPaymentInput;
  grossTotalCents: number;
}

export interface AdeDocumentSubmitResult {
  status: 'DOCUMENT_SUBMITTED_CONFIRMED';
  operationId: string;
  transport: 'BROWSER' | 'HTTP_FAST';
  finalUrl: string;
  confirmationBoundarySeen: boolean;
  confirmationEvidence:
    AdeSubmitConfirmationEvidence | AdeFastSubmitConfirmationEvidence;
  externalId: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  itemCount: number;
  grossTotalCents: number;
  paymentTotalCents: number;
  submitAttempted: true;
  canSubmit: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
}

function invalid(message: string): never {
  throw new AdeAutomationError(
    message,
    'ADE_DOCUMENT_INPUT_INVALID',
    'CONFIGURATION',
    false,
  );
}

function normalizeInput(raw: unknown): NormalizedSubmitInput {
  if (!isRecord(raw)) invalid('Payload documento commerciale non valido.');

  const operationId =
    typeof raw.operationId === 'string' ? raw.operationId.trim() : '';
  if (!operationId || operationId.length > MAX_OPERATION_ID_LENGTH) {
    invalid('operationId non valido.');
  }

  const fiscalId = typeof raw.fiscalId === 'string' ? raw.fiscalId.trim() : '';
  if (!/^\d{11}$/.test(fiscalId)) {
    invalid('fiscalId non valido.');
  }

  const rawItems = raw.items;
  if (
    !Array.isArray(rawItems) ||
    rawItems.length < 1 ||
    rawItems.length > MAX_ITEMS
  ) {
    invalid(`items deve contenere da 1 a ${MAX_ITEMS} righe.`);
  }

  const items: AdeDocumentItemInput[] = rawItems.map((rawItem, index) => {
    if (!isRecord(rawItem)) invalid(`Riga ${index + 1} non valida.`);

    const description =
      typeof rawItem.description === 'string' ? rawItem.description.trim() : '';
    if (!description || description.length > MAX_DESCRIPTION_LENGTH) {
      invalid(`Descrizione riga ${index + 1} non valida.`);
    }

    const quantity = safeInteger(rawItem.quantity);
    if (quantity === null || quantity < 1 || quantity > MAX_QUANTITY) {
      invalid(`Quantità riga ${index + 1} non valida.`);
    }

    const grossUnitPriceCents = safeInteger(rawItem.grossUnitPriceCents);
    if (
      grossUnitPriceCents === null ||
      grossUnitPriceCents < 1 ||
      grossUnitPriceCents > MAX_UNIT_PRICE_CENTS
    ) {
      invalid(`Prezzo lordo riga ${index + 1} non valido.`);
    }

    const vatRate = safeInteger(rawItem.vatRate);
    if (vatRate === null || !SUPPORTED_VAT_RATES.has(vatRate)) {
      invalid(
        `Aliquota IVA riga ${index + 1} non supportata. Valori ammessi: 4, 5, 10, 22.`,
      );
    }

    return { description, quantity, grossUnitPriceCents, vatRate };
  });

  if (!isRecord(raw.payment)) invalid('Pagamento non valido.');
  const cashCents = safeInteger(raw.payment.cashCents);
  const electronicCents = safeInteger(raw.payment.electronicCents);
  if (cashCents === null || cashCents < 0) invalid('cashCents non valido.');
  if (electronicCents === null || electronicCents < 0) {
    invalid('electronicCents non valido.');
  }

  let grossTotalCents = 0;
  for (const item of items) {
    const lineTotal = item.quantity * item.grossUnitPriceCents;
    if (!Number.isSafeInteger(lineTotal)) {
      invalid('Totale riga fuori intervallo.');
    }
    grossTotalCents += lineTotal;
    if (!Number.isSafeInteger(grossTotalCents)) {
      invalid('Totale documento fuori intervallo.');
    }
  }

  const paymentTotalCents = cashCents + electronicCents;
  if (!Number.isSafeInteger(paymentTotalCents)) {
    invalid('Totale pagamento fuori intervallo.');
  }
  if (paymentTotalCents !== grossTotalCents) {
    invalid(
      `Il totale pagamenti (${paymentTotalCents}) deve coincidere con il totale lordo (${grossTotalCents}) in centesimi.`,
    );
  }

  return {
    operationId,
    fiscalId,
    items,
    payment: { cashCents, electronicCents },
    grossTotalCents,
  };
}

function shouldRefreshSession(error: unknown): boolean {
  if (!(error instanceof AdeAutomationError) || error.submitAttempted) {
    return false;
  }
  if (error.code === 'ADE_SESSION_REQUIRED') return true;
  if (error.code === 'ADE_SESSION_INVALID') return true;
  return (
    error.code === 'ADE_DOCUMENT_FLOW_MISMATCH' &&
    error.message === DCO_ENTRY_UNAVAILABLE_MESSAGE
  );
}

function canFallbackFromFastPath(error: unknown): boolean {
  return (
    error instanceof AdeAutomationError &&
    !error.submitAttempted &&
    (error.code === 'ADE_DCO_FAST_PATH_UNAVAILABLE' ||
      error.code === 'ADE_NAVIGATION_FAILED')
  );
}

@Injectable()
export class AdeDocumentSubmitService {
  private readonly attemptedOperationIds = new Set<string>();

  constructor(
    private readonly config: AdeRuntimeConfigService,
    private readonly session: AdeSessionService,
    private readonly browser: AdeDocumentSubmitBrowserService,
    private readonly fastSubmit: AdeDcoFastSubmitService,
    private readonly auth: AdeAuthService,
    private readonly operationLock: AdeDocumentOperationLockService,
  ) {}

  async run(raw: unknown): Promise<AdeDocumentSubmitResult> {
    const config = this.config.read();
    if (!config.submitEnabled) {
      throw new AdeAutomationError(
        'Submit fiscale AdE disabilitato.',
        'ADE_SUBMIT_DISABLED',
        'CONFIGURATION',
        false,
      );
    }

    const entryUrl = this.config.validatedEntryUrl();
    if (!entryUrl) {
      throw new AdeAutomationError(
        'ADE_WEB_ENTRY_URL deve essere un URL HTTPS valido.',
        'ADE_CONFIGURATION_INVALID',
        'CONFIGURATION',
        false,
      );
    }

    const input = normalizeInput(raw);
    if (this.attemptedOperationIds.has(input.operationId)) {
      throw new AdeAutomationError(
        'operationId già usato per un tentativo di submit in questo worker.',
        'ADE_DOCUMENT_SUBMIT_DUPLICATE_OPERATION',
        'SUBMIT_UNKNOWN',
        false,
        true,
      );
    }

    const release = this.operationLock.tryAcquire(input.fiscalId);
    if (!release) {
      throw new AdeAutomationError(
        'Un submit AdE è già in corso per questo incaricante.',
        'ADE_DOCUMENT_SUBMIT_BUSY',
        'CONFIGURATION',
        true,
      );
    }

    try {
      try {
        return await this.runConfiguredTransport(
          entryUrl.toString(),
          input,
          config.navigationTimeoutMs,
          config.httpFastSubmitEnabled,
        );
      } catch (error) {
        if (error instanceof AdeAutomationError && error.submitAttempted) {
          this.rememberAttempt(input.operationId);
          throw error;
        }
        if (!shouldRefreshSession(error)) throw error;

        // Exactly one pre-submit auth refresh is allowed. CieID MFA remains an
        // official manual approval. No auth refresh, browser fallback or second
        // POST is ever attempted after the irreversible HTTP/Procedi boundary.
        await this.auth.refresh(input.fiscalId);

        try {
          return await this.runConfiguredTransport(
            entryUrl.toString(),
            input,
            config.navigationTimeoutMs,
            config.httpFastSubmitEnabled,
          );
        } catch (retryError) {
          // If a freshly authenticated storage-state still cannot authenticate
          // the internal HTTP surface, browser fallback is safe because no POST
          // has started yet. This also protects us from undocumented API drift.
          if (
            config.httpFastSubmitEnabled &&
            retryError instanceof AdeAutomationError &&
            retryError.code === 'ADE_SESSION_INVALID' &&
            !retryError.submitAttempted
          ) {
            return await this.runBrowser(
              entryUrl.toString(),
              input,
              config.navigationTimeoutMs,
            );
          }
          throw retryError;
        }
      }
    } catch (error) {
      if (error instanceof AdeAutomationError && error.submitAttempted) {
        this.rememberAttempt(input.operationId);
      }
      throw error;
    } finally {
      release();
    }
  }

  private async runConfiguredTransport(
    entryUrl: string,
    input: NormalizedSubmitInput,
    timeoutMs: number,
    httpFastSubmitEnabled: boolean,
  ): Promise<AdeDocumentSubmitResult> {
    if (!httpFastSubmitEnabled) {
      return this.runBrowser(entryUrl, input, timeoutMs);
    }

    try {
      return await this.runHttpFast(input, timeoutMs);
    } catch (error) {
      if (!canFallbackFromFastPath(error)) throw error;
      return this.runBrowser(entryUrl, input, timeoutMs);
    }
  }

  private async runHttpFast(
    input: NormalizedSubmitInput,
    timeoutMs: number,
  ): Promise<AdeDocumentSubmitResult> {
    const storageStatePath = this.session.storageStatePathForUse(
      input.fiscalId,
    );
    const result = await this.fastSubmit.submit({
      storageStatePath,
      fiscalId: input.fiscalId,
      items: input.items,
      payment: input.payment,
      expectedGrossTotalCents: input.grossTotalCents,
      timeoutMs,
    });

    this.rememberAttempt(input.operationId);
    return {
      status: 'DOCUMENT_SUBMITTED_CONFIRMED',
      operationId: input.operationId,
      transport: 'HTTP_FAST',
      finalUrl: DCO_DIRECT_URL,
      confirmationBoundarySeen: false,
      confirmationEvidence: result.confirmationEvidence,
      externalId: result.externalId,
      documentNumber: result.documentNumber,
      documentDate: result.documentDate,
      itemCount: input.items.length,
      grossTotalCents: input.grossTotalCents,
      paymentTotalCents:
        input.payment.cashCents + input.payment.electronicCents,
      submitAttempted: true,
      canSubmit: false,
    };
  }

  private async runBrowser(
    entryUrl: string,
    input: NormalizedSubmitInput,
    timeoutMs: number,
  ): Promise<AdeDocumentSubmitResult> {
    const storageStatePath = this.session.storageStatePathForUse(
      input.fiscalId,
    );
    const result = await this.browser.submit({
      entryUrl,
      storageStatePath,
      items: input.items,
      payment: input.payment,
      expectedGrossTotalCents: input.grossTotalCents,
      timeoutMs,
    });

    this.rememberAttempt(input.operationId);
    return {
      status: 'DOCUMENT_SUBMITTED_CONFIRMED',
      operationId: input.operationId,
      transport: 'BROWSER',
      finalUrl: result.finalUrl,
      confirmationBoundarySeen: result.confirmationBoundarySeen,
      confirmationEvidence: result.confirmationEvidence,
      externalId: null,
      documentNumber: null,
      documentDate: null,
      itemCount: result.itemCount,
      grossTotalCents: result.grossTotalCents,
      paymentTotalCents: result.paymentTotalCents,
      submitAttempted: true,
      canSubmit: false,
    };
  }

  private rememberAttempt(operationId: string): void {
    this.attemptedOperationIds.add(operationId);
    if (this.attemptedOperationIds.size <= 2_000) return;
    const oldest = this.attemptedOperationIds.values().next().value as
      string | undefined;
    if (oldest) this.attemptedOperationIds.delete(oldest);
  }
}
