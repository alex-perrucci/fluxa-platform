import { Injectable } from '@nestjs/common';
import { AdeAuthProfileService } from './ade-auth-profile.service';
import { AdeAuthService, type AdeAuthStatus } from './ade-auth.service';
import {
  AdeBrowserService,
  type AdeBrowserStatus,
} from './ade-browser.service';
import { AdeCieCredentialsService } from './ade-cie-credentials.service';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import {
  AdeSelectorProfileService,
  type AdeSelectorProfileStatus,
} from './ade-selector-profile.service';
import {
  AdeSessionService,
  type AdeSessionStatus,
} from './ade-session.service';

export interface AdeWorkerReadiness {
  service: 'ok';
  phase: 'document_submit';
  browser: AdeBrowserStatus;
  adeSession: AdeSessionStatus;
  selectorProfile: AdeSelectorProfileStatus;
  authProfile: 'missing' | 'invalid' | 'configured';
  cieCredentials: 'missing' | 'invalid' | 'ready';
  authEntryUrl: 'missing' | 'invalid' | 'configured';
  authStatus: AdeAuthStatus;
  entryUrl: 'missing' | 'invalid' | 'configured';
  internalAuth: 'missing' | 'configured';
  dryRun: 'disabled' | 'blocked' | 'ready';
  submit: 'disabled' | 'blocked' | 'armed';
  operational: boolean;
  canSubmit: boolean;
}

@Injectable()
export class AdeWebFiscalService {
  constructor(
    private readonly config: AdeRuntimeConfigService,
    private readonly browser: AdeBrowserService,
    private readonly session: AdeSessionService,
    private readonly selectors: AdeSelectorProfileService,
    private readonly authProfileService: AdeAuthProfileService,
    private readonly cieCredentialsService: AdeCieCredentialsService,
    private readonly auth: AdeAuthService,
  ) {}

  readiness(): AdeWorkerReadiness {
    const config = this.config.read();
    const browser = this.browser.readiness();
    const adeSession = this.session.readiness().status;
    const selectorProfile = this.selectors.readiness();
    const authProfile = this.authProfileService.readiness();
    const cieCredentials = this.cieCredentialsService.readiness();
    const entryUrl = config.entryUrl
      ? this.config.validatedEntryUrl()
        ? 'configured'
        : 'invalid'
      : 'missing';
    const authEntryUrl = config.authEntryUrl
      ? this.config.validatedAuthEntryUrl()
        ? 'configured'
        : 'invalid'
      : 'missing';
    const internalAuth = this.config.validatedInternalToken()
      ? 'configured'
      : 'missing';
    const dryRun = !config.dryRunEnabled
      ? 'disabled'
      : browser === 'ready' &&
          adeSession === 'ready' &&
          entryUrl === 'configured' &&
          internalAuth === 'configured' &&
          selectorProfile !== 'invalid'
        ? 'ready'
        : 'blocked';
    const submit = !config.submitEnabled
      ? 'disabled'
      : dryRun === 'ready'
        ? 'armed'
        : 'blocked';
    const canSubmit = submit === 'armed';

    return {
      service: 'ok',
      phase: 'document_submit',
      browser,
      adeSession,
      selectorProfile,
      authProfile,
      cieCredentials,
      authEntryUrl,
      authStatus: this.auth.status().status,
      entryUrl,
      internalAuth,
      dryRun,
      submit,
      operational: canSubmit,
      canSubmit,
    };
  }
}
