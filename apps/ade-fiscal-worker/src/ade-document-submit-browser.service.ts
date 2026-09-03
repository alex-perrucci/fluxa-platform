import { statSync } from 'node:fs';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { AdeAutomationError } from './ade-automation-error';
import type {
  AdeDocumentBrowserInput,
  AdeDocumentItemInput,
  AdeDocumentPaymentInput,
} from './ade-document-browser.service';
import { AdeReusableBrowserSessionPool } from './ade-reusable-browser-session-pool';
import {
  adeSessionMetricKey,
  adeSessionPoolMax,
  attachAdeProtocolDiagnostics,
  measureAdeSubmitStage,
} from './ade-submit-observability';

const DCO_DIRECT_URL =
  'https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/';
const DIRECT_DCO_DISCOVERY_TIMEOUT_MS = 2_000;
const ELECTRONIC_TRANSITION_TIMEOUT_MS = 5_000;
const MAX_DIAGNOSTIC_DETAIL_LENGTH = 180;

export type AdeSubmitConfirmationEvidence =
  'DOWNLOAD' | 'PDF_ACTION' | 'PRINT_ACTION';

export interface AdeDocumentSubmitBrowserResult {
  finalUrl: string;
  confirmationBoundarySeen: true;
  confirmationEvidence: AdeSubmitConfirmationEvidence;
  itemCount: number;
  grossTotalCents: number;
  paymentTotalCents: number;
  submitAttempted: true;
}

interface SuccessEvidence {
  pdfActions: number;
  printActions: number;
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

function formatEuroInput(
  cents: number,
  decimalSeparator: '.' | ',' = '.',
): string {
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

function submitUnknown(message: string): AdeAutomationError {
  return new AdeAutomationError(
    message,
    'ADE_DOCUMENT_SUBMIT_UNKNOWN',
    'SUBMIT_UNKNOWN',
    false,
    true,
  );
}

function safeDiagnosticDetail(error: unknown): string {
  if (!(error instanceof Error)) return 'Errore Playwright sconosciuto';
  const name = error.name.trim() || 'Error';
  const firstLine = error.message
    .split('\n', 1)[0]
    ?.replace(/\s+/g, ' ')
    .trim();
  if (!firstLine) return name;
  return `${name}: ${firstLine}`.slice(0, MAX_DIAGNOSTIC_DETAIL_LENGTH);
}

@Injectable()
export class AdeDocumentSubmitBrowserService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AdeDocumentSubmitBrowserService.name);
  private browserPromise: Promise<Browser> | null = null;
  private readonly sessionPool = new AdeReusableBrowserSessionPool(
    adeSessionPoolMax(),
  );

  onApplicationBootstrap(): void {
    void this.browser().catch(() => undefined);
  }

  async submit(
    input: AdeDocumentBrowserInput,
  ): Promise<AdeDocumentSubmitBrowserResult> {
    const sessionKey = adeSessionMetricKey(input.storageStatePath);
    const totalStartedAt = Date.now();
    let submitAttempted = false;

    try {
      const page = await measureAdeSubmitStage(
        this.logger,
        sessionKey,
        'session',
        () => this.pageForSession(input.storageStatePath),
      );

      try {
        await measureAdeSubmitStage(this.logger, sessionKey, 'open_dco', () =>
          this.openDocumentGenerator(page, input.entryUrl, input.timeoutMs),
        );

        await measureAdeSubmitStage(
          this.logger,
          sessionKey,
          'fill_items',
          async () => {
            for (let index = 0; index < input.items.length; index += 1) {
              await this.fillItem(
                page,
                index + 1,
                input.items[index],
                input.timeoutMs,
              );
              await this.clickRequired(
                page.getByRole('button', {
                  name: 'Aggiungi riga',
                  exact: false,
                }),
                input.timeoutMs,
                `Impossibile aggiungere la riga ${index + 1} al documento commerciale.`,
              );
            }
          },
        );

        await measureAdeSubmitStage(this.logger, sessionKey, 'payment', () =>
          this.fillAndVerifyPayment(page, input.payment, input.timeoutMs),
        );

        await measureAdeSubmitStage(
          this.logger,
          sessionKey,
          'verify',
          async () => {
            await this.clickRequired(
              page.getByRole('button', {
                name: 'Vai a Verifica dati',
                exact: false,
              }),
              input.timeoutMs,
              'Passaggio a Verifica dati non disponibile.',
            );
            await this.verifySummary(
              page,
              input.items,
              input.expectedGrossTotalCents,
              input.timeoutMs,
            );
          },
        );

        const proceed = page
          .getByRole('button', { name: 'Procedi', exact: false })
          .first();
        const cancel = page
          .getByRole('button', { name: 'Annulla', exact: false })
          .first();

        await measureAdeSubmitStage(
          this.logger,
          sessionKey,
          'confirmation',
          async () => {
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

            try {
              await proceed.waitFor({
                state: 'visible',
                timeout: input.timeoutMs,
              });
              await cancel.waitFor({
                state: 'visible',
                timeout: input.timeoutMs,
              });
            } catch {
              throw new AdeAutomationError(
                'Boundary finale Procedi/Annulla non trovato.',
                'ADE_DOCUMENT_CONFIRMATION_BOUNDARY_NOT_FOUND',
                'SELECTOR_MISMATCH',
                false,
              );
            }
          },
        );

        const evidenceBefore = await this.successEvidence(page);
        let downloadSeen = false;
        const onDownload = () => {
          downloadSeen = true;
        };
        page.on('download', onDownload);

        try {
          // Irreversible boundary. From this assignment onward every ambiguity is
          // terminal UNKNOWN. The caller must never automatically retry it.
          submitAttempted = true;
          await measureAdeSubmitStage(this.logger, sessionKey, 'submit', () =>
            proceed.click({ timeout: input.timeoutMs }),
          );

          const confirmationEvidence = await measureAdeSubmitStage(
            this.logger,
            sessionKey,
            'success_evidence',
            () =>
              this.waitForSuccessEvidence(
                page,
                proceed,
                cancel,
                evidenceBefore,
                () => downloadSeen,
                input.timeoutMs,
              ),
          );

          return {
            finalUrl: safeUrl(page.url()),
            confirmationBoundarySeen: true,
            confirmationEvidence,
            itemCount: input.items.length,
            grossTotalCents: input.expectedGrossTotalCents,
            paymentTotalCents:
              input.payment.cashCents + input.payment.electronicCents,
            submitAttempted: true,
          };
        } catch (error) {
          if (error instanceof AdeAutomationError && error.submitAttempted) {
            throw error;
          }
          throw submitUnknown(
            error instanceof Error
              ? `Esito AdE non verificabile dopo Procedi: ${error.message}`
              : 'Esito AdE non verificabile dopo Procedi.',
          );
        } finally {
          page.off('download', onDownload);
        }
      } catch (error) {
        if (submitAttempted) {
          await this.sessionPool.reset(input.storageStatePath);
          if (error instanceof AdeAutomationError && error.submitAttempted) {
            throw error;
          }
          throw submitUnknown('Esito AdE non verificabile dopo Procedi.');
        }

        if (
          error instanceof AdeAutomationError &&
          (error.category === 'BROWSER' || error.category === 'NAVIGATION')
        ) {
          await this.sessionPool.reset(input.storageStatePath);
        }
        throw error;
      }
    } finally {
      this.logger.log(
        `ADE submit timing session=${sessionKey} stage=total durationMs=${Date.now() - totalStartedAt} itemCount=${input.items.length}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.sessionPool.reset();
    const browserPromise = this.browserPromise;
    this.browserPromise = null;
    if (!browserPromise) return;

    try {
      const browser = await browserPromise;
      await browser.close().catch(() => undefined);
    } catch {
      // Launch errors are reported by the request that observed them.
    }
  }

  private async waitForSuccessEvidence(
    page: Page,
    proceed: Locator,
    cancel: Locator,
    before: SuccessEvidence,
    downloadSeen: () => boolean,
    timeoutMs: number,
  ): Promise<AdeSubmitConfirmationEvidence> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const proceedVisible = await proceed.isVisible().catch(() => false);
      const cancelVisible = await cancel.isVisible().catch(() => false);
      const boundaryGone = !proceedVisible && !cancelVisible;

      if (boundaryGone && downloadSeen()) return 'DOWNLOAD';

      if (boundaryGone) {
        const current = await this.successEvidence(page);
        if (current.pdfActions > before.pdfActions) return 'PDF_ACTION';
        if (current.printActions > before.printActions) return 'PRINT_ACTION';
      }

      await page.waitForTimeout(200);
    }

    throw submitUnknown(
      'Procedi è stato attivato ma non è comparsa una prova positiva di emissione.',
    );
  }

  private async successEvidence(page: Page): Promise<SuccessEvidence> {
    const pdfLinks = page.getByRole('link', { name: /pdf|scarica/i });
    const pdfButtons = page.getByRole('button', { name: /pdf|scarica/i });
    const printLinks = page.getByRole('link', { name: /stampa/i });
    const printButtons = page.getByRole('button', { name: /stampa/i });

    const [pdfLinkCount, pdfButtonCount, printLinkCount, printButtonCount] =
      await Promise.all([
        pdfLinks.count(),
        pdfButtons.count(),
        printLinks.count(),
        printButtons.count(),
      ]);

    return {
      pdfActions: pdfLinkCount + pdfButtonCount,
      printActions: printLinkCount + printButtonCount,
    };
  }

  private async pageForSession(storageStatePath: string): Promise<Page> {
    const fingerprint = this.sessionFingerprint(storageStatePath);
    const browser = await this.browser();

    try {
      return await this.sessionPool.getPage({
        key: storageStatePath,
        fingerprint,
        create: async () => {
          const context = await browser.newContext({
            storageState: storageStatePath,
          });
          const page = await context.newPage();
          return { context, page };
        },
        onPage: (page) => attachAdeProtocolDiagnostics(page, this.logger),
      });
    } catch (error) {
      await this.sessionPool.reset(storageStatePath);
      if (error instanceof AdeAutomationError) throw error;
      throw new AdeAutomationError(
        'Impossibile caricare la sessione browser Agenzia delle Entrate.',
        'ADE_SESSION_INVALID',
        'AUTH_REQUIRED',
        false,
      );
    }
  }

  private sessionFingerprint(storageStatePath: string): string {
    try {
      const stat = statSync(storageStatePath);
      return `${storageStatePath}:${stat.size}:${stat.mtimeMs}`;
    } catch {
      throw new AdeAutomationError(
        'Impossibile leggere la sessione browser Agenzia delle Entrate.',
        'ADE_SESSION_INVALID',
        'AUTH_REQUIRED',
        false,
      );
    }
  }

  private async openDocumentGenerator(
    page: Page,
    entryUrl: string,
    timeoutMs: number,
  ): Promise<void> {
    const generate = page
      .getByRole('link', {
        name: 'Genera il tuo documento',
        exact: false,
      })
      .first();

    try {
      await this.goto(page, DCO_DIRECT_URL, timeoutMs);
      await generate.waitFor({
        state: 'visible',
        timeout: Math.min(timeoutMs, DIRECT_DCO_DISCOVERY_TIMEOUT_MS),
      });
      await generate.click();
      return;
    } catch {
      // Use the already validated home flow as fallback and as the session
      // expiry signal consumed by the one allowed auth refresh.
    }

    await this.goto(page, entryUrl, timeoutMs);
    await this.clickRequired(
      page.getByRole('link', {
        name: 'Documento Commerciale on',
        exact: false,
      }),
      timeoutMs,
      'Documento Commerciale on line non disponibile.',
    );
    await this.clickRequired(
      generate,
      timeoutMs,
      'Generazione documento commerciale non disponibile.',
    );
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

    await this.runTextFieldStep(row, 'quantity.waitFor', () =>
      quantity.waitFor({ state: 'visible', timeout: timeoutMs }),
    );
    await this.runTextFieldStep(row, 'quantity.fill', () =>
      quantity.fill(String(item.quantity)),
    );
    const quantityValue = await this.runTextFieldStep(
      row,
      'quantity.inputValue',
      () => quantity.inputValue(),
    );
    if (Number(quantityValue) !== item.quantity) {
      throw documentFlowError(`Verifica quantità riga ${row} non riuscita.`);
    }

    await this.runTextFieldStep(row, 'description.waitFor', () =>
      description.waitFor({ state: 'visible', timeout: timeoutMs }),
    );
    await this.runTextFieldStep(row, 'description.fill', () =>
      description.fill(item.description),
    );
    const descriptionValue = await this.runTextFieldStep(
      row,
      'description.inputValue',
      () => description.inputValue(),
    );
    if (descriptionValue.trim() !== item.description) {
      throw documentFlowError(`Verifica descrizione riga ${row} non riuscita.`);
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
        throw documentFlowError(
          `Verifica aliquota IVA riga ${row} non riuscita.`,
        );
      }
    } catch (error) {
      if (error instanceof AdeAutomationError) throw error;
      throw documentFlowError(`Aliquota IVA riga ${row} non selezionabile.`);
    }
  }

  private async runTextFieldStep<T>(
    row: number,
    step: string,
    action: () => Promise<T>,
  ): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof AdeAutomationError) throw error;
      const detail = safeDiagnosticDetail(error);
      this.logger.warn(
        `ADE submit text-field failure row=${row} step=${step} detail=${detail}`,
      );
      throw documentFlowError(
        `Riga ${row}, step ${step} non riuscito (${detail}).`,
      );
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
      for (const separator of [',', '.'] as const) {
        await locator.fill(formatEuroInput(cents, separator));
        await locator.blur().catch(() => undefined);
        if (parseEuroInputToCents(await locator.inputValue()) === cents) return;
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
      await cash.waitFor({ state: 'visible', timeout: timeoutMs });
      await cash.fill('');
    }

    if (payment.electronicCents > 0) {
      await this.fillMoneyField(
        electronic,
        payment.electronicCents,
        timeoutMs,
        'pagamento con strumenti elettronici',
      );
    } else {
      await electronic.waitFor({ state: 'visible', timeout: timeoutMs });
      await electronic.fill('');
    }

    if (
      parseEuroInputToCents(await cash.inputValue()) !== payment.cashCents ||
      parseEuroInputToCents(await electronic.inputValue()) !==
        payment.electronicCents
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
    } catch {
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

    const acknowledge = page
      .getByRole('button', { name: 'Ho capito', exact: true })
      .first();
    const transitionTimeout = Math.min(
      timeoutMs,
      ELECTRONIC_TRANSITION_TIMEOUT_MS,
    );

    let transition: 'ACKNOWLEDGE' | 'CONFIRMATION' | 'UNKNOWN';
    try {
      transition = await Promise.any([
        acknowledge
          .waitFor({ state: 'visible', timeout: transitionTimeout })
          .then(() => 'ACKNOWLEDGE' as const),
        confirmation
          .waitFor({ state: 'visible', timeout: transitionTimeout })
          .then(() => 'CONFIRMATION' as const),
      ]);
    } catch {
      transition = 'UNKNOWN';
    }

    if (transition === 'CONFIRMATION' || transition === 'UNKNOWN') return;

    try {
      await acknowledge.click();
      await acknowledge
        .waitFor({ state: 'hidden', timeout: transitionTimeout })
        .catch(() => undefined);
    } catch {
      throw documentFlowError(
        'Informativa pagamento elettronico non chiudibile.',
      );
    }

    try {
      await confirmation.waitFor({
        state: 'visible',
        timeout: Math.min(timeoutMs, 3_000),
      });
      return;
    } catch {
      // Still on wizard3: ask the portal to move forward again.
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

  private async goto(
    page: Page,
    url: string,
    timeoutMs: number,
  ): Promise<void> {
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });
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
      this.browserPromise = chromium
        .launch({ headless: true })
        .catch((error) => {
          this.browserPromise = null;
          throw new AdeAutomationError(
            error instanceof Error
              ? error.message
              : 'Chromium non disponibile.',
            'ADE_BROWSER_UNAVAILABLE',
            'BROWSER',
            true,
          );
        });
    }

    const browser = await this.browserPromise;
    if (!browser.isConnected()) {
      await this.sessionPool.reset();
      this.browserPromise = null;
      return this.browser();
    }
    return browser;
  }
}
