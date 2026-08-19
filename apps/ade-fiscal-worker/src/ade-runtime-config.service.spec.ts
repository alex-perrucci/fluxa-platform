import { AdeRuntimeConfigService } from './ade-runtime-config.service';

const managedKeys = ['ADE_WORKER_INTERNAL_TOKEN', 'ADE_WEB_ENTRY_URL'] as const;

function withEnvironment(
  values: Partial<Record<(typeof managedKeys)[number], string>>,
  fn: () => void,
): void {
  const previous = Object.fromEntries(
    managedKeys.map((key) => [key, process.env[key]]),
  ) as Record<(typeof managedKeys)[number], string | undefined>;

  for (const key of managedKeys) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    fn();
  } finally {
    for (const key of managedKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('AdeRuntimeConfigService', () => {
  it('requires at least 32 characters for the internal token', () => {
    withEnvironment({ ADE_WORKER_INTERNAL_TOKEN: 'too-short' }, () => {
      const service = new AdeRuntimeConfigService();
      expect(service.validatedInternalToken()).toBeNull();
    });

    const strongToken = 'a'.repeat(32);
    withEnvironment({ ADE_WORKER_INTERNAL_TOKEN: strongToken }, () => {
      const service = new AdeRuntimeConfigService();
      expect(service.validatedInternalToken()).toBe(strongToken);
    });
  });

  it('accepts only HTTPS entry URLs', () => {
    withEnvironment({ ADE_WEB_ENTRY_URL: 'http://example.invalid/ade' }, () => {
      const service = new AdeRuntimeConfigService();
      expect(service.validatedEntryUrl()).toBeNull();
    });

    withEnvironment(
      { ADE_WEB_ENTRY_URL: 'https://example.invalid/ade' },
      () => {
        const service = new AdeRuntimeConfigService();
        expect(service.validatedEntryUrl()?.protocol).toBe('https:');
      },
    );
  });
});
