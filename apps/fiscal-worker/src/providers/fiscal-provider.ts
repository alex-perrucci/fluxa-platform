export type FiscalProviderName =
  | 'MOCK'
  | 'ACUBE_SMART_RECEIPTS'
  | 'OPENAPI_SMART_RECEIPTS'
  | 'ADE_WEB';

export type FiscalEnvironment = 'SANDBOX' | 'PRODUCTION';
export type FiscalDocumentType = 'SALE' | 'VOID';

export interface FiscalProviderExecutionInput {
  documentId: string;
  type: FiscalDocumentType;
  provider: FiscalProviderName;
  environment: FiscalEnvironment;
  payload: Record<string, unknown>;
  externalId?: string | null;
}

export interface FiscalProviderExecutionResult {
  externalId: string;
  externalStatus: string;
  documentNumber: string | null;
  documentDate: string | null;
  response: Record<string, unknown>;
}

export interface FiscalProviderAdapter {
  supports(provider: FiscalProviderName): boolean;
  execute(
    input: FiscalProviderExecutionInput,
  ): Promise<FiscalProviderExecutionResult>;
}

export type FiscalSafetyStatus = 'UNKNOWN' | 'AUTH_REQUIRED';

/**
 * Terminal safety outcome for providers where retrying may create a duplicate
 * fiscal document or where operator authentication is required.
 *
 * The fiscal executor must persist this status and must not throw the error
 * back to BullMQ, otherwise queue-level retries could repeat the operation.
 */
export class FiscalProviderSafetyError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly terminalStatus: FiscalSafetyStatus,
    readonly response?: Record<string, unknown>,
    readonly externalId?: string,
    readonly externalStatus?: string,
  ) {
    super(message);
    this.name = 'FiscalProviderSafetyError';
  }
}
