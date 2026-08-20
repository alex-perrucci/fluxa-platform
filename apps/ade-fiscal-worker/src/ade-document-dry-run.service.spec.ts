import { AdeAuthService } from './ade-auth.service';
import { AdeAutomationError } from './ade-automation-error';
import { AdeDocumentBrowserService } from './ade-document-browser.service';
import { AdeDocumentDryRunService } from './ade-document-dry-run.service';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSessionService } from './ade-session.service';

const DOCUMENT_INPUT = {
  items: [
    {
      description: 'Caffè',
      quantity: 1,
      grossUnitPriceCents: 130,
      vatRate: 10,
    },
  ],
  payment: { cashCents: 130, electronicCents: 0 },
};

const BROWSER_SUCCESS = {
  finalUrl: 'https://example.invalid/document',
  confirmationBoundarySeen: true as const,
  cancelledAtBoundary: true as const,
  itemCount: 1,
  grossTotalCents: 130,
  paymentTotalCents: 130,
  submitAttempted: false as const,
  canSubmit: false as const,
};

function serviceWithDependencies(options: {
  browser: AdeDocumentBrowserService;
  auth?: AdeAuthService;
  session?: AdeSessionService;
}): AdeDocumentDryRunService {
  const config = {
    read: () => ({
      dryRunEnabled: true,
      entryUrl: 'https://example.invalid/ade',
      navigationTimeoutMs: 20_000,
    }),
    validatedEntryUrl: () => new URL('https://example.invalid/ade'),
  } as unknown as AdeRuntimeConfigService;
  const session =
    options.session ??
    ({
      storageStatePathForUse: () => '/runtime/storage-state.json',
    } as unknown as AdeSessionService);
  const auth =
    options.auth ??
    ({
      refresh: () =>
        Promise.resolve({
          status: 'SESSION_READY' as const,
          finalUrl: 'https://example.invalid/ade',
          sessionSaved: true as const,
        }),
    } as unknown as AdeAuthService);

  return new AdeDocumentDryRunService(config, session, options.browser, auth);
}

describe('AdeDocumentDryRunService', () => {
  it('returns an explicitly non-submitting result', async () => {
    const browser = {
      dryRun: () => Promise.resolve(BROWSER_SUCCESS),
    } as unknown as AdeDocumentBrowserService;

    const result = await serviceWithDependencies({ browser }).run(
      DOCUMENT_INPUT,
    );

    expect(result.status).toBe('DOCUMENT_READY_NOT_SUBMITTED');
    expect(result.confirmationBoundarySeen).toBe(true);
    expect(result.cancelledAtBoundary).toBe(true);
    expect(result.submitAttempted).toBe(false);
    expect(result.canSubmit).toBe(false);
  });

  it('refreshes an expired portal session once and retries the document', async () => {
    const dryRun = jest
      .fn()
      .mockRejectedValueOnce(
        new AdeAutomationError(
          'Documento Commerciale on line non disponibile.',
          'ADE_DOCUMENT_FLOW_MISMATCH',
          'SELECTOR_MISMATCH',
          false,
        ),
      )
      .mockResolvedValueOnce(BROWSER_SUCCESS);
    const browser = { dryRun } as unknown as AdeDocumentBrowserService;
    const refresh = jest.fn().mockResolvedValue({
      status: 'SESSION_READY',
      finalUrl: 'https://example.invalid/ade',
      sessionSaved: true,
    });
    const auth = { refresh } as unknown as AdeAuthService;

    const result = await serviceWithDependencies({ browser, auth }).run(
      DOCUMENT_INPUT,
    );

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(dryRun).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('DOCUMENT_READY_NOT_SUBMITTED');
    expect(result.submitAttempted).toBe(false);
    expect(result.canSubmit).toBe(false);
  });

  it('refreshes when the persisted session is missing', async () => {
    let sessionAttempts = 0;
    const session = {
      storageStatePathForUse: () => {
        sessionAttempts += 1;
        if (sessionAttempts === 1) {
          throw new AdeAutomationError(
            'La sessione Agenzia delle Entrate non è configurata.',
            'ADE_SESSION_REQUIRED',
            'AUTH_REQUIRED',
            false,
          );
        }
        return '/runtime/storage-state.json';
      },
    } as unknown as AdeSessionService;
    const dryRun = jest.fn().mockResolvedValue(BROWSER_SUCCESS);
    const browser = { dryRun } as unknown as AdeDocumentBrowserService;
    const refresh = jest.fn().mockResolvedValue({
      status: 'SESSION_READY',
      finalUrl: 'https://example.invalid/ade',
      sessionSaved: true,
    });
    const auth = { refresh } as unknown as AdeAuthService;

    const result = await serviceWithDependencies({
      browser,
      auth,
      session,
    }).run(DOCUMENT_INPUT);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sessionAttempts).toBe(2);
    expect(dryRun).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('DOCUMENT_READY_NOT_SUBMITTED');
  });

  it('does not treat later document selector failures as expired sessions', async () => {
    const dryRun = jest
      .fn()
      .mockRejectedValue(
        new AdeAutomationError(
          'Conferma preliminare del documento non disponibile.',
          'ADE_DOCUMENT_FLOW_MISMATCH',
          'SELECTOR_MISMATCH',
          false,
        ),
      );
    const browser = { dryRun } as unknown as AdeDocumentBrowserService;
    const refresh = jest.fn();
    const auth = { refresh } as unknown as AdeAuthService;

    await expect(
      serviceWithDependencies({ browser, auth }).run(DOCUMENT_INPUT),
    ).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_FLOW_MISMATCH',
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(dryRun).toHaveBeenCalledTimes(1);
  });

  it('retries only once after a successful session refresh', async () => {
    const sessionError = new AdeAutomationError(
      'Documento Commerciale on line non disponibile.',
      'ADE_DOCUMENT_FLOW_MISMATCH',
      'SELECTOR_MISMATCH',
      false,
    );
    const dryRun = jest.fn().mockRejectedValue(sessionError);
    const browser = { dryRun } as unknown as AdeDocumentBrowserService;
    const refresh = jest.fn().mockResolvedValue({
      status: 'SESSION_READY',
      finalUrl: 'https://example.invalid/ade',
      sessionSaved: true,
    });
    const auth = { refresh } as unknown as AdeAuthService;

    await expect(
      serviceWithDependencies({ browser, auth }).run(DOCUMENT_INPUT),
    ).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_FLOW_MISMATCH',
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(dryRun).toHaveBeenCalledTimes(2);
  });

  it('rejects a payment total different from the document total', async () => {
    const service = serviceWithDependencies({
      browser: {} as AdeDocumentBrowserService,
    });

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
    const service = serviceWithDependencies({
      browser: {} as AdeDocumentBrowserService,
    });

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
