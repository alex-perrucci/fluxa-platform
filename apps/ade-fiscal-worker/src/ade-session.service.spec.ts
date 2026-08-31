import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';
import { AdeSessionService } from './ade-session.service';

const managedKeys = [
  'ADE_STORAGE_STATE_PATH',
  'ADE_STORAGE_STATE_DIR',
  'ADE_INCARICANTE_CF',
] as const;

function withEnv(
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

describe('AdeSessionService', () => {
  it('reports a valid legacy Playwright storage state without exposing its contents', () => {
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
      withEnv({ ADE_STORAGE_STATE_PATH: path }, () => {
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

  it('resolves a dedicated session file for each fiscal id', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fluxa-ade-session-'));
    const first = '03154790343';
    const second = '03053300343';
    writeFileSync(
      join(dir, `${first}.json`),
      JSON.stringify({ cookies: [], origins: [] }),
    );
    writeFileSync(
      join(dir, `${second}.json`),
      JSON.stringify({ cookies: [], origins: [] }),
    );

    try {
      withEnv({ ADE_STORAGE_STATE_DIR: dir }, () => {
        const service = new AdeSessionService(new AdeRuntimeConfigService());
        expect(service.storageStatePathForUse(first)).toBe(
          join(dir, `${first}.json`),
        );
        expect(service.storageStatePathForUse(second)).toBe(
          join(dir, `${second}.json`),
        );
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never reuses the legacy session for a different incaricante', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fluxa-ade-session-'));
    const path = join(dir, 'storage-state.json');
    writeFileSync(path, JSON.stringify({ cookies: [], origins: [] }));

    try {
      withEnv(
        {
          ADE_STORAGE_STATE_PATH: path,
          ADE_INCARICANTE_CF: '03154790343',
        },
        () => {
          const service = new AdeSessionService(new AdeRuntimeConfigService());
          expect(service.storageStatePathForUse('03154790343')).toBe(path);
          expect(() => service.storageStatePathForUse('03053300343')).toThrow(
            'La sessione Agenzia delle Entrate non è configurata.',
          );
        },
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when the session path is not configured', () => {
    withEnv({}, () => {
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
      withEnv({ ADE_STORAGE_STATE_PATH: path }, () => {
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
      withEnv({ ADE_STORAGE_STATE_PATH: path }, () => {
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
