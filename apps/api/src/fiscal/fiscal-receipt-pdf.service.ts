import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { FiscalDocumentsService } from './fiscal-documents.service';

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const DEFAULT_ADE_WORKER_BASE_URL = 'http://ade-fiscal-worker:3010';

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

    if (!['OPENAPI_SMART_RECEIPTS', 'ADE_WEB'].includes(document.provider)) {
      throw new ConflictException({
        code: 'FISCAL_RECEIPT_PDF_PROVIDER_UNSUPPORTED',
        message:
          'Il PDF ufficiale non è disponibile per il provider fiscale configurato.',
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
        message: 'Identificativo provider del documento non disponibile.',
      });
    }

    const bytes =
      document.provider === 'ADE_WEB'
        ? await this.downloadAdePdf({
            fiscalId: document.fiscalId,
            externalId: document.externalId,
          })
        : await this.downloadOpenApiPdf({
            environment: document.environment,
            externalId: document.externalId,
          });

    return {
      bytes,
      filename: this.filename(
        document.documentNumber,
        document.externalId,
        document.provider === 'ADE_WEB' ? 'ade' : 'openapi',
      ),
    };
  }

  private async downloadAdePdf(input: {
    fiscalId: string;
    externalId: string;
  }): Promise<Buffer> {
    if (!/^\d{11}$/.test(input.fiscalId)) {
      throw new ConflictException({
        code: 'ADE_RECEIPT_PDF_FISCAL_ID_INVALID',
        message: 'Partita IVA del documento AdE non valida.',
      });
    }
    if (!/^\d{1,32}$/.test(input.externalId)) {
      throw new ConflictException({
        code: 'ADE_RECEIPT_PDF_ID_INVALID',
        message:
          'Il documento non contiene un identificativo AdE valido per il recupero del PDF.',
      });
    }

    const token = process.env.ADE_WORKER_INTERNAL_TOKEN?.trim() ?? '';
    if (token.length < 32) {
      throw new ConflictException({
        code: 'ADE_WEB_INTERNAL_TOKEN_MISSING',
        message: 'Worker AdE non configurato per il recupero del PDF.',
      });
    }

    const configuredBase =
      process.env.ADE_WORKER_BASE_URL?.trim() || DEFAULT_ADE_WORKER_BASE_URL;
    let base: URL;
    try {
      base = new URL(configuredBase);
    } catch {
      throw new ConflictException({
        code: 'ADE_WEB_WORKER_URL_INVALID',
        message: 'URL interno del worker AdE non valido.',
      });
    }
    if (!['http:', 'https:'].includes(base.protocol)) {
      throw new ConflictException({
        code: 'ADE_WEB_WORKER_URL_INVALID',
        message: 'Protocollo interno del worker AdE non valido.',
      });
    }

    base.pathname = `${base.pathname.replace(/\/+$/, '')}/internal/document/artifact`;
    base.search = new URLSearchParams({
      fiscalId: input.fiscalId,
      externalId: input.externalId,
    }).toString();
    base.hash = '';

    let response: Response;
    try {
      response = await fetch(base, {
        method: 'GET',
        headers: {
          Accept: 'application/pdf',
          'x-fluxa-internal-token': token,
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new BadGatewayException({
        code: 'ADE_RECEIPT_PDF_NETWORK_ERROR',
        message: 'Impossibile recuperare il PDF ufficiale da AdE.',
      });
    }

    if (response.status === 404) {
      throw new NotFoundException({
        code: 'FISCAL_RECEIPT_PDF_NOT_FOUND',
        message: 'Documento commerciale ufficiale non disponibile su AdE.',
      });
    }
    if (response.status === 412) {
      throw new ConflictException({
        code: 'ADE_RECEIPT_PDF_AUTH_REQUIRED',
        message:
          'La sessione Agenzia delle Entrate deve essere ripristinata prima di recuperare il PDF.',
      });
    }
    if (!response.ok) {
      throw new BadGatewayException({
        code: 'ADE_RECEIPT_PDF_ERROR',
        message: 'AdE non ha restituito il documento commerciale ufficiale.',
      });
    }

    return this.validPdf(response, 'AdE');
  }

  private async downloadOpenApiPdf(input: {
    environment: string;
    externalId: string;
  }): Promise<Buffer> {
    const token = this.token(input.environment);
    if (!token) {
      throw new ConflictException({
        code:
          input.environment === 'SANDBOX'
            ? 'OPENAPI_SANDBOX_CREDENTIALS_MISSING'
            : 'OPENAPI_PRODUCTION_CREDENTIALS_MISSING',
        message: 'Credenziali OpenAPI non configurate sul server.',
      });
    }

    const configuredBase = process.env.OPENAPI_API_BASE_URL?.trim();
    const base = (
      configuredBase ||
      (input.environment === 'SANDBOX'
        ? 'https://test.invoice.openapi.com'
        : 'https://invoice.openapi.com')
    ).replace(/\/+$/, '');

    let response: Response;
    try {
      response = await fetch(
        `${base}/IT-receipts/${encodeURIComponent(input.externalId)}`,
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

    return this.validPdf(response, 'OpenAPI');
  }

  private async validPdf(response: Response, provider: string): Promise<Buffer> {
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
        message: `${provider} ha restituito un documento PDF non valido.`,
      });
    }
    return bytes;
  }

  private token(environment: string): string {
    const value =
      environment === 'SANDBOX'
        ? process.env.OPENAPI_SANDBOX_BEARER_TOKEN
        : process.env.OPENAPI_BEARER_TOKEN;
    return value?.trim() ?? '';
  }

  private filename(
    documentNumber: string | null,
    externalId: string,
    fallback: string,
  ): string {
    const source = documentNumber?.trim() || externalId;
    const safe = source
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `scontrino-fiscale-${safe || fallback}.pdf`;
  }
}
