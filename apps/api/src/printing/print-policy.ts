import { BadRequestException, ConflictException } from '@nestjs/common';
import type {
  PrintDocumentType,
  PrintJobStatus,
  PrinterPurpose,
} from './printing.constants';

export function buildPrintRouteKey(
  documentType: PrintDocumentType,
  kitchenStationId?: string | null,
): string {
  if (documentType === 'KITCHEN_TICKET') {
    if (!kitchenStationId) {
      throw new BadRequestException({
        code: 'KITCHEN_STATION_REQUIRED',
        message: 'La rotta delle comande richiede una postazione cucina.',
      });
    }
    return `KITCHEN_TICKET:${kitchenStationId}`;
  }

  if (kitchenStationId) {
    throw new BadRequestException({
      code: 'KITCHEN_STATION_NOT_ALLOWED',
      message: 'La postazione cucina è ammessa solo per le comande.',
    });
  }

  return `${documentType}:DEFAULT`;
}

export function assertPrinterSupportsDocument(
  purpose: PrinterPurpose,
  documentType: PrintDocumentType,
): void {
  const supported =
    purpose === 'GENERIC' ||
    (purpose === 'KITCHEN' && documentType === 'KITCHEN_TICKET') ||
    (purpose === 'RECEIPT' &&
      ['ORDER_RECEIPT', 'PAYMENT_RECEIPT', 'TEST_PAGE'].includes(
        documentType,
      )) ||
    (purpose === 'LABEL' && documentType === 'TEST_PAGE');

  if (!supported) {
    throw new ConflictException({
      code: 'PRINTER_DOCUMENT_NOT_SUPPORTED',
      message: 'La stampante non supporta il tipo di documento richiesto.',
    });
  }
}

export function retryDelaySeconds(attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 1) return 5;
  return Math.min(300, 5 * 2 ** Math.min(attempt - 1, 6));
}

export function assertAdminPrintTransition(
  current: PrintJobStatus,
  action: 'RETRY' | 'CANCEL',
): void {
  const allowed =
    action === 'RETRY'
      ? current === 'FAILED'
      : current === 'QUEUED' || current === 'FAILED';

  if (!allowed) {
    throw new ConflictException({
      code: 'PRINT_JOB_TRANSITION_NOT_ALLOWED',
      message: `Operazione ${action} non consentita per un lavoro ${current}.`,
    });
  }
}
