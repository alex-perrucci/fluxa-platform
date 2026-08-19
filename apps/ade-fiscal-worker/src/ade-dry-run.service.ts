import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import { AdeBrowserService } from './ade-browser.service';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSelectorProfileService } from './ade-selector-profile.service';
import { AdeSessionService } from './ade-session.service';

export interface AdeDryRunResult {
  runId: string;
  status: 'NAVIGATION_VERIFIED' | 'MARKERS_VERIFIED';
  finalUrl: string;
  markersChecked: Array<'authenticated' | 'receipt_area'>;
  submitAttempted: false;
  canSubmit: false;
}

@Injectable()
export class AdeDryRunService {
  private inFlight = false;

  constructor(
    private readonly config: AdeRuntimeConfigService,
    private readonly session: AdeSessionService,
    private readonly selectors: AdeSelectorProfileService,
    private readonly browser: AdeBrowserService,
  ) {}

  async run(): Promise<AdeDryRunResult> {
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
    if (this.inFlight) {
      throw new AdeAutomationError(
        'Un dry-run AdE è già in corso.',
        'ADE_DRY_RUN_BUSY',
        'CONFIGURATION',
        true,
      );
    }

    this.inFlight = true;
    try {
      const storageStatePath = this.session.storageStatePathForUse();
      const selectorProfile = this.selectors.loadForUse();
      const navigation = await this.browser.navigateReadOnly({
        entryUrl: entryUrl.toString(),
        storageStatePath,
        selectors: selectorProfile,
        timeoutMs: config.navigationTimeoutMs,
      });

      return {
        runId: randomUUID(),
        status:
          navigation.markersChecked.length > 0
            ? 'MARKERS_VERIFIED'
            : 'NAVIGATION_VERIFIED',
        finalUrl: navigation.finalUrl,
        markersChecked: navigation.markersChecked,
        submitAttempted: false,
        canSubmit: false,
      };
    } finally {
      this.inFlight = false;
    }
  }
}
