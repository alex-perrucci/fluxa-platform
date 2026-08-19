import { AdeWebFiscalProvider } from './ade-web-fiscal.provider';
import { FiscalProviderSafetyError } from './fiscal-provider';

describe('AdeWebFiscalProvider', () => {
  it('is registered only for ADE_WEB', () => {
    const provider = new AdeWebFiscalProvider();

    expect(provider.supports('ADE_WEB')).toBe(true);
    expect(provider.supports('MOCK')).toBe(false);
  });

  it('stops safely before any browser automation exists', async () => {
    const provider = new AdeWebFiscalProvider();

    await expect(
      provider.execute({
        documentId: '00000000-0000-4000-8000-000000000001',
        type: 'SALE',
        provider: 'ADE_WEB',
        environment: 'PRODUCTION',
        payload: {},
      }),
    ).rejects.toMatchObject<FiscalProviderSafetyError>({
      code: 'ADE_WEB_SESSION_REQUIRED',
      terminalStatus: 'AUTH_REQUIRED',
    });
  });
});
