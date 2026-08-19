import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';

export type AdeSessionStatus = 'missing' | 'invalid' | 'ready';

export interface AdeSessionReadiness {
  status: AdeSessionStatus;
  reason?: string;
}

interface PlaywrightStorageState {
  cookies: unknown[];
  origins: unknown[];
}

function parseStorageState(path: string): PlaywrightStorageState {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('storage state must be a regular file');
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('storage state must be an object');
  }
  const candidate = parsed as Partial<PlaywrightStorageState>;
  if (!Array.isArray(candidate.cookies) || !Array.isArray(candidate.origins)) {
    throw new Error('storage state must contain cookies and origins arrays');
  }
  return {
    cookies: candidate.cookies,
    origins: candidate.origins,
  };
}

@Injectable()
export class AdeSessionService {
  constructor(private readonly config: AdeRuntimeConfigService) {}

  readiness(): AdeSessionReadiness {
    const path = this.config.read().storageStatePath;
    if (!path) return { status: 'missing', reason: 'path_not_configured' };
    if (!existsSync(path)) return { status: 'missing', reason: 'file_missing' };
    try {
      parseStorageState(path);
      return { status: 'ready' };
    } catch {
      return { status: 'invalid', reason: 'storage_state_unreadable' };
    }
  }

  storageStatePathForUse(): string {
    const path = this.config.read().storageStatePath;
    if (!path || !existsSync(path)) {
      throw new AdeAutomationError(
        'La sessione Agenzia delle Entrate non è configurata.',
        'ADE_SESSION_REQUIRED',
        'AUTH_REQUIRED',
        false,
      );
    }
    try {
      parseStorageState(path);
      return path;
    } catch {
      throw new AdeAutomationError(
        'La sessione Agenzia delle Entrate non è valida o leggibile.',
        'ADE_SESSION_INVALID',
        'AUTH_REQUIRED',
        false,
      );
    }
  }
}
