import type { AuthContext } from '../auth/auth.types';
import type { FiscalDocumentsService } from './fiscal-documents.service';
import { FiscalReceiptPdfService } from './fiscal-receipt-pdf.service';

const auth = {} as AuthContext;

function document(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'OPENAPI_SMART_RECEIPTS',
    environment: 'SANDBOX',
    status: 'ISSUED',
    externalId: 'receipt-123',
    documentNumber: 'OPENAPI2026/1',
    ...overrides,
  };
}

describe('FiscalReceiptPdfService', () => {
  const get = jest.fn();
  const documents = { get } as unknown as FiscalDocumentsService;
  const service = new FiscalReceiptPdfService(documents);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAPI_SANDBOX_BEARER_TOKEN = 'sandbox-token';
    process.env.OPENAPI_BEARER_TOKEN = 'production-token';
    delete process.env.OPENAPI_API_BASE_URL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.OPENAPI_SANDBOX_BEARER_TOKEN;
    delete process.env.OPENAPI_BEARER_TOKEN;
    delete process.env.OPENAPI_API_BASE_URL;
  });

  it('downloads the official sandbox PDF without exposing provider credentials', async () => {
    get.mockResolvedValue(document());
    const pdf = Buffer.from('%PDF-1.7\nFluxa test');
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(pdf, {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      }),
    );

    const result = await service.download(auth, 'document-1');

    expect(result.bytes).toEqual(pdf);
    expect(result.filename).toBe('scontrino-fiscale-OPENAPI2026-1.pdf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://test.invoice.openapi.com/IT-receipts/receipt-123');
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer sandbox-token',
    );
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/pdf',
    );
  });

  it('refuses a PDF for a document that is not ready', async () => {
    get.mockResolvedValue(document({ status: 'PROCESSING' }));

    await expect(service.download(auth, 'document-2')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FISCAL_RECEIPT_PDF_NOT_READY' }),
    });
  });

  it('refuses providers that do not expose the OpenAPI receipt PDF', async () => {
    get.mockResolvedValue(document({ provider: 'ACUBE_SMART_RECEIPTS' }));

    await expect(service.download(auth, 'document-3')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'FISCAL_RECEIPT_PDF_PROVIDER_UNSUPPORTED',
      }),
    });
  });

  it('rejects a non-PDF provider response', async () => {
    get.mockResolvedValue(document());
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'not a pdf' }), { status: 200 }),
    );

    await expect(service.download(auth, 'document-4')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FISCAL_RECEIPT_PDF_INVALID' }),
    });
  });
});
