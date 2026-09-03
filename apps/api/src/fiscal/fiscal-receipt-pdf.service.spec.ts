import { ConflictException } from '@nestjs/common';
import type { AuthContext } from '../auth/auth.types';
import { FiscalDocumentsService } from './fiscal-documents.service';
import { FiscalReceiptPdfService } from './fiscal-receipt-pdf.service';

const AUTH = {} as AuthContext;

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    provider: 'ADE_WEB',
    status: 'ISSUED',
    environment: 'PRODUCTION',
    fiscalId: '03053300343',
    externalId: '233367613',
    documentNumber: 'DCW2026/3339-6020',
    ...overrides,
  };
}

describe('FiscalReceiptPdfService ADE_WEB', () => {
  const originalToken = process.env.ADE_WORKER_INTERNAL_TOKEN;
  const originalBase = process.env.ADE_WORKER_BASE_URL;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalToken === undefined) {
      delete process.env.ADE_WORKER_INTERNAL_TOKEN;
    } else {
      process.env.ADE_WORKER_INTERNAL_TOKEN = originalToken;
    }
    if (originalBase === undefined) {
      delete process.env.ADE_WORKER_BASE_URL;
    } else {
      process.env.ADE_WORKER_BASE_URL = originalBase;
    }
  });

  it('proxies the official AdE PDF through the internal worker', async () => {
    process.env.ADE_WORKER_INTERNAL_TOKEN = 'x'.repeat(32);
    process.env.ADE_WORKER_BASE_URL = 'http://ade-fiscal-worker:3010';

    const get = jest.fn().mockResolvedValue(document());
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(Buffer.from('%PDF-1.4\ntest'), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      }),
    );
    const service = new FiscalReceiptPdfService({
      get,
    } as unknown as FiscalDocumentsService);

    const result = await service.download(AUTH, 'doc-1');

    expect(result.bytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(result.filename).toBe('scontrino-fiscale-DCW2026-3339-6020.pdf');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const call = fetchSpy.mock.calls[0];
    expect(call).toBeDefined();
    const url = call?.[0];
    const init = call?.[1];
    expect(url).toBeInstanceOf(URL);
    if (!(url instanceof URL)) throw new Error('Expected worker URL instance.');
    expect(url.origin).toBe('http://ade-fiscal-worker:3010');
    expect(url.pathname).toBe('/internal/document/artifact');
    expect(url.searchParams.get('fiscalId')).toBe('03053300343');
    expect(url.searchParams.get('externalId')).toBe('233367613');
    expect(init?.headers).toMatchObject({
      Accept: 'application/pdf',
      'x-fluxa-internal-token': 'x'.repeat(32),
    });
  });

  it('refuses a synthetic ADE_WEB correlation instead of querying AdE', async () => {
    process.env.ADE_WORKER_INTERNAL_TOKEN = 'x'.repeat(32);

    const get = jest
      .fn()
      .mockResolvedValue(document({ externalId: 'ADE-WEB:doc-1' }));
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new FiscalReceiptPdfService({
      get,
    } as unknown as FiscalDocumentsService);

    try {
      await service.download(AUTH, 'doc-1');
      throw new Error('Expected ADE PDF validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      if (!(error instanceof ConflictException)) throw error;
      expect(error.getResponse()).toMatchObject({
        code: 'ADE_RECEIPT_PDF_ID_INVALID',
      });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
