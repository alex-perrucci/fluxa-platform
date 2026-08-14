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
    process.env.OPENAPI_BEARER_TOKEN = 'production-token-value';
    process.env.OPENAPI_SANDBOX_BEARER_TOKEN = 'sandbox-token-value';
    delete process.env.OPENAPI_API_BASE_URL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.OPENAPI_BEARER_TOKEN;
    delete process.env.OPENAPI_SANDBOX_BEARER_TOKEN;
    delete process.env.OPENAPI_API_BASE_URL;
  });

  it('maps the sale payload and uses the sandbox endpoint and token', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
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
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sandbox-token-value',
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

  it('persists enough metadata to poll a pending production receipt', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
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

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer production-token-value',
    );
  });

  it('uses GET when a remote id is already known', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
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

  it('fails closed when the sandbox token is missing', async () => {
    delete process.env.OPENAPI_SANDBOX_BEARER_TOKEN;
    const service = new FiscalProviderService();

    await expect(
      service.execute({
        documentId: 'local-4',
        type: 'SALE',
        provider: 'OPENAPI_SMART_RECEIPTS',
        environment: 'SANDBOX',
        payload,
      }),
    ).rejects.toMatchObject<Partial<FiscalProviderError>>({
      retryable: false,
      code: 'OPENAPI_SANDBOX_CREDENTIALS_MISSING',
    });
  });
});
