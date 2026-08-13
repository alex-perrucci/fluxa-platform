export const FISCAL_PROVIDERS = [
  'MOCK',
  'ACUBE_SMART_RECEIPTS',
  'OPENAPI_SMART_RECEIPTS',
] as const;
export const FISCAL_ENVIRONMENTS = ['SANDBOX', 'PRODUCTION'] as const;
export const FISCAL_DOCUMENT_TYPES = ['SALE', 'VOID'] as const;
export const FISCAL_DOCUMENT_STATUSES = [
  'QUEUED',
  'PROCESSING',
  'ISSUED',
  'RETRY',
  'REJECTED',
  'VOIDED',
  'CANCELLED',
] as const;

export type FiscalProvider = (typeof FISCAL_PROVIDERS)[number];
export type FiscalEnvironment = (typeof FISCAL_ENVIRONMENTS)[number];
export type FiscalDocumentType = (typeof FISCAL_DOCUMENT_TYPES)[number];
export type FiscalDocumentStatus = (typeof FISCAL_DOCUMENT_STATUSES)[number];
