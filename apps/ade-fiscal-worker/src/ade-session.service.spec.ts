import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSessionService } from './ade-session.service';

function withEnv(path: string | undefined, fn: () => void): void {
  const previous = process.env.ADE_STORAGE_STATE_PATH;
  if (path === undefined) delete process.env.ADE_STORAGE_STATE_PATH;
  else process.env.ADE_STORAGE_STATE_PATH = path;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.ADE_STORAGE_STATE_PATH;
    else process.env.ADE_STORAGE_STATE_PATH = previous;
  }
}

describe('AdeSessionService', () => {
  it('reports a valid Playwright storage state without exposing its contents', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fluxa-ade-session-'));
    const path = join(dir, 'storage-state.json');
    writeFileSync(
      path,
      JSON.stringify({
        cookies: [{ name: 'session', value: 'secret-cookie' }],
        origins: [],
      }),
    );

    try {
      withEnv(path, () => {
        const service = new AdeSessionService(new AdeRuntimeConfigService());
        expect(service.readiness()).toEqual({ status: 'ready' });
        expect(service.storageStatePathForUse()).toBe(path);
        expect(JSON.stringify(service.readiness())).not.toContain(
          'secret-cookie',
        );
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when the session path is not configured', () => {
    withEnv(undefined, () => {
      const service = new AdeSessionService(new AdeRuntimeConfigService());
      expect(service.readiness().status).toBe('missing');
      expect(() => service.storageStatePathForUse()).toThrow(
        'La sessione Agenzia delle Entrate non è configurata.',
      );
    });
  });

  it('treats an absent mounted session file as missing, not corrupt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fluxa-ade-session-'));
    const path = join(dir, 'storage-state.json');

    try {
      withEnv(path, () => {
        const service = new AdeSessionService(new AdeRuntimeConfigService());
        expect(service.readiness()).toEqual({
          status: 'missing',
          reason: 'file_missing',
        });
        expect(() => service.storageStatePathForUse()).toThrow(
          'La sessione Agenzia delle Entrate non è configurata.',
        );
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when storage state is malformed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fluxa-ade-session-'));
    const path = join(dir, 'storage-state.json');
    writeFileSync(path, JSON.stringify({ cookies: [] }));

    try {
      withEnv(path, () => {
        const service = new AdeSessionService(new AdeRuntimeConfigService());
        expect(service.readiness().status).toBe('invalid');
        expect(() => service.storageStatePathForUse()).toThrow(
          'La sessione Agenzia delle Entrate non è valida o leggibile.',
        );
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
