import { FiscalProviderError } from './fiscal-provider.service';
import { classifyFiscalFailure } from './fiscal-execution-policy';
import { FiscalProviderSafetyError } from './providers/fiscal-provider';

describe('classifyFiscalFailure', () => {
  it('stops unclassified ADE failures as UNKNOWN', () => {
    expect(
      classifyFiscalFailure({
        provider: 'ADE_WEB',
        attempts: 1,
        maxAttempts: 5,
        error: new Error('browser disconnected'),
      }),
    ).toMatchObject({
      status: 'UNKNOWN',
      attemptOutcome: 'UNKNOWN',
      retryable: false,
      error: { code: 'ADE_WEB_UNKNOWN_RESULT' },
    });
  });

  it('persists explicit AUTH_REQUIRED without retrying', () => {
    expect(
      classifyFiscalFailure({
        provider: 'ADE_WEB',
        attempts: 1,
        maxAttempts: 5,
        error: new FiscalProviderSafetyError(
          'session required',
          'ADE_WEB_SESSION_REQUIRED',
          'AUTH_REQUIRED',
        ),
      }),
    ).toMatchObject({
      status: 'AUTH_REQUIRED',
      attemptOutcome: 'AUTH_REQUIRED',
      retryable: false,
    });
  });

  it('keeps retry semantics for classified legacy provider errors', () => {
    expect(
      classifyFiscalFailure({
        provider: 'ACUBE_SMART_RECEIPTS',
        attempts: 1,
        maxAttempts: 5,
        error: new FiscalProviderError('network', true, 'ACUBE_NETWORK_ERROR'),
      }),
    ).toMatchObject({ status: 'RETRY', retryable: true });
  });

  it('never retries a non-retryable legacy provider error', () => {
    expect(
      classifyFiscalFailure({
        provider: 'OPENAPI_SMART_RECEIPTS',
        attempts: 1,
        maxAttempts: 5,
        error: new FiscalProviderError(
          'invalid payload',
          false,
          'OPENAPI_PAYLOAD_INVALID',
        ),
      }),
    ).toMatchObject({ status: 'REJECTED', retryable: false });
  });
});
