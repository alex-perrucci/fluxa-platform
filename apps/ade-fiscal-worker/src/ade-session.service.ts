import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

function normalizedFiscalId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return /^\d{11}$/.test(normalized) ? normalized : null;
}

@Injectable()
export class AdeSessionService {
  constructor(private readonly config: AdeRuntimeConfigService) {}

  readiness(fiscalId?: string): AdeSessionReadiness {
    const path = this.resolvePath(fiscalId);
    if (!path) return { status: 'missing', reason: 'path_not_configured' };
    if (!existsSync(path)) return { status: 'missing', reason: 'file_missing' };
    try {
      parseStorageState(path);
      return { status: 'ready' };
    } catch {
      return { status: 'invalid', reason: 'storage_state_unreadable' };
    }
  }

  storageStatePathForUse(fiscalId?: string): string {
    const path = this.resolvePath(fiscalId);
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

  storageStatePathForWrite(fiscalId?: string): string {
    const path = this.resolvePath(fiscalId);
    if (!path) {
      throw new AdeAutomationError(
        'Percorso sessione Agenzia delle Entrate non configurato.',
        'ADE_SESSION_PATH_REQUIRED',
        'CONFIGURATION',
        false,
      );
    }
    const parent = dirname(path);
    try {
      if (!existsSync(parent) || !statSync(parent).isDirectory()) {
        throw new Error('session directory missing');
      }
      if (existsSync(path)) {
        const stat = lstatSync(path);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          throw new Error('storage state target must be a regular file');
        }
      }
      return path;
    } catch {
      throw new AdeAutomationError(
        'Il percorso della sessione Agenzia delle Entrate non è scrivibile in sicurezza.',
        'ADE_SESSION_PATH_INVALID',
        'CONFIGURATION',
        false,
      );
    }
  }

  private resolvePath(fiscalId?: string): string | null {
    const config = this.config.read();
    const requestedFiscalId = normalizedFiscalId(fiscalId);
    const defaultFiscalId = normalizedFiscalId(config.incaricanteCf);

    if (fiscalId !== undefined && !requestedFiscalId) return null;

    const targetFiscalId = requestedFiscalId ?? defaultFiscalId;
    if (config.storageStateDir && targetFiscalId) {
      return join(config.storageStateDir, `${targetFiscalId}.json`);
    }

    if (!config.storageStatePath) return null;

    // The legacy single-file session is safe only for the legacy default
    // incaricante. A different requested fiscal ID must never reuse it.
    if (
      requestedFiscalId &&
      (!defaultFiscalId || requestedFiscalId !== defaultFiscalId)
    ) {
      return null;
    }

    return config.storageStatePath;
  }
}
