import { Injectable } from '@nestjs/common';
import { AdeBrowserService, type AdeBrowserStatus } from './ade-browser.service';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import {
  AdeSelectorProfileService,
  type AdeSelectorProfileStatus,
} from './ade-selector-profile.service';
import { AdeSessionService, type AdeSessionStatus } from './ade-session.service';

export interface AdeWorkerReadiness {
  service: 'ok';
  phase: 'dry_run';
  browser: AdeBrowserStatus;
  adeSession: AdeSessionStatus;
  selectorProfile: AdeSelectorProfileStatus;
  entryUrl: 'missing' | 'invalid' | 'configured';
  internalAuth: 'missing' | 'configured';
  dryRun: 'disabled' | 'blocked' | 'ready';
  operational: false;
  canSubmit: false;
}

@Injectable()
export class AdeWebFiscalService {
  constructor(
    private readonly config: AdeRuntimeConfigService,
    private readonly browser: AdeBrowserService,
    private readonly session: AdeSessionService,
    private readonly selectors: AdeSelectorProfileService,
  ) {}

  readiness(): AdeWorkerReadiness {
    const config = this.config.read();
    const browser = this.browser.readiness();
    const adeSession = this.session.readiness().status;
    const selectorProfile = this.selectors.readiness();
    const entryUrl = config.entryUrl
      ? this.config.validatedEntryUrl()
        ? 'configured'
        : 'invalid'
      : 'missing';
    const internalAuth = config.internalToken ? 'configured' : 'missing';
    const dryRun = !config.dryRunEnabled
      ? 'disabled'
      : browser === 'ready' &&
          adeSession === 'ready' &&
          entryUrl === 'configured' &&
          internalAuth === 'configured' &&
          selectorProfile !== 'invalid'
        ? 'ready'
        : 'blocked';

    return {
      service: 'ok',
      phase: 'dry_run',
      browser,
      adeSession,
      selectorProfile,
      entryUrl,
      internalAuth,
      dryRun,
      operational: false,
      canSubmit: false,
    };
  }
}
