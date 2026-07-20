export const PRINTER_PURPOSES = [
  'RECEIPT',
  'KITCHEN',
  'LABEL',
  'GENERIC',
] as const;

export const PRINTER_STATUSES = ['ACTIVE', 'DISABLED'] as const;

export const PRINT_DOCUMENT_TYPES = [
  'KITCHEN_TICKET',
  'ORDER_RECEIPT',
  'PAYMENT_RECEIPT',
  'TEST_PAGE',
] as const;

export const PRINT_JOB_STATUSES = [
  'QUEUED',
  'CLAIMED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;

export type PrinterPurpose = (typeof PRINTER_PURPOSES)[number];
export type PrinterStatus = (typeof PRINTER_STATUSES)[number];
export type PrintDocumentType = (typeof PRINT_DOCUMENT_TYPES)[number];
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];
