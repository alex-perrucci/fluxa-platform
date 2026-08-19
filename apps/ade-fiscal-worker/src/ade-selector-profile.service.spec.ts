import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSelectorProfileService } from './ade-selector-profile.service';

function withEnv(path: string, fn: () => void): void {
  const previous = process.env.ADE_SELECTOR_PROFILE_PATH;
  process.env.ADE_SELECTOR_PROFILE_PATH = path;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.ADE_SELECTOR_PROFILE_PATH;
    else process.env.ADE_SELECTOR_PROFILE_PATH = previous;
  }
}

describe('AdeSelectorProfileService', () => {
  it('accepts marker-only selector profiles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fluxa-ade-selectors-'));
    const path = join(dir, 'selectors.json');
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        authenticatedMarker: '[data-test="logged-in"]',
        receiptAreaMarker: '#receipt-area',
      }),
    );

    try {
      withEnv(path, () => {
        const service = new AdeSelectorProfileService(
          new AdeRuntimeConfigService(),
        );
        expect(service.readiness()).toBe('configured');
        expect(service.loadForUse()).toEqual({
          version: 1,
          authenticatedMarker: '[data-test="logged-in"]',
          receiptAreaMarker: '#receipt-area',
        });
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a missing optional selector file as an empty profile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fluxa-ade-selectors-'));
    const path = join(dir, 'selectors.json');

    try {
      withEnv(path, () => {
        const service = new AdeSelectorProfileService(
          new AdeRuntimeConfigService(),
        );
        expect(service.readiness()).toBe('empty');
        expect(service.loadForUse()).toBeNull();
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects submit or other actionable selector keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fluxa-ade-selectors-'));
    const path = join(dir, 'selectors.json');
    writeFileSync(
      path,
      JSON.stringify({ version: 1, submitButton: '#emit-receipt' }),
    );

    try {
      withEnv(path, () => {
        const service = new AdeSelectorProfileService(
          new AdeRuntimeConfigService(),
        );
        expect(service.readiness()).toBe('invalid');
        expect(() => service.loadForUse()).toThrow(
          'Il profilo selector AdE non è valido.',
        );
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
