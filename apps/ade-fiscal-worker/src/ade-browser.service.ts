import { existsSync } from 'node:fs';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import {
  AdeAutomationError,
  type AdeAutomationErrorCategory,
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
        input.profile.enterWithCieSelector,
        input.navigationTimeoutMs,
        'ADE_CIE_ENTRY_NOT_FOUND',
      );

      if (input.profile.level2Selector) {
        await this.clickRequired(
          page,
          input.profile.level2Selector,
          input.navigationTimeoutMs,
          'ADE_CIE_LEVEL2_NOT_FOUND',
        );
      }

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

      if (input.profile.waitingMfaMarker) {
        await this.waitForCssMarker(
          page,
          input.profile.waitingMfaMarker,
          input.navigationTimeoutMs,
          'ADE_CIE_MFA_NOT_STARTED',
          'AUTH_REQUIRED',
          false,
        );
      }
      input.onWaitingMfa?.();

      await this.waitForCieCompletion(page, input.profile, input.mfaTimeoutMs);
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

  private async waitForCieCompletion(
    page: Page,
    profile: AdeAuthProfile,
    timeoutMs: number,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let postMfaClicked = false;

    while (Date.now() < deadline) {
      if (
        await page
          .locator(profile.authenticatedMarker)
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        return;
      }
      if (profile.postMfaContinueSelector && !postMfaClicked) {
        const continueButton = page
          .locator(profile.postMfaContinueSelector)
          .first();
        if (await continueButton.isVisible().catch(() => false)) {
          await continueButton.click();
          postMfaClicked = true;
        }
      }
      await page.waitForTimeout(500);
    }

    throw new AdeAutomationError(
      'Autorizzazione CIE non completata entro il tempo previsto.',
      'ADE_CIE_MFA_TIMEOUT',
      'AUTH_REQUIRED',
      false,
    );
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
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: timeoutMs });
      await locator.click();
    } catch {
      throw new AdeAutomationError(
        'Elemento richiesto nel flusso CIE non trovato.',
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
      const locator = page.locator(selector).first();
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

  private async waitForCssMarker(
    page: Page,
    selector: string,
    timeoutMs: number,
    code: AdeAutomationErrorCode,
    category: AdeAutomationErrorCategory,
    retrySafe: boolean,
  ): Promise<void> {
    try {
      await page
        .locator(selector)
        .first()
        .waitFor({ state: 'visible', timeout: timeoutMs });
    } catch {
      throw new AdeAutomationError(
        'Marker atteso nel flusso CIE non trovato.',
        code,
        category,
        retrySafe,
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
