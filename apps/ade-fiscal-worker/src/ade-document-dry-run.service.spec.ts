import { AdeDocumentBrowserService } from './ade-document-browser.service';
import { AdeDocumentDryRunService } from './ade-document-dry-run.service';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSessionService } from './ade-session.service';

function serviceWithBrowser(
  browser: AdeDocumentBrowserService,
): AdeDocumentDryRunService {
  const config = {
    read: () => ({
      dryRunEnabled: true,
      entryUrl: 'https://example.invalid/ade',
      navigationTimeoutMs: 20_000,
    }),
    validatedEntryUrl: () => new URL('https://example.invalid/ade'),
  } as unknown as AdeRuntimeConfigService;
  const session = {
    storageStatePathForUse: () => '/runtime/storage-state.json',
  } as unknown as AdeSessionService;

  return new AdeDocumentDryRunService(config, session, browser);
}

describe('AdeDocumentDryRunService', () => {
  it('returns an explicitly non-submitting result', async () => {
    const browser = {
      dryRun: () =>
        Promise.resolve({
          finalUrl: 'https://example.invalid/document',
          confirmationBoundarySeen: true as const,
          cancelledAtBoundary: true as const,
          itemCount: 1,
          grossTotalCents: 130,
          paymentTotalCents: 130,
          submitAttempted: false as const,
          canSubmit: false as const,
        }),
    } as unknown as AdeDocumentBrowserService;

    const result = await serviceWithBrowser(browser).run({
      items: [
        {
          description: 'Caffè',
          quantity: 1,
          grossUnitPriceCents: 130,
          vatRate: 10,
        },
      ],
      payment: { cashCents: 130, electronicCents: 0 },
    });

    expect(result.status).toBe('DOCUMENT_READY_NOT_SUBMITTED');
    expect(result.confirmationBoundarySeen).toBe(true);
    expect(result.cancelledAtBoundary).toBe(true);
    expect(result.submitAttempted).toBe(false);
    expect(result.canSubmit).toBe(false);
  });

  it('rejects a payment total different from the document total', async () => {
    const service = serviceWithBrowser({} as AdeDocumentBrowserService);

    await expect(
      service.run({
        items: [
          {
            description: 'Caffè',
            quantity: 1,
            grossUnitPriceCents: 130,
            vatRate: 10,
          },
        ],
        payment: { cashCents: 100, electronicCents: 0 },
      }),
    ).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_INPUT_INVALID',
      retrySafe: false,
    });
  });

  it('rejects unsupported VAT rates before browser automation starts', async () => {
    const service = serviceWithBrowser({} as AdeDocumentBrowserService);

    await expect(
      service.run({
        items: [
          {
            description: 'Test',
            quantity: 1,
            grossUnitPriceCents: 100,
            vatRate: 7,
          },
        ],
        payment: { cashCents: 100, electronicCents: 0 },
      }),
    ).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_INPUT_INVALID',
      retrySafe: false,
    });
  });
});
