import { AdeBrowserService } from './ade-browser.service';
import { AdeDryRunService } from './ade-dry-run.service';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSelectorProfileService } from './ade-selector-profile.service';
import { AdeSessionService } from './ade-session.service';

function configuredService(): AdeDryRunService {
  const config = {
    read: () => ({
      dryRunEnabled: true,
      internalToken: 'internal-token',
      entryUrl: 'https://example.invalid/ade',
      storageStatePath: '/runtime/storage-state.json',
      selectorProfilePath: null,
      navigationTimeoutMs: 20_000,
    }),
    validatedEntryUrl: () => new URL('https://example.invalid/ade'),
  } as unknown as AdeRuntimeConfigService;
  const session = {
    storageStatePathForUse: () => '/runtime/storage-state.json',
  } as unknown as AdeSessionService;
  const selectors = {
    loadForUse: () => null,
  } as unknown as AdeSelectorProfileService;
  const browser = {
    navigateReadOnly: () =>
      Promise.resolve({
        finalUrl: 'https://example.invalid/ade',
        markersChecked: [] as Array<'authenticated' | 'receipt_area'>,
      }),
  } as unknown as AdeBrowserService;

  return new AdeDryRunService(config, session, selectors, browser);
}

describe('AdeDryRunService', () => {
  it('returns an explicitly non-submitting result', async () => {
    const result = await configuredService().run();

    expect(result.status).toBe('NAVIGATION_VERIFIED');
    expect(result.submitAttempted).toBe(false);
    expect(result.canSubmit).toBe(false);
  });

  it('refuses to run when the feature flag is disabled', async () => {
    const config = {
      read: () => ({
        dryRunEnabled: false,
        internalToken: null,
        entryUrl: null,
        storageStatePath: null,
        selectorProfilePath: null,
        navigationTimeoutMs: 20_000,
      }),
      validatedEntryUrl: () => null,
    } as unknown as AdeRuntimeConfigService;

    const service = new AdeDryRunService(
      config,
      {} as AdeSessionService,
      {} as AdeSelectorProfileService,
      {} as AdeBrowserService,
    );

    await expect(service.run()).rejects.toMatchObject({
      code: 'ADE_DRY_RUN_DISABLED',
      retrySafe: false,
    });
  });
});
