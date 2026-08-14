import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { FiscalDocumentsService } from './fiscal-documents.service';

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export interface FiscalReceiptPdf {
  bytes: Buffer;
  filename: string;
}

@Injectable()
export class FiscalReceiptPdfService {
  constructor(private readonly documents: FiscalDocumentsService) {}

  async download(
    auth: AuthContext,
    documentId: string,
  ): Promise<FiscalReceiptPdf> {
    const document = await this.documents.get(auth, documentId);

    if (document.provider !== 'OPENAPI_SMART_RECEIPTS') {
      throw new ConflictException({
        code: 'FISCAL_RECEIPT_PDF_PROVIDER_UNSUPPORTED',
        message: 'Il PDF ufficiale è disponibile solo per documenti OpenAPI.',
      });
    }
    if (!['ISSUED', 'VOIDED'].includes(document.status)) {
      throw new ConflictException({
        code: 'FISCAL_RECEIPT_PDF_NOT_READY',
        message: 'Il documento fiscale non è ancora pronto per il PDF.',
      });
    }
    if (!document.externalId) {
      throw new ConflictException({
        code: 'FISCAL_RECEIPT_PDF_ID_MISSING',
        message: 'Identificativo OpenAPI del documento non disponibile.',
      });
    }

    const token = this.token(document.environment);
    if (!token) {
      throw new ConflictException({
        code:
          document.environment === 'SANDBOX'
            ? 'OPENAPI_SANDBOX_CREDENTIALS_MISSING'
            : 'OPENAPI_PRODUCTION_CREDENTIALS_MISSING',
        message: 'Credenziali OpenAPI non configurate sul server.',
      });
    }

    const configuredBase = process.env.OPENAPI_API_BASE_URL?.trim();
    const base = (
      configuredBase ||
      (document.environment === 'SANDBOX'
        ? 'https://test.invoice.openapi.com'
        : 'https://invoice.openapi.com')
    ).replace(/\/+$/, '');

    let response: Response;
    try {
      response = await fetch(
        `${base}/IT-receipts/${encodeURIComponent(document.externalId)}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/pdf',
            'Content-Type': 'application/pdf',
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch {
      throw new BadGatewayException({
        code: 'OPENAPI_RECEIPT_PDF_NETWORK_ERROR',
        message: 'Impossibile recuperare il PDF fiscale da OpenAPI.',
      });
    }

    if (response.status === 404) {
      throw new NotFoundException({
        code: 'FISCAL_RECEIPT_PDF_NOT_FOUND',
        message: 'PDF fiscale non disponibile sul provider.',
      });
    }
    if (!response.ok) {
      throw new BadGatewayException({
        code: 'OPENAPI_RECEIPT_PDF_ERROR',
        message: 'OpenAPI non ha restituito il PDF fiscale.',
      });
    }

    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_PDF_BYTES) {
      throw new BadGatewayException({
        code: 'FISCAL_RECEIPT_PDF_TOO_LARGE',
        message: 'Il PDF fiscale supera la dimensione massima consentita.',
      });
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      bytes.length === 0 ||
      bytes.length > MAX_PDF_BYTES ||
      bytes.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      throw new BadGatewayException({
        code: 'FISCAL_RECEIPT_PDF_INVALID',
        message: 'OpenAPI ha restituito un documento PDF non valido.',
      });
    }

    return {
      bytes,
      filename: this.filename(document.documentNumber, document.externalId),
    };
  }

  private token(environment: string): string {
    const value =
      environment === 'SANDBOX'
        ? process.env.OPENAPI_SANDBOX_BEARER_TOKEN
        : process.env.OPENAPI_BEARER_TOKEN;
    return value?.trim() ?? '';
  }

  private filename(documentNumber: string | null, externalId: string): string {
    const source = documentNumber?.trim() || externalId;
    const safe = source
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `scontrino-fiscale-${safe || 'openapi'}.pdf`;
  }
}
