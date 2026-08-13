import {
  FiscalProviderError,
  FiscalProviderService,
} from './fiscal-provider.service';

function response(
  data: Record<string, unknown>,
  status = 200,
): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

const salePayload = {
  fiscal_id: '03154790343',
  items: [
    {
      quantity: '1.00',
      description: 'Menu pranzo',
      unit_price: '12.50',
      vat_rate_code: '10',
      discount: '0.50',
    },
  ],
  cash_payment_amount: '12.00',
  electronic_payment_amount: '0.00',
  lottery_code: 'ab12cd34',
  email: 'not-forwarded@example.com',
};

describe('FiscalProviderService OpenAPI Smart Receipts', () => {
  const previousToken = process.env.OPENAPI_BEARER_TOKEN;
  const previousBase = process.env.OPENAPI_API_BASE_URL;

  beforeEach(() => {
    process.env.OPENAPI_BEARER_TOKEN = 'openapi-test-token';
    delete process.env.OPENAPI_API_BASE_URL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousToken === undefined) delete process.env.OPENAPI_BEARER_TOKEN;
    else process.env.OPENAPI_BEARER_TOKEN = previousToken;
    if (previousBase === undefined) delete process.env.OPENAPI_API_BASE_URL;
    else process.env.OPENAPI_API_BASE_URL = previousBase;
  });

  it('posts a sanitized Smart Receipt payload to the sandbox endpoint', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      response({
        success: true,
        data: {
          id: 'receipt-1',
          status: 'ready',
          document_number: '42',
          document_date: '2026-08-13',
        },
      }),
    );
    const service = new FiscalProviderService();

    const result = await service.execute({
      documentId: 'local-1',
      type: 'SALE',
      provider: 'OPENAPI_SMART_RECEIPTS',
      environment: 'SANDBOX',
      payload: salePayload,
    });

    expect(result.externalId).toBe('receipt-1');
    expect(result.externalStatus).toBe('ready');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://test.invoice.openapi.com/IT-receipts',
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('email');
    expect(body).toMatchObject({
      fiscal_id: '03154790343',
      cash_payment_amount: 12,
      electronic_payment_amount: 0,
      lottery_code: 'AB12CD34',
    });
    expect(body.items).toEqual([
      {
        quantity: 1,
        description: 'Menu pranzo',
        unit_price: 12.5,
        vat_rate_code: '10',
        discount: 0.5,
      },
    ]);
  });

  it('returns a retryable error with the remote id for pending receipts', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      response({
        success: true,
        data: { id: 'receipt-pending', status: 'submitted' },
      }),
    );
    const service = new FiscalProviderService();

    await expect(
      service.execute({
        documentId: 'local-2',
        type: 'SALE',
        provider: 'OPENAPI_SMART_RECEIPTS',
        environment: 'PRODUCTION',
        payload: salePayload,
      }),
    ).rejects.toMatchObject<Partial<FiscalProviderError>>({
      retryable: true,
      code: 'OPENAPI_RECEIPT_PENDING',
      externalId: 'receipt-pending',
      externalStatus: 'submitted',
    });
  });

  it('polls an existing remote receipt instead of posting again', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      response({
        success: true,
        data: { id: 'receipt-existing', status: 'ready' },
      }),
    );
    const service = new FiscalProviderService();

    await service.execute({
      documentId: 'local-3',
      type: 'SALE',
      provider: 'OPENAPI_SMART_RECEIPTS',
      environment: 'PRODUCTION',
      payload: salePayload,
      externalId: 'receipt-existing',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://invoice.openapi.com/IT-receipts/receipt-existing',
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('GET');
  });

  it('voids the parent receipt and tracks the new void receipt id', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      response({
        success: true,
        data: { id: 'void-1', status: 'voided' },
      }),
    );
    const service = new FiscalProviderService();

    const result = await service.execute({
      documentId: 'local-void',
      type: 'VOID',
      provider: 'OPENAPI_SMART_RECEIPTS',
      environment: 'PRODUCTION',
      payload: { externalId: 'receipt-parent', reason: 'refund' },
    });

    expect(result.externalId).toBe('void-1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://invoice.openapi.com/IT-receipts/receipt-parent',
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE');
  });

  it('does not retry a receipt rejected by the provider', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      response({
        success: true,
        data: {
          id: 'receipt-failed',
          status: 'failed',
          error_code: 'ADE_REJECTED',
          error_message: 'Rejected',
        },
      }),
    );
    const service = new FiscalProviderService();

    await expect(
      service.execute({
        documentId: 'local-4',
        type: 'SALE',
        provider: 'OPENAPI_SMART_RECEIPTS',
        environment: 'PRODUCTION',
        payload: salePayload,
      }),
    ).rejects.toMatchObject<Partial<FiscalProviderError>>({
      retryable: false,
      code: 'ADE_REJECTED',
      externalId: 'receipt-failed',
      externalStatus: 'failed',
    });
  });
});
