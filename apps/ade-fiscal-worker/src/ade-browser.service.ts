import { existsSync } from 'node:fs';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { chromium, type Browser } from 'playwright';
import { AdeAutomationError } from './ade-automation-error';
import type { AdeSelectorProfile } from './ade-selector-profile.service';

export type AdeBrowserStatus = 'ready' | 'browser_missing';

export interface AdeReadOnlyNavigationResult {
  finalUrl: string;
  markersChecked: Array<'authenticated' | 'receipt_area'>;
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

  async navigateReadOnly(input: {
    entryUrl: string;
    storageStatePath: string;
    selectors: AdeSelectorProfile | null;
    timeoutMs: number;
  }): Promise<AdeReadOnlyNavigationResult> {
    const browser = await this.browser();
    const context = await browser.newContext({
      storageState: input.storageStatePath,
    });
    try {
      const page = await context.newPage();
      try {
        await page.goto(input.entryUrl, {
          waitUntil: 'domcontentloaded',
          timeout: input.timeoutMs,
        });
      } catch (error) {
        throw new AdeAutomationError(
          error instanceof Error ? error.message : 'Navigazione AdE fallita.',
          'ADE_NAVIGATION_FAILED',
          'NAVIGATION',
          true,
        );
      }

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
      await context.close();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } finally {
      this.browserPromise = null;
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

  private async waitForMarker(
    locator: { waitFor(options: { state: 'visible'; timeout: number }): Promise<void> },
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
