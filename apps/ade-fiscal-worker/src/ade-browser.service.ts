import { existsSync } from 'node:fs';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright';
import {
  AdeAutomationError,
  type AdeAutomationErrorCode,
} from './ade-automation-error';
import type { AdeAuthProfile } from './ade-auth-profile.service';
import type { AdeSelectorProfile } from './ade-selector-profile.service';

export type AdeBrowserStatus = 'ready' | 'browser_missing';

export interface AdeReadOnlyNavigationResult {
  finalUrl: string;
  markersChecked: Array<'authenticated' | 'receipt_area'>;
}

export interface AdeCieAuthResult {
  finalUrl: string;
  sessionSaved: true;
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

@Injectable()
export class AdeBrowserService implements OnApplicationShutdown {
  private browserPromise: Promise<Browser> | null = null;

  readiness(): AdeBrowserStatus {
    return existsSync(chromium.executablePath()) ? 'ready' : 'browser_missing';
  }

  async authenticateWithCie(input: {
    authEntryUrl: string;
    username: string;
    password: string;
    incaricanteCf: string;
    profile: AdeAuthProfile;
    storageStatePath: string;
    navigationTimeoutMs: number;
    mfaTimeoutMs: number;
    onWaitingMfa?: () => void;
  }): Promise<AdeCieAuthResult> {
    const browser = await this.browser();
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await this.goto(page, input.authEntryUrl, input.navigationTimeoutMs);

      await this.clickRequired(
        page,
        input.profile.cieTabSelector,
        input.navigationTimeoutMs,
        'ADE_CIE_ENTRY_NOT_FOUND',
      );
      await this.clickRequired(
        page,
        input.profile.enterWithCieSelector,
        input.navigationTimeoutMs,
        'ADE_CIE_ENTRY_NOT_FOUND',
      );
      await this.fillRequired(
        page,
        input.profile.usernameSelector,
        input.username,
        input.navigationTimeoutMs,
        'ADE_CIE_USERNAME_FIELD_NOT_FOUND',
      );
      await this.fillRequired(
        page,
        input.profile.passwordSelector,
        input.password,
        input.navigationTimeoutMs,
        'ADE_CIE_PASSWORD_FIELD_NOT_FOUND',
      );
      await this.clickRequired(
        page,
        input.profile.credentialsSubmitSelector,
        input.navigationTimeoutMs,
        'ADE_CIE_SUBMIT_NOT_FOUND',
      );

      input.onWaitingMfa?.();
      await this.waitAndClickMfaContinuation(
        page,
        input.profile.postMfaContinueSelector,
        input.mfaTimeoutMs,
      );

      await this.fillAndPressEnter(
        page,
        input.profile.serviceSearchSelector,
        'fatture',
        input.navigationTimeoutMs,
      );
      await this.clickRequired(
        page,
        input.profile.serviceLinkSelector,
        input.navigationTimeoutMs,
        'ADE_PORTAL_FLOW_MISMATCH',
      );
      await this.clickRequired(
        page,
        input.profile.serviceAccessButtonSelector,
        input.navigationTimeoutMs,
        'ADE_PORTAL_FLOW_MISMATCH',
      );

      await this.ensureWorkProfileChooser(
        page,
        input.profile.workProfileRadioSelector,
        input.profile.changeUserText ?? 'Cambia utenza',
        input.navigationTimeoutMs,
      );
      await this.checkRequired(
        page,
        input.profile.workProfileRadioSelector,
        input.navigationTimeoutMs,
      );
      await this.clickRequired(
        page,
        input.profile.workProfileProceedSelector,
        input.navigationTimeoutMs,
        'ADE_PORTAL_FLOW_MISMATCH',
      );
      await this.selectIncaricanteByCf(
        page,
        input.profile.workProfileSelectLabel,
        input.incaricanteCf,
        input.navigationTimeoutMs,
      );
      await this.clickRequired(
        page,
        input.profile.workProfileProceedSelector,
        input.navigationTimeoutMs,
        'ADE_PORTAL_FLOW_MISMATCH',
      );
      await this.clickRequired(
        page,
        input.profile.workProfileConfirmSelector,
        input.navigationTimeoutMs,
        'ADE_PORTAL_FLOW_MISMATCH',
      );

      if (input.profile.finalMarker) {
        await this.waitForSelector(
          page,
          input.profile.finalMarker,
          input.navigationTimeoutMs,
          'ADE_PORTAL_FLOW_MISMATCH',
        );
      } else {
        await page.waitForTimeout(750);
      }

      await context.storageState({ path: input.storageStatePath });
      return {
        finalUrl: safeUrl(page.url()),
        sessionSaved: true,
      };
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async navigateReadOnly(input: {
    entryUrl: string;
    storageStatePath: string;
    selectors: AdeSelectorProfile | null;
    timeoutMs: number;
  }): Promise<AdeReadOnlyNavigationResult> {
    const browser = await this.browser();
    let context: BrowserContext;
    try {
      context = await browser.newContext({
        storageState: input.storageStatePath,
      });
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

      const markersChecked: AdeReadOnlyNavigationResult['markersChecked'] = [];
      if (input.selectors?.authenticatedMarker) {
        await this.waitForMarker(
          page.locator(input.selectors.authenticatedMarker).first(),
          input.timeoutMs,
          'authenticated',
        );
        markersChecked.push('authenticated');
      }
      if (input.selectors?.receiptAreaMarker) {
        await this.waitForMarker(
          page.locator(input.selectors.receiptAreaMarker).first(),
          input.timeoutMs,
          'receipt_area',
        );
        markersChecked.push('receipt_area');
      }

      return {
        finalUrl: safeUrl(page.url()),
        markersChecked,
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
      // A failed launch has already been classified for the caller.
    }
  }

  private async ensureWorkProfileChooser(
    page: Page,
    workProfileRadioSelector: string,
    changeUserText: string,
    timeoutMs: number,
  ): Promise<void> {
    const radio = this.profileLocator(page, workProfileRadioSelector).first();
    if (await radio.isVisible().catch(() => false)) return;

    const candidates = [
      page.getByRole('button', { name: changeUserText, exact: false }).first(),
      page.getByRole('link', { name: changeUserText, exact: false }).first(),
      page.getByText(changeUserText, { exact: false }).first(),
    ];

    let clicked = false;
    for (const candidate of candidates) {
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      throw new AdeAutomationError(
        'Comando Cambia utenza non disponibile nel portale AdE.',
        'ADE_PORTAL_FLOW_MISMATCH',
        'SELECTOR_MISMATCH',
        false,
      );
    }

    try {
      await radio.waitFor({ state: 'visible', timeout: timeoutMs });
    } catch {
      throw new AdeAutomationError(
        'Selezione profilo incaricato non disponibile dopo Cambia utenza.',
        'ADE_PORTAL_FLOW_MISMATCH',
        'SELECTOR_MISMATCH',
        false,
      );
    }
  }

  private async waitAndClickMfaContinuation(
    page: Page,
    selector: string,
    timeoutMs: number,
  ): Promise<void> {
    try {
      const locator = this.profileLocator(page, selector).first();
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      await locator.click();
    } catch {
      throw new AdeAutomationError(
        'Autorizzazione CIE non completata entro il tempo previsto.',
        'ADE_CIE_MFA_TIMEOUT',
        'AUTH_REQUIRED',
        false,
      );
    }
  }

  private async selectIncaricanteByCf(
    page: Page,
    label: string,
    incaricanteCf: string,
    timeoutMs: number,
  ): Promise<void> {
    try {
      const select = page.getByLabel(label).first();
      await select.waitFor({ state: 'visible', timeout: timeoutMs });
      const value = await select.evaluate((element, cf) => {
        const htmlSelect = element as HTMLSelectElement;
        for (const option of Array.from(htmlSelect.options)) {
          try {
            const payload = JSON.parse(option.value) as {
              incaricante?: { cf?: string };
            };
            if (payload.incaricante?.cf === cf) return option.value;
          } catch {
            // Non-JSON option: ignore it.
          }
        }
        return null;
      }, incaricanteCf);

      if (!value) {
        throw new AdeAutomationError(
          'Incaricante configurato non presente nell’elenco AdE.',
          'ADE_INCARICANTE_NOT_FOUND',
          'AUTH_REQUIRED',
          false,
        );
      }
      await select.selectOption(value);
    } catch (error) {
      if (error instanceof AdeAutomationError) throw error;
      throw new AdeAutomationError(
        'Impossibile selezionare l’incaricante AdE.',
        'ADE_INCARICANTE_NOT_FOUND',
        'AUTH_REQUIRED',
        false,
      );
    }
  }

  private async fillAndPressEnter(
    page: Page,
    selector: string,
    value: string,
    timeoutMs: number,
  ): Promise<void> {
    try {
      const locator = this.profileLocator(page, selector).first();
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      await locator.fill(value);
      await locator.press('Enter');
    } catch {
      throw new AdeAutomationError(
        'Ricerca del servizio AdE non disponibile.',
        'ADE_PORTAL_FLOW_MISMATCH',
        'SELECTOR_MISMATCH',
        false,
      );
    }
  }

  private async checkRequired(
    page: Page,
    selector: string,
    timeoutMs: number,
  ): Promise<void> {
    try {
      const locator = this.profileLocator(page, selector).first();
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      await locator.check();
    } catch {
      throw new AdeAutomationError(
        'Profilo incaricato AdE non selezionabile.',
        'ADE_PORTAL_FLOW_MISMATCH',
        'SELECTOR_MISMATCH',
        false,
      );
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

  private async clickRequired(
    page: Page,
    selector: string,
    timeoutMs: number,
    code: AdeAutomationErrorCode,
  ): Promise<void> {
    try {
      const locator = this.profileLocator(page, selector).first();
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      await locator.click();
    } catch {
      throw new AdeAutomationError(
        'Elemento richiesto nel flusso AdE non trovato.',
        code,
        'SELECTOR_MISMATCH',
        false,
      );
    }
  }

  private async fillRequired(
    page: Page,
    selector: string,
    value: string,
    timeoutMs: number,
    code: AdeAutomationErrorCode,
  ): Promise<void> {
    try {
      const locator = this.profileLocator(page, selector).first();
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      await locator.fill(value);
    } catch {
      throw new AdeAutomationError(
        'Campo richiesto nel flusso CIE non trovato.',
        code,
        'SELECTOR_MISMATCH',
        false,
      );
    }
  }

  private async waitForSelector(
    page: Page,
    selector: string,
    timeoutMs: number,
    code: AdeAutomationErrorCode,
  ): Promise<void> {
    try {
      await this.profileLocator(page, selector)
        .first()
        .waitFor({ state: 'visible', timeout: timeoutMs });
    } catch {
      throw new AdeAutomationError(
        'Marker finale AdE non trovato.',
        code,
        'SELECTOR_MISMATCH',
        false,
      );
    }
  }

  private profileLocator(page: Page, selector: string): Locator {
    const match = selector.match(/^role=([a-z]+)\[name="(.+)"\]$/);
    if (!match) return page.locator(selector);

    const [, role, name] = match;
    switch (role) {
      case 'tab':
        return page.getByRole('tab', { name, exact: false });
      case 'link':
        return page.getByRole('link', { name, exact: false });
      case 'textbox':
        return page.getByRole('textbox', { name, exact: false });
      case 'button':
        return page.getByRole('button', { name, exact: false });
      case 'combobox':
        return page.getByRole('combobox', { name, exact: false });
      case 'radio':
        return page.getByRole('radio', { name, exact: false });
      default:
        return page.locator(selector);
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
      this.browserPromise = null;
      return this.browser();
    }
    return browser;
  }

  private async waitForMarker(
    locator: {
      waitFor(options: { state: 'visible'; timeout: number }): Promise<void>;
    },
    timeoutMs: number,
    marker: 'authenticated' | 'receipt_area',
  ): Promise<void> {
    try {
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    } catch {
      throw new AdeAutomationError(
        `Marker AdE non trovato: ${marker}.`,
        'ADE_MARKER_NOT_FOUND',
        'SELECTOR_MISMATCH',
        true,
      );
    }
  }
}
