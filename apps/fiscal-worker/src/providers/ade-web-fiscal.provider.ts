import { Injectable } from '@nestjs/common';
import {
  FiscalProviderSafetyError,
  type FiscalProviderAdapter,
  type FiscalProviderExecutionResult,
  type FiscalProviderName,
} from './fiscal-provider';

@Injectable()
export class AdeWebFiscalProvider implements FiscalProviderAdapter {
  supports(provider: FiscalProviderName): boolean {
    return provider === 'ADE_WEB';
  }

  execute(): Promise<FiscalProviderExecutionResult> {
    // Phase C is deliberately non-operational. No browser, selector, AdE URL or
    // submit action exists here. If ADE_WEB is enabled prematurely, stop in a
    // terminal state instead of retrying or falling through to another provider.
    return Promise.reject(
      new FiscalProviderSafetyError(
        'La sessione Agenzia delle Entrate non è ancora configurata.',
        'ADE_WEB_SESSION_REQUIRED',
        'AUTH_REQUIRED',
      ),
    );
  }
}
