import {
  FiscalProviderError,
  FiscalProviderService,
} from './fiscal-provider.service';

const payload = {
  fiscal_id: '03154790343',
  items: [
    {
      quantity: '1.00',
      description: 'Menu',
      unit_price: '12.00',
      vat_rate_code: '10',
    },
  ],
  cash_payment_amount: '12.00',
  electronic_payment_amount: '0.00',
  email: 'ignored@example.com',
};

function json(data: Record<string, unknown>) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('OpenAPI Smart Receipts provider', () => {
  beforeEach(() => {
    process.env.OPENAPI_BEARER_TOKEN = 'test-value';
    delete process.env.OPENAPI_API_BASE_URL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.OPENAPI_BEARER_TOKEN;
    delete process.env.OPENAPI_API_BASE_URL;
  });

  it('maps the sale payload and strips unsupported fields', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      json({ success: true, data: { id: 'r-1', status: 'ready' } }),
    );
    const service = new FiscalProviderService();

    await service.execute({
      documentId: 'local-1',
      type: 'SALE',
      provider: 'OPENAPI_SMART_RECEIPTS',
      environment: 'SANDBOX',
      payload,
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    if (typeof init.body !== 'string') throw new Error('Expected JSON body');
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://test.invoice.openapi.com/IT-receipts',
    );
    expect(body.email).toBeUndefined();
    expect(body.cash_payment_amount).toBe(12);
    expect(body.items).toEqual([
      {
        quantity: 1,
        description: 'Menu',
        unit_price: 12,
        vat_rate_code: '10',
      },
    ]);
  });

  it('persists enough metadata to poll a pending receipt', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      json({ success: true, data: { id: 'r-pending', status: 'submitted' } }),
    );
    const service = new FiscalProviderService();

    await expect(
      service.execute({
        documentId: 'local-2',
        type: 'SALE',
        provider: 'OPENAPI_SMART_RECEIPTS',
        environment: 'PRODUCTION',
        payload,
      }),
    ).rejects.toMatchObject<Partial<FiscalProviderError>>({
      retryable: true,
      code: 'OPENAPI_RECEIPT_PENDING',
      externalId: 'r-pending',
      externalStatus: 'submitted',
    });
  });

  it('uses GET when a remote id is already known', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(() =>
      json({ success: true, data: { id: 'r-known', status: 'ready' } }),
    );
    const service = new FiscalProviderService();

    await service.execute({
      documentId: 'local-3',
      type: 'SALE',
      provider: 'OPENAPI_SMART_RECEIPTS',
      environment: 'PRODUCTION',
      payload,
      externalId: 'r-known',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://invoice.openapi.com/IT-receipts/r-known',
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('GET');
  });
});
