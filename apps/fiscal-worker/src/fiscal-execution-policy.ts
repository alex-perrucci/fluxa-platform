import { FiscalProviderError } from './fiscal-provider.service';
import {
  FiscalProviderSafetyError,
  type FiscalProviderName,
} from './providers/fiscal-provider';

export type FiscalFailureStatus =
  | 'RETRY'
  | 'REJECTED'
  | 'UNKNOWN'
  | 'AUTH_REQUIRED';

export type FiscalAttemptFailureOutcome =
  | 'RETRY'
  | 'REJECTED'
  | 'UNKNOWN'
  | 'AUTH_REQUIRED';

export interface FiscalFailureDetails {
  message: string;
  code: string;
  response?: Record<string, unknown>;
  externalId?: string;
  externalStatus?: string;
}

export interface FiscalFailureDecision {
  status: FiscalFailureStatus;
  attemptOutcome: FiscalAttemptFailureOutcome;
  retryable: boolean;
  error: FiscalFailureDetails;
}

interface ClassifyFailureInput {
  provider: FiscalProviderName;
  attempts: number;
  maxAttempts: number;
  error: unknown;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown fiscal error';
}

export function classifyFiscalFailure(
  input: ClassifyFailureInput,
): FiscalFailureDecision {
  if (input.error instanceof FiscalProviderSafetyError) {
    return {
      status: input.error.terminalStatus,
      attemptOutcome: input.error.terminalStatus,
      retryable: false,
      error: input.error,
    };
  }

  if (input.error instanceof FiscalProviderError) {
    const effectiveMaxAttempts =
      input.provider === 'OPENAPI_SMART_RECEIPTS'
        ? Math.max(input.maxAttempts, 10)
        : input.maxAttempts;
    const retryable =
      input.error.retryable && input.attempts < effectiveMaxAttempts;

    return {
      status: retryable ? 'RETRY' : 'REJECTED',
      attemptOutcome: retryable ? 'RETRY' : 'REJECTED',
      retryable,
      error: input.error,
    };
  }

  if (input.provider === 'ADE_WEB') {
    // Browser automation has an asymmetric failure mode: once an external
    // submit may have happened, retrying an unclassified exception can create
    // a duplicate fiscal document. Unknown ADE failures therefore stop.
    return {
      status: 'UNKNOWN',
      attemptOutcome: 'UNKNOWN',
      retryable: false,
      error: {
        message: messageOf(input.error),
        code: 'ADE_WEB_UNKNOWN_RESULT',
      },
    };
  }

  // Preserve the historical behavior for existing API providers. Their
  // provider-specific code is already responsible for declaring known
  // non-retryable failures with FiscalProviderError.
  const retryable = input.attempts < input.maxAttempts;
  return {
    status: retryable ? 'RETRY' : 'REJECTED',
    attemptOutcome: retryable ? 'RETRY' : 'REJECTED',
    retryable,
    error: {
      message: messageOf(input.error),
      code: 'FISCAL_UNKNOWN_ERROR',
    },
  };
}
