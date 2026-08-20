import { Injectable } from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import {
  AdeDocumentBrowserService,
  type AdeDocumentItemInput,
  type AdeDocumentPaymentInput,
} from './ade-document-browser.service';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSessionService } from './ade-session.service';

const SUPPORTED_VAT_RATES = new Set([4, 5, 10, 22]);
const MAX_ITEMS = 50;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_QUANTITY = 999;
const MAX_UNIT_PRICE_CENTS = 100_000_000;

export interface AdeDocumentDryRunResult {
  status: 'DOCUMENT_READY_NOT_SUBMITTED';
  finalUrl: string;
  confirmationBoundarySeen: true;
  cancelledAtBoundary: true;
  itemCount: number;
  grossTotalCents: number;
  paymentTotalCents: number;
  submitAttempted: false;
  canSubmit: false;
}

interface NormalizedDocumentInput {
  items: AdeDocumentItemInput[];
  payment: AdeDocumentPaymentInput;
  grossTotalCents: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function invalid(message: string): never {
  throw new AdeAutomationError(
    message,
    'ADE_DOCUMENT_INPUT_INVALID',
    'CONFIGURATION',
    false,
  );
}

function normalizeInput(raw: unknown): NormalizedDocumentInput {
  if (!isRecord(raw)) invalid('Payload documento commerciale non valido.');

  const rawItems = raw.items;
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > MAX_ITEMS) {
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
    if (!Number.isSafeInteger(lineTotal)) invalid('Totale riga fuori intervallo.');
    grossTotalCents += lineTotal;
    if (!Number.isSafeInteger(grossTotalCents)) invalid('Totale documento fuori intervallo.');
  }

  const paymentTotalCents = cashCents + electronicCents;
  if (!Number.isSafeInteger(paymentTotalCents)) invalid('Totale pagamento fuori intervallo.');
  if (paymentTotalCents !== grossTotalCents) {
    invalid(
      `Il totale pagamenti (${paymentTotalCents}) deve coincidere con il totale lordo (${grossTotalCents}) in centesimi.`,
    );
  }

  return {
    items,
    payment: { cashCents, electronicCents },
    grossTotalCents,
  };
}

@Injectable()
export class AdeDocumentDryRunService {
  private inFlight = false;

  constructor(
    private readonly config: AdeRuntimeConfigService,
    private readonly session: AdeSessionService,
    private readonly browser: AdeDocumentBrowserService,
  ) {}

  async run(raw: unknown): Promise<AdeDocumentDryRunResult> {
    const config = this.config.read();
    if (!config.dryRunEnabled) {
      throw new AdeAutomationError(
        'Dry-run AdE disabilitato.',
        'ADE_DRY_RUN_DISABLED',
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
    if (this.inFlight) {
      throw new AdeAutomationError(
        'Un document dry-run AdE è già in corso.',
        'ADE_DOCUMENT_DRY_RUN_BUSY',
        'CONFIGURATION',
        true,
      );
    }

    this.inFlight = true;
    try {
      const storageStatePath = this.session.storageStatePathForUse();
      const result = await this.browser.dryRun({
        entryUrl: entryUrl.toString(),
        storageStatePath,
        items: input.items,
        payment: input.payment,
        expectedGrossTotalCents: input.grossTotalCents,
        timeoutMs: config.navigationTimeoutMs,
      });

      return {
        status: 'DOCUMENT_READY_NOT_SUBMITTED',
        finalUrl: result.finalUrl,
        confirmationBoundarySeen: result.confirmationBoundarySeen,
        cancelledAtBoundary: result.cancelledAtBoundary,
        itemCount: result.itemCount,
        grossTotalCents: result.grossTotalCents,
        paymentTotalCents: result.paymentTotalCents,
        submitAttempted: false,
        canSubmit: false,
      };
    } finally {
      this.inFlight = false;
    }
  }
}
