import { Injectable } from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import { AdeAuthProfileService } from './ade-auth-profile.service';
import { AdeBrowserService } from './ade-browser.service';
import { AdeCieCredentialsService } from './ade-cie-credentials.service';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSessionService } from './ade-session.service';

export type AdeAuthStatus =
  'IDLE' | 'LOGIN_STARTING' | 'WAITING_MFA' | 'SESSION_READY' | 'FAILED';

export interface AdeAuthStatusSnapshot {
  status: AdeAuthStatus;
  updatedAt: string;
  errorCode?: string;
}

@Injectable()
export class AdeAuthService {
  private inFlight: Promise<unknown> | null = null;
  private snapshot: AdeAuthStatusSnapshot = {
    status: 'IDLE',
    updatedAt: new Date().toISOString(),
  };

  constructor(
    private readonly config: AdeRuntimeConfigService,
    private readonly browser: AdeBrowserService,
    private readonly credentials: AdeCieCredentialsService,
    private readonly profile: AdeAuthProfileService,
    private readonly session: AdeSessionService,
  ) {}

  status(): AdeAuthStatusSnapshot {
    return { ...this.snapshot };
  }

  async refresh(): Promise<{
    status: 'SESSION_READY';
    finalUrl: string;
    sessionSaved: true;
  }> {
    if (this.inFlight) {
      throw new AdeAutomationError(
        'Autenticazione CIE già in corso.',
        'ADE_CIE_AUTH_BUSY',
        'AUTH_REQUIRED',
        false,
      );
    }

    const operation = this.runRefresh();
    this.inFlight = operation;
    try {
      return await operation;
    } finally {
      this.inFlight = null;
    }
  }

  private async runRefresh(): Promise<{
    status: 'SESSION_READY';
    finalUrl: string;
    sessionSaved: true;
  }> {
    this.setStatus('LOGIN_STARTING');
    try {
      const config = this.config.read();
      const authUrl = this.config.validatedAuthEntryUrl();
      if (!authUrl || !config.incaricanteCf) {
        throw new AdeAutomationError(
          'Configurazione autenticazione AdE incompleta o non valida.',
          'ADE_CONFIGURATION_INVALID',
          'CONFIGURATION',
          false,
        );
      }

      const credentials = this.credentials.loadForUse();
      const profile = this.profile.loadForUse();
      const storageStatePath = this.session.storageStatePathForWrite();

      const result = await this.browser.authenticateWithCie({
        authEntryUrl: authUrl.toString(),
        username: credentials.username,
        password: credentials.password,
        incaricanteCf: config.incaricanteCf,
        profile,
        storageStatePath,
        navigationTimeoutMs: config.navigationTimeoutMs,
        mfaTimeoutMs: config.mfaTimeoutMs,
        onWaitingMfa: () => this.setStatus('WAITING_MFA'),
      });

      this.setStatus('SESSION_READY');
      return {
        status: 'SESSION_READY',
        finalUrl: result.finalUrl,
        sessionSaved: true,
      };
    } catch (error) {
      this.snapshot = {
        status: 'FAILED',
        updatedAt: new Date().toISOString(),
        errorCode:
          error instanceof AdeAutomationError
            ? error.code
            : 'ADE_AUTH_UNEXPECTED',
      };
      throw error;
    }
  }

  private setStatus(status: AdeAuthStatus): void {
    this.snapshot = {
      status,
      updatedAt: new Date().toISOString(),
    };
  }
}
