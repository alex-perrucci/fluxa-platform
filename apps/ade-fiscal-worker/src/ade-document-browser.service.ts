import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright';
import { AdeAutomationError } from './ade-automation-error';

export interface AdeDocumentItemInput {
  description: string;
  quantity: number;
  grossUnitPriceCents: number;
  vatRate: number;
}

export interface AdeDocumentPaymentInput {
  cashCents: number;
  electronicCents: number;
}

export interface AdeDocumentBrowserInput {
  entryUrl: string;
  storageStatePath: string;
  items: AdeDocumentItemInput[];
  payment: AdeDocumentPaymentInput;
  expectedGrossTotalCents: number;
  timeoutMs: number;
}

export interface AdeDocumentBrowserResult {
  finalUrl: string;
  confirmationBoundarySeen: true;
  cancelledAtBoundary: true;
  itemCount: number;
  grossTotalCents: number;
  paymentTotalCents: number;
  submitAttempted: false;
  canSubmit: false;
}

function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return 'unavailable';
  }
}

function formatEuroInput(cents: number, decimalSeparator: '.' | ',' = '.'): string {
  const value = (cents / 100).toFixed(2);
  return decimalSeparator === ',' ? value.replace('.', ',') : value;
}

function parseEuroInputToCents(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function containsEuroAmount(text: string, cents: number): boolean {
  const fixed = (cents / 100).toFixed(2);
  const comma = fixed.replace('.', ',');
  const compact = text.replace(/\u00a0/g, ' ');
  return compact.includes(fixed) || compact.includes(comma);
}

function documentFlowError(message: string): AdeAutomationError {
  return new AdeAutomationError(
    message,
    'ADE_DOCUMENT_FLOW_MISMATCH',
    'SELECTOR_MISMATCH',
    false,
  );
}

@Injectable()
export class AdeDocumentBrowserService implements OnApplicationShutdown {
  private browserPromise: Promise<Browser> | null = null;

  async dryRun(input: AdeDocumentBrowserInput): Promise<AdeDocumentBrowserResult> {
    const browser = await this.browser();
    let context: BrowserContext;
    try {
      context = await browser.newContext({ storageState: input.storageStatePath });
    } catch {
      throw new AdeAutomationError(
        'Impossibile caricare la sessione browser Agenzia delle Entrate.',
        'ADE_SESSION_INVALID',
        'AUTH_REQUIRED',
        false,
      );
    }

    try {
      const page = await context.newPage();
      await this.goto(page, input.entryUrl, input.timeoutMs);

      await this.clickRequired(
        page.getByRole('link', {
          name: 'Documento Commerciale on',
          exact: false,
        }),
        input.timeoutMs,
        'Documento Commerciale on line non disponibile.',
      );
      await this.clickRequired(
        page.getByRole('link', { name: 'Genera il tuo documento', exact: false }),
        input.timeoutMs,
        'Generazione documento commerciale non disponibile.',
      );

      for (let index = 0; index < input.items.length; index += 1) {
        await this.fillItem(page, index + 1, input.items[index], input.timeoutMs);
        await this.clickRequired(
          page.getByRole('button', { name: 'Aggiungi riga', exact: false }),
          input.timeoutMs,
          `Impossibile aggiungere la riga ${index + 1} al documento commerciale.`,
        );
      }

      await this.fillAndVerifyPayment(page, input.payment, input.timeoutMs);

      await this.clickRequired(
        page.getByRole('button', { name: 'Vai a Verifica dati', exact: false }),
        input.timeoutMs,
        'Passaggio a Verifica dati non disponibile.',
      );

      await this.verifySummary(
        page,
        input.items,
        input.expectedGrossTotalCents,
        input.timeoutMs,
      );

      await this.advanceToConfirmation(
        page,
        input.payment,
        input.timeoutMs,
      );

      await this.clickRequired(
        page.getByRole('button', { name: 'Conferma', exact: true }),
        input.timeoutMs,
        'Conferma preliminare del documento non disponibile.',
      );

      const proceed = page
        .getByRole('button', { name: 'Procedi', exact: false })
        .first();
      const cancel = page
        .getByRole('button', { name: 'Annulla', exact: false })
        .first();

      try {
        await proceed.waitFor({ state: 'visible', timeout: input.timeoutMs });
        await cancel.waitFor({ state: 'visible', timeout: input.timeoutMs });
      } catch {
        throw new AdeAutomationError(
          'Boundary finale Procedi/Annulla non trovato.',
          'ADE_DOCUMENT_CONFIRMATION_BOUNDARY_NOT_FOUND',
          'SELECTOR_MISMATCH',
          false,
        );
      }

      // Safety invariant: the dry-run never clicks "Procedi". The only action
      // allowed at the irreversible boundary is closing it with "Annulla".
      await cancel.click();

      return {
        finalUrl: safeUrl(page.url()),
        confirmationBoundarySeen: true,
        cancelledAtBoundary: true,
        itemCount: input.items.length,
        grossTotalCents: input.expectedGrossTotalCents,
        paymentTotalCents:
          input.payment.cashCents + input.payment.electronicCents,
        submitAttempted: false,
        canSubmit: false,
      };
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const browserPromise = this.browserPromise;
    this.browserPromise = null;
    if (!browserPromise) return;

    try {
      const browser = await browserPromise;
      await browser.close().catch(() => undefined);
    } catch {
      // Browser launch failures are classified for the request that observed them.
    }
  }

  private async fillItem(
    page: Page,
    row: number,
    item: AdeDocumentItemInput,
    timeoutMs: number,
  ): Promise<void> {
    const quantity = page
      .getByRole('textbox', { name: `Q.tà riga ${row}:*`, exact: false })
      .first();
    const description = page
      .getByRole('textbox', {
        name: `Descrizione prodotto/servizio riga ${row}:*`,
        exact: false,
      })
      .first();
    const price = page
      .getByRole('textbox', {
        name: `Prezzo lordo € riga ${row}:*`,
        exact: false,
      })
      .first();
    const vat = page
      .getByLabel(`Aliquota IVA riga ${row}:*`, { exact: false })
      .first();

    try {
      await quantity.waitFor({ state: 'visible', timeout: timeoutMs });
      await quantity.click();
      await quantity.fill(String(item.quantity));
      if (Number(await quantity.inputValue()) !== item.quantity) {
        throw documentFlowError(`Verifica quantità riga ${row} non riuscita.`);
      }
    } catch (error) {
      if (error instanceof AdeAutomationError) throw error;
      throw documentFlowError(`Campo quantità riga ${row} non compilabile.`);
    }

    try {
      await description.waitFor({ state: 'visible', timeout: timeoutMs });
      await description.click();
      await description.fill(item.description);
      if ((await description.inputValue()).trim() !== item.description) {
        throw documentFlowError(`Verifica descrizione riga ${row} non riuscita.`);
      }
    } catch (error) {
      if (error instanceof AdeAutomationError) throw error;
      throw documentFlowError(`Campo descrizione riga ${row} non compilabile.`);
    }

    await this.fillMoneyField(
      price,
      item.grossUnitPriceCents,
      timeoutMs,
      `prezzo lordo riga ${row}`,
    );

    try {
      await vat.waitFor({ state: 'visible', timeout: timeoutMs });
      await vat.selectOption(String(item.vatRate));
      if ((await vat.inputValue()) !== String(item.vatRate)) {
        throw documentFlowError(`Verifica aliquota IVA riga ${row} non riuscita.`);
      }
    } catch (error) {
      if (error instanceof AdeAutomationError) throw error;
      throw documentFlowError(`Aliquota IVA riga ${row} non selezionabile.`);
    }
  }

  private async fillMoneyField(
    locator: Locator,
    cents: number,
    timeoutMs: number,
    fieldName: string,
  ): Promise<void> {
    try {
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      await locator.click();

      // The AdE DCO UI is locale-sensitive. Prefer the Italian comma form,
      // then retry with a dot if the page/input mask normalizes differently.
      for (const separator of [',', '.'] as const) {
        await locator.fill(formatEuroInput(cents, separator));
        await locator.blur().catch(() => undefined);
        const parsed = parseEuroInputToCents(await locator.inputValue());
        if (parsed === cents) return;
      }

      throw documentFlowError(`Verifica ${fieldName} non riuscita.`);
    } catch (error) {
      if (error instanceof AdeAutomationError) throw error;
      throw documentFlowError(`Campo ${fieldName} non compilabile.`);
    }
  }

  private async fillAndVerifyPayment(
    page: Page,
    payment: AdeDocumentPaymentInput,
    timeoutMs: number,
  ): Promise<void> {
    const cash = page
      .getByRole('textbox', { name: 'Pagamento in contanti €:', exact: false })
      .first();
    const electronic = page
      .getByRole('textbox', {
        name: 'Pagamento con strumenti',
        exact: false,
      })
      .first();

    if (payment.cashCents > 0) {
      await this.fillMoneyField(
        cash,
        payment.cashCents,
        timeoutMs,
        'pagamento in contanti',
      );
    } else {
      try {
        await cash.waitFor({ state: 'visible', timeout: timeoutMs });
        await cash.fill('');
      } catch {
        throw documentFlowError('Campo pagamento in contanti non compilabile.');
      }
    }

    if (payment.electronicCents > 0) {
      await this.fillMoneyField(
        electronic,
        payment.electronicCents,
        timeoutMs,
        'pagamento con strumenti elettronici',
      );
    } else {
      try {
        await electronic.waitFor({ state: 'visible', timeout: timeoutMs });
        await electronic.fill('');
      } catch {
        throw documentFlowError(
          'Campo pagamento con strumenti elettronici non compilabile.',
        );
      }
    }

    const cashValue = parseEuroInputToCents(await cash.inputValue());
    const electronicValue = parseEuroInputToCents(await electronic.inputValue());
    if (
      cashValue !== payment.cashCents ||
      electronicValue !== payment.electronicCents
    ) {
      throw documentFlowError('Verifica dei pagamenti non riuscita.');
    }
  }

  private async verifySummary(
    page: Page,
    items: AdeDocumentItemInput[],
    grossTotalCents: number,
    timeoutMs: number,
  ): Promise<void> {
    try {
      await page
        .getByRole('button', { name: 'Vai a Conferma e stampa', exact: false })
        .first()
        .waitFor({ state: 'visible', timeout: timeoutMs });

      const bodyText = await page.locator('body').innerText();
      const normalized = bodyText.toLocaleLowerCase('it-IT');

      for (const item of items) {
        if (!normalized.includes(item.description.toLocaleLowerCase('it-IT'))) {
          throw new Error('missing item description');
        }
      }

      if (!normalized.includes('iva') || !normalized.includes('totale')) {
        throw new Error('summary markers missing');
      }
      if (!containsEuroAmount(bodyText, grossTotalCents)) {
        throw new Error('gross total missing');
      }
    } catch (error) {
      if (error instanceof AdeAutomationError) throw error;
      throw new AdeAutomationError(
        'I dati mostrati nella schermata Verifica dati non corrispondono al documento atteso.',
        'ADE_DOCUMENT_VERIFY_MISMATCH',
        'SELECTOR_MISMATCH',
        false,
      );
    }
  }

  private async advanceToConfirmation(
    page: Page,
    payment: AdeDocumentPaymentInput,
    timeoutMs: number,
  ): Promise<void> {
    const next = page
      .getByRole('button', { name: 'Vai a Conferma e stampa', exact: false })
      .first();
    const confirmation = page
      .getByRole('button', { name: 'Conferma', exact: true })
      .first();

    await this.clickRequired(
      next,
      timeoutMs,
      'Passaggio a Conferma e stampa non disponibile.',
    );

    if (payment.electronicCents <= 0) return;

    // With electronic payments AdE can interrupt wizard3 with an informational
    // modal. "Ho capito" only acknowledges that notice and is never a fiscal
    // submit. Depending on portal state, dismissing it may either complete the
    // transition to wizard4 or leave the user on wizard3, so handle both paths.
    const acknowledge = page
      .getByRole('button', { name: 'Ho capito', exact: true })
      .first();

    try {
      await acknowledge.waitFor({
        state: 'visible',
        timeout: Math.min(timeoutMs, 5_000),
      });
    } catch {
      // The notice can be absent if already acknowledged for this portal state.
      return;
    }

    try {
      await acknowledge.click();
      await acknowledge
        .waitFor({ state: 'hidden', timeout: Math.min(timeoutMs, 5_000) })
        .catch(() => undefined);
    } catch {
      throw documentFlowError(
        'Informativa pagamento elettronico non chiudibile.',
      );
    }

    // Some portal builds continue to wizard4 as part of the acknowledgement.
    // Give that path a short chance before attempting a second wizard3 click.
    try {
      await confirmation.waitFor({
        state: 'visible',
        timeout: Math.min(timeoutMs, 3_000),
      });
      return;
    } catch {
      // Still on wizard3: request the transition again after the modal is gone.
    }

    await this.clickRequired(
      next,
      timeoutMs,
      'Passaggio a Conferma e stampa non disponibile dopo informativa pagamento elettronico.',
    );

    try {
      await confirmation.waitFor({ state: 'visible', timeout: timeoutMs });
    } catch {
      throw documentFlowError(
        'Schermata Conferma e stampa non raggiunta dopo informativa pagamento elettronico.',
      );
    }
  }

  private async clickRequired(
    locator: Locator,
    timeoutMs: number,
    message: string,
  ): Promise<void> {
    try {
      const target = locator.first();
      await target.waitFor({ state: 'visible', timeout: timeoutMs });
      await target.click();
    } catch {
      throw documentFlowError(message);
    }
  }

  private async goto(page: Page, url: string, timeoutMs: number): Promise<void> {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    } catch (error) {
      throw new AdeAutomationError(
        error instanceof Error ? error.message : 'Navigazione AdE fallita.',
        'ADE_NAVIGATION_FAILED',
        'NAVIGATION',
        true,
      );
    }
  }

  private async browser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = chromium.launch({ headless: true }).catch((error) => {
        this.browserPromise = null;
        throw new AdeAutomationError(
          error instanceof Error ? error.message : 'Chromium non disponibile.',
          'ADE_BROWSER_UNAVAILABLE',
          'BROWSER',
          true,
        );
      });
    }

    const browser = await this.browserPromise;
    if (!browser.isConnected()) {
      this.browserPromise = null;
      return this.browser();
    }
    return browser;
  }
}
