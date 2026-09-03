import { AdeAuthService } from './ade-auth.service';
import { AdeAutomationError } from './ade-automation-error';
import { AdeDcoFastSubmitService } from './ade-dco-fast-submit.service';
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

const FAST_SUCCESS = {
  confirmationEvidence: 'HTTP_RECONCILED' as const,
  externalId: 'ade-transaction-1',
  documentNumber: '11',
  documentDate: '2026-09-03',
  submitAttempted: true as const,
};

function serviceWithDependencies(options: {
  browser: AdeDocumentSubmitBrowserService;
  fastSubmit?: AdeDcoFastSubmitService;
  auth?: AdeAuthService;
  session?: AdeSessionService;
  operationLock?: AdeDocumentOperationLockService;
  submitEnabled?: boolean;
  httpFastSubmitEnabled?: boolean;
}): AdeDocumentSubmitService {
  const config = {
    read: () => ({
      submitEnabled: options.submitEnabled ?? true,
      httpFastSubmitEnabled: options.httpFastSubmitEnabled ?? false,
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
  const fastSubmit =
    options.fastSubmit ??
    ({ submit: jest.fn() } as unknown as AdeDcoFastSubmitService);
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
    fastSubmit,
    auth,
    operationLock,
  );
}

describe('AdeDocumentSubmitService', () => {
  it('keeps the browser transport as the default while the fast flag is off', async () => {
    const submit = jest.fn().mockResolvedValue(BROWSER_SUCCESS);
    const browser = { submit } as unknown as AdeDocumentSubmitBrowserService;

    const result = await serviceWithDependencies({ browser }).run(
      DOCUMENT_INPUT,
    );

    expect(result.status).toBe('DOCUMENT_SUBMITTED_CONFIRMED');
    expect(result.operationId).toBe(DOCUMENT_INPUT.operationId);
    expect(result.transport).toBe('BROWSER');
    expect(result.confirmationEvidence).toBe('PDF_ACTION');
    expect(result.externalId).toBeNull();
    expect(result.submitAttempted).toBe(true);
    expect(result.canSubmit).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('uses the HTTP fast transport only when explicitly enabled', async () => {
    const browserSubmit = jest.fn();
    const browser = {
      submit: browserSubmit,
    } as unknown as AdeDocumentSubmitBrowserService;
    const fastSubmitCall = jest.fn().mockResolvedValue(FAST_SUCCESS);
    const fastSubmit = {
      submit: fastSubmitCall,
    } as unknown as AdeDcoFastSubmitService;

    const result = await serviceWithDependencies({
      browser,
      fastSubmit,
      httpFastSubmitEnabled: true,
    }).run(DOCUMENT_INPUT);

    expect(result).toMatchObject({
      status: 'DOCUMENT_SUBMITTED_CONFIRMED',
      transport: 'HTTP_FAST',
      confirmationBoundarySeen: false,
      confirmationEvidence: 'HTTP_RECONCILED',
      externalId: 'ade-transaction-1',
      documentNumber: '11',
      documentDate: '2026-09-03',
      submitAttempted: true,
    });
    expect(fastSubmitCall).toHaveBeenCalledTimes(1);
    expect(browserSubmit).not.toHaveBeenCalled();
  });

  it('falls back to browser only for a pre-submit unsupported fast-path shape', async () => {
    const browserSubmit = jest.fn().mockResolvedValue(BROWSER_SUCCESS);
    const browser = {
      submit: browserSubmit,
    } as unknown as AdeDocumentSubmitBrowserService;
    const fastSubmitCall = jest.fn().mockRejectedValue(
      new AdeAutomationError(
        'unsupported fiscal shape',
        'ADE_DCO_FAST_PATH_UNAVAILABLE',
        'CONFIGURATION',
        true,
      ),
    );
    const fastSubmit = {
      submit: fastSubmitCall,
    } as unknown as AdeDcoFastSubmitService;

    const result = await serviceWithDependencies({
      browser,
      fastSubmit,
      httpFastSubmitEnabled: true,
    }).run(DOCUMENT_INPUT);

    expect(result.transport).toBe('BROWSER');
    expect(fastSubmitCall).toHaveBeenCalledTimes(1);
    expect(browserSubmit).toHaveBeenCalledTimes(1);
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

  it('refreshes one expired browser session only before Procedi for the same fiscal id', async () => {
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

  it('refreshes a fast-path 401 exactly once and retries HTTP before any POST ambiguity', async () => {
    const browserSubmit = jest.fn();
    const browser = {
      submit: browserSubmit,
    } as unknown as AdeDocumentSubmitBrowserService;
    const fastSubmitCall = jest
      .fn()
      .mockRejectedValueOnce(
        new AdeAutomationError(
          'Bootstrap DCO non autorizzato.',
          'ADE_SESSION_INVALID',
          'AUTH_REQUIRED',
          false,
        ),
      )
      .mockResolvedValueOnce(FAST_SUCCESS);
    const fastSubmit = {
      submit: fastSubmitCall,
    } as unknown as AdeDcoFastSubmitService;
    const refresh = jest.fn().mockResolvedValue({
      status: 'SESSION_READY',
      finalUrl: 'https://example.invalid/ade',
      sessionSaved: true,
    });
    const auth = { refresh } as unknown as AdeAuthService;

    const result = await serviceWithDependencies({
      browser,
      fastSubmit,
      auth,
      httpFastSubmitEnabled: true,
    }).run(DOCUMENT_INPUT);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(DOCUMENT_INPUT.fiscalId);
    expect(fastSubmitCall).toHaveBeenCalledTimes(2);
    expect(browserSubmit).not.toHaveBeenCalled();
    expect(result.transport).toBe('HTTP_FAST');
  });

  it('uses browser after one refresh if the internal HTTP surface still returns 401 pre-submit', async () => {
    const browserSubmit = jest.fn().mockResolvedValue(BROWSER_SUCCESS);
    const browser = {
      submit: browserSubmit,
    } as unknown as AdeDocumentSubmitBrowserService;
    const fastSubmitCall = jest.fn().mockRejectedValue(
      new AdeAutomationError(
        'Bootstrap DCO non autorizzato.',
        'ADE_SESSION_INVALID',
        'AUTH_REQUIRED',
        false,
      ),
    );
    const fastSubmit = {
      submit: fastSubmitCall,
    } as unknown as AdeDcoFastSubmitService;
    const refresh = jest.fn().mockResolvedValue({
      status: 'SESSION_READY',
      finalUrl: 'https://example.invalid/ade',
      sessionSaved: true,
    });
    const auth = { refresh } as unknown as AdeAuthService;

    const result = await serviceWithDependencies({
      browser,
      fastSubmit,
      auth,
      httpFastSubmitEnabled: true,
    }).run(DOCUMENT_INPUT);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fastSubmitCall).toHaveBeenCalledTimes(2);
    expect(browserSubmit).toHaveBeenCalledTimes(1);
    expect(result.transport).toBe('BROWSER');
  });

  it('does not refresh or retry when the DCO upstream is unavailable', async () => {
    const submit = jest.fn().mockRejectedValue(
      new AdeAutomationError(
        'Servizio DCO non disponibile.',
        'ADE_UPSTREAM_UNAVAILABLE',
        'NAVIGATION',
        true,
      ),
    );
    const browser = { submit } as unknown as AdeDocumentSubmitBrowserService;
    const refresh = jest.fn();
    const auth = { refresh } as unknown as AdeAuthService;

    await expect(
      serviceWithDependencies({ browser, auth }).run(DOCUMENT_INPUT),
    ).rejects.toMatchObject({
      code: 'ADE_UPSTREAM_UNAVAILABLE',
      retrySafe: true,
      submitAttempted: false,
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('never falls back to browser or retries an ambiguous HTTP POST', async () => {
    const browserSubmit = jest.fn();
    const browser = {
      submit: browserSubmit,
    } as unknown as AdeDocumentSubmitBrowserService;
    const fastSubmitCall = jest.fn().mockRejectedValue(
      new AdeAutomationError(
        'Esito HTTP non verificabile.',
        'ADE_DOCUMENT_SUBMIT_UNKNOWN',
        'SUBMIT_UNKNOWN',
        false,
        true,
      ),
    );
    const fastSubmit = {
      submit: fastSubmitCall,
    } as unknown as AdeDcoFastSubmitService;
    const refresh = jest.fn();
    const auth = { refresh } as unknown as AdeAuthService;
    const service = serviceWithDependencies({
      browser,
      fastSubmit,
      auth,
      httpFastSubmitEnabled: true,
    });

    await expect(service.run(DOCUMENT_INPUT)).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_SUBMIT_UNKNOWN',
      submitAttempted: true,
      retrySafe: false,
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(fastSubmitCall).toHaveBeenCalledTimes(1);
    expect(browserSubmit).not.toHaveBeenCalled();
  });

  it('blocks the same operationId after an ambiguous post-submit attempt', async () => {
    const submit = jest.fn().mockRejectedValue(
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

  it('rejects a missing or invalid fiscal id before opening any transport', async () => {
    const browserSubmit = jest.fn();
    const browser = {
      submit: browserSubmit,
    } as unknown as AdeDocumentSubmitBrowserService;
    const fastSubmitCall = jest.fn();
    const fastSubmit = {
      submit: fastSubmitCall,
    } as unknown as AdeDcoFastSubmitService;
    const service = serviceWithDependencies({
      browser,
      fastSubmit,
      httpFastSubmitEnabled: true,
    });

    await expect(
      service.run({ ...DOCUMENT_INPUT, fiscalId: 'invalid' }),
    ).rejects.toMatchObject({
      code: 'ADE_DOCUMENT_INPUT_INVALID',
      submitAttempted: false,
    });
    expect(browserSubmit).not.toHaveBeenCalled();
    expect(fastSubmitCall).not.toHaveBeenCalled();
  });

  it('does not permit submit while the production gate is disabled', async () => {
    const browser = {} as AdeDocumentSubmitBrowserService;
    const service = serviceWithDependencies({
      browser,
      submitEnabled: false,
      httpFastSubmitEnabled: true,
    });

    await expect(service.run(DOCUMENT_INPUT)).rejects.toMatchObject({
      code: 'ADE_SUBMIT_DISABLED',
      submitAttempted: false,
    });
  });
});
