import { FiscalProviderError } from '../fiscal-provider.service';
import { AdeWebFiscalProvider } from './ade-web-fiscal.provider';
import { FiscalProviderSafetyError } from './fiscal-provider';

const documentId = '00000000-0000-4000-8000-000000000001';

function input() {
  return {
    documentId,
    type: 'SALE' as const,
    provider: 'ADE_WEB' as const,
    environment: 'PRODUCTION' as const,
    payload: {
      fiscal_id: '03154790343',
      items: [
        {
          quantity: '1.00',
          description: 'Caffe',
          unit_price: '1.30',
          vat_rate_code: '10',
          discount: undefined as string | undefined,
        },
      ],
      cash_payment_amount: '1.30',
      electronic_payment_amount: '0.00',
    },
  };
}

describe('AdeWebFiscalProvider', () => {
  const previousToken = process.env.ADE_WORKER_INTERNAL_TOKEN;
  const previousCf = process.env.ADE_INCARICANTE_CF;
  const previousBase = process.env.ADE_WORKER_BASE_URL;

  beforeEach(() => {
    process.env.ADE_WORKER_INTERNAL_TOKEN = 'x'.repeat(32);
    process.env.ADE_INCARICANTE_CF = '99999999999';
    process.env.ADE_WORKER_BASE_URL = 'http://ade-fiscal-worker:3010';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousToken === undefined)
      delete process.env.ADE_WORKER_INTERNAL_TOKEN;
    else process.env.ADE_WORKER_INTERNAL_TOKEN = previousToken;
    if (previousCf === undefined) delete process.env.ADE_INCARICANTE_CF;
    else process.env.ADE_INCARICANTE_CF = previousCf;
    if (previousBase === undefined) delete process.env.ADE_WORKER_BASE_URL;
    else process.env.ADE_WORKER_BASE_URL = previousBase;
  });

  it('is registered only for ADE_WEB', () => {
    const provider = new AdeWebFiscalProvider();
    expect(provider.supports('ADE_WEB')).toBe(true);
    expect(provider.supports('MOCK')).toBe(false);
  });

  it('propagates the fiscal profile id even when it differs from the legacy default', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'DOCUMENT_SUBMITTED_CONFIRMED',
          operationId: documentId,
          confirmationEvidence: 'PDF_ACTION',
          submitAttempted: true,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );

    await new AdeWebFiscalProvider().execute(input());

    const request = fetchMock.mock.calls[0]?.[1];
    expect(typeof request?.body).toBe('string');
    const body: unknown =
      typeof request?.body === 'string' ? JSON.parse(request.body) : {};
    expect(body).toMatchObject({
      operationId: documentId,
      fiscalId: '03154790343',
    });
  });

  it('keeps the Fluxa correlation for confirmed browser submissions', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'DOCUMENT_SUBMITTED_CONFIRMED',
          operationId: documentId,
          transport: 'BROWSER',
          confirmationEvidence: 'PDF_ACTION',
          finalUrl:
            'https://ivaservizi.agenziaentrate.gov.it/ser/documenticommercialionline/',
          submitAttempted: true,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await new AdeWebFiscalProvider().execute(input());
    expect(result.externalStatus).toBe('issued');
    expect(result.externalId).toBe(`ADE-WEB:${documentId}`);
    expect(result.documentNumber).toBeNull();
    expect(result.response).toMatchObject({
      transport: 'BROWSER',
      externalIdKind: 'fluxa-correlation',
      confirmationEvidence: 'PDF_ACTION',
      submitAttempted: true,
    });
  });

  it('persists real idtrx, progressivo and date from a reconciled HTTP fast submit', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'DOCUMENT_SUBMITTED_CONFIRMED',
          operationId: documentId,
          transport: 'HTTP_FAST',
          confirmationEvidence: 'HTTP_RECONCILED',
          externalId: 'ade-idtrx-123',
          documentNumber: '00000123',
          documentDate: '2026-09-03',
          submitAttempted: true,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await new AdeWebFiscalProvider().execute(input());

    expect(result).toMatchObject({
      externalId: 'ade-idtrx-123',
      externalStatus: 'issued',
      documentNumber: '00000123',
      documentDate: '2026-09-03',
    });
    expect(result.response).toMatchObject({
      transport: 'HTTP_FAST',
      externalIdKind: 'ade-idtrx',
      confirmationEvidence: 'HTTP_RECONCILED',
      documentNumber: '00000123',
      documentDate: '2026-09-03',
      submitAttempted: true,
    });
  });

  it('rejects an invalid fiscal id before calling the worker', async () => {
    const request = input();
    request.payload.fiscal_id = 'invalid';
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(
      new AdeWebFiscalProvider().execute(request),
    ).rejects.toMatchObject<Partial<FiscalProviderError>>({
      code: 'ADE_WEB_FISCAL_ID_INVALID',
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns a transport failure into terminal UNKNOWN', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('connection lost'));

    await expect(
      new AdeWebFiscalProvider().execute(input()),
    ).rejects.toMatchObject<Partial<FiscalProviderSafetyError>>({
      code: 'ADE_WEB_TRANSPORT_UNKNOWN',
      terminalStatus: 'UNKNOWN',
    });
  });

  it('turns a post-submit worker ambiguity into terminal UNKNOWN', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'ADE_DOCUMENT_SUBMIT_UNKNOWN',
          message: 'unknown',
          submitAttempted: true,
          retrySafe: false,
        }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      new AdeWebFiscalProvider().execute(input()),
    ).rejects.toMatchObject<Partial<FiscalProviderSafetyError>>({
      code: 'ADE_DOCUMENT_SUBMIT_UNKNOWN',
      terminalStatus: 'UNKNOWN',
    });
  });

  it('rejects unsupported discounts before calling the worker', async () => {
    const request = input();
    request.payload.items[0].discount = '0.10';

    await expect(
      new AdeWebFiscalProvider().execute(request),
    ).rejects.toMatchObject<Partial<FiscalProviderError>>({
      code: 'ADE_WEB_DISCOUNT_NOT_SUPPORTED',
      retryable: false,
    });
  });
});
