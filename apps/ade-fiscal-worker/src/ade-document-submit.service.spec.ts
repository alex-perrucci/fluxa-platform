import { AdeAuthService } from './ade-auth.service';
import { AdeAutomationError } from './ade-automation-error';
import { AdeDocumentOperationLockService } from './ade-document-operation-lock.service';
import { AdeDocumentSubmitBrowserService } from './ade-document-submit-browser.service';
import { AdeDocumentSubmitService } from './ade-document-submit.service';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSessionService } from './ade-session.service';

const DOCUMENT_INPUT = {
  operationId: '00000000-0000-4000-8000-000000000001',
  fiscalId: '03154790343',
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
  confirmationEvidence: 'PDF_ACTION' as const,
  itemCount: 1,
  grossTotalCents: 130,
  paymentTotalCents: 130,
  submitAttempted: true as const,
};

function serviceWithDependencies(options: {
  browser: AdeDocumentSubmitBrowserService;
  auth?: AdeAuthService;
  session?: AdeSessionService;
  operationLock?: AdeDocumentOperationLockService;
  submitEnabled?: boolean;
}): AdeDocumentSubmitService {
  const config = {
    read: () => ({
      submitEnabled: options.submitEnabled ?? true,
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
  const operationLock =
    options.operationLock ?? new AdeDocumentOperationLockService();

  return new AdeDocumentSubmitService(
    config,
    session,
    options.browser,
    auth,
    operationLock,
  );
}

describe('AdeDocumentSubmitService', () => {
  it('returns confirmed only after the browser reports post-submit evidence', async () => {
    const submit = jest.fn().mockResolvedValue(BROWSER_SUCCESS);
    const browser = { submit } as unknown as AdeDocumentSubmitBrowserService;

    const result = await serviceWithDependencies({ browser }).run(
      DOCUMENT_INPUT,
    );

    expect(result.status).toBe('DOCUMENT_SUBMITTED_CONFIRMED');
    expect(result.operationId).toBe(DOCUMENT_INPUT.operationId);
    expect(result.confirmationEvidence).toBe('PDF_ACTION');
    expect(result.submitAttempted).toBe(true);
    expect(result.canSubmit).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('uses the fiscal-id-specific session for the document', async () => {
    const submit = jest.fn().mockResolvedValue(BROWSER_SUCCESS);
    const browser = { submit } as unknown as AdeDocumentSubmitBrowserService;
    const storageStatePathForUse = jest
      .fn()
      .mockReturnValue('/runtime/client.json');
    const session = { storageStatePathForUse } as unknown as AdeSessionService;

    await serviceWithDependencies({ browser, session }).run(DOCUMENT_INPUT);

    expect(storageStatePathForUse).toHaveBeenCalledWith(
      DOCUMENT_INPUT.fiscalId,
    );
  });

  it('acquires the operation lock with the fiscal id', async () => {
    const submit = jest.fn().mockResolvedValue(BROWSER_SUCCESS);
    const browser = { submit } as unknown as AdeDocumentSubmitBrowserService;
    const release = jest.fn();
    const tryAcquire = jest.fn().mockReturnValue(release);
    const operationLock = {
      tryAcquire,
    } as unknown as AdeDocumentOperationLockService;

    await serviceWithDependencies({ browser, operationLock }).run(
      DOCUMENT_INPUT,
    );

    expect(tryAcquire).toHaveBeenCalledWith(DOCUMENT_INPUT.fiscalId);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('refreshes one expired session only before Procedi for the same fiscal id', async () => {
    const submit = jest
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
    const browser = { submit } as unknown as AdeDocumentSubmitBrowserService;
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
    expect(refresh).toHaveBeenCalledWith(DOCUMENT_INPUT.fiscalId);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('DOCUMENT_SUBMITTED_CONFIRMED');
  });

  it('never refreshes or retries an ambiguous error after Procedi', async () => {
    const submit = jest
      .fn()
      .mockRejectedValue(
        new AdeAutomationError(
          'Esito non verificabile.',
          'ADE_DOCUMENT_SUBMIT_UNKNOWN',
          'SUBMIT_UNKNOWN',
          false,
          true,
        ),
      );
    const browser = { submit } as unknown as AdeDocumentSubmitBrowserService;
    const refresh = jest.fn();
    const auth = { refresh } as unknown as AdeAuthService;
    const service = serviceWithDependencies({ browser, auth });

    await expect(service.run(DOCUMENT_INPUT)).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_SUBMIT_UNKNOWN',
      submitAttempted: true,
      retrySafe: false,
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('blocks the same operationId after an ambiguous post-submit attempt', async () => {
    const submit = jest
      .fn()
      .mockRejectedValue(
        new AdeAutomationError(
          'Esito non verificabile.',
          'ADE_DOCUMENT_SUBMIT_UNKNOWN',
          'SUBMIT_UNKNOWN',
          false,
          true,
        ),
      );
    const browser = { submit } as unknown as AdeDocumentSubmitBrowserService;
    const service = serviceWithDependencies({ browser });

    await expect(service.run(DOCUMENT_INPUT)).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_SUBMIT_UNKNOWN',
    });
    await expect(service.run(DOCUMENT_INPUT)).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_SUBMIT_DUPLICATE_OPERATION',
      submitAttempted: true,
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing or invalid fiscal id before opening the browser', async () => {
    const submit = jest.fn();
    const browser = { submit } as unknown as AdeDocumentSubmitBrowserService;
    const service = serviceWithDependencies({ browser });

    await expect(
      service.run({ ...DOCUMENT_INPUT, fiscalId: 'invalid' }),
    ).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_INPUT_INVALID',
      submitAttempted: false,
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it('does not permit submit while the production gate is disabled', async () => {
    const browser = {} as AdeDocumentSubmitBrowserService;
    const service = serviceWithDependencies({
      browser,
      submitEnabled: false,
    });

    await expect(service.run(DOCUMENT_INPUT)).rejects.toMatchObject({
      code: 'ADE_SUBMIT_DISABLED',
      submitAttempted: false,
    });
  });
});
