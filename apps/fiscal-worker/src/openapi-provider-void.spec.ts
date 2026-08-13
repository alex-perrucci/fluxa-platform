import {
  FiscalProviderError,
  FiscalProviderService,
} from './fiscal-provider.service';

function json(data: Record<string, unknown>) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('OpenAPI Smart Receipts void flow', () => {
  beforeEach(() => {
    process.env.OPENAPI_BEARER_TOKEN = 'test-value';
    delete process.env.OPENAPI_API_BASE_URL;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.OPENAPI_BEARER_TOKEN;
    delete process.env.OPENAPI_API_BASE_URL;
  });

  it('voids the parent and tracks the returned void receipt', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        json({ success: true, data: { id: 'void-1', status: 'voided' } }),
      );
    const service = new FiscalProviderService();

    const result = await service.execute({
      documentId: 'local-void',
      type: 'VOID',
      provider: 'OPENAPI_SMART_RECEIPTS',
      environment: 'PRODUCTION',
      payload: { externalId: 'receipt-parent' },
    });

    expect(result.externalId).toBe('void-1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://invoice.openapi.com/IT-receipts/receipt-parent',
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE');
  });

  it('does not retry a provider rejection', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        json({
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
        documentId: 'local-sale',
        type: 'SALE',
        provider: 'OPENAPI_SMART_RECEIPTS',
        environment: 'PRODUCTION',
        payload: {
          fiscal_id: '03154790343',
          items: [
            {
              quantity: '1.00',
              description: 'Menu',
              unit_price: '10.00',
              vat_rate_code: '10',
            },
          ],
          cash_payment_amount: '10.00',
        },
      }),
    ).rejects.toMatchObject<Partial<FiscalProviderError>>({
      retryable: false,
      code: 'ADE_REJECTED',
      externalId: 'receipt-failed',
    });
  });
});
