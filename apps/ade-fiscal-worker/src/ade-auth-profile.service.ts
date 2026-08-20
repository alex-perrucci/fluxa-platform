import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';

export interface AdeAuthProfile {
  version: 1;
  enterWithCieSelector: string;
  level2Selector?: string;
  usernameSelector: string;
  passwordSelector: string;
  credentialsSubmitSelector: string;
  waitingMfaMarker?: string;
  postMfaContinueSelector?: string;
  authenticatedMarker: string;
}

const ALLOWED_KEYS = new Set([
  'version',
  'enterWithCieSelector',
  'level2Selector',
  'usernameSelector',
  'passwordSelector',
  'credentialsSubmitSelector',
  'waitingMfaMarker',
  'postMfaContinueSelector',
  'authenticatedMarker',
]);

function requiredSelector(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value.trim();
}

function optionalSelector(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value.trim();
}

function readProfile(path: string): AdeAuthProfile {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('auth profile must be a regular file');
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('auth profile must be an object');
  }
  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) throw new Error(`unsupported auth profile key: ${key}`);
  }
  if (record.version !== 1) throw new Error('auth profile version must be 1');

  return {
    version: 1,
    enterWithCieSelector: requiredSelector(record, 'enterWithCieSelector'),
    level2Selector: optionalSelector(record, 'level2Selector'),
    usernameSelector: requiredSelector(record, 'usernameSelector'),
    passwordSelector: requiredSelector(record, 'passwordSelector'),
    credentialsSubmitSelector: requiredSelector(record, 'credentialsSubmitSelector'),
    waitingMfaMarker: optionalSelector(record, 'waitingMfaMarker'),
    postMfaContinueSelector: optionalSelector(record, 'postMfaContinueSelector'),
    authenticatedMarker: requiredSelector(record, 'authenticatedMarker'),
  };
}

@Injectable()
export class AdeAuthProfileService {
  constructor(private readonly config: AdeRuntimeConfigService) {}

  readiness(): 'missing' | 'invalid' | 'configured' {
    const path = this.config.read().authProfilePath;
    if (!path || !existsSync(path)) return 'missing';
    try {
      readProfile(path);
      return 'configured';
    } catch {
      return 'invalid';
    }
  }

  loadForUse(): AdeAuthProfile {
    const path = this.config.read().authProfilePath;
    if (!path || !existsSync(path)) {
      throw new AdeAutomationError(
        'Profilo autenticazione CIE non configurato.',
        'ADE_AUTH_PROFILE_REQUIRED',
        'CONFIGURATION',
        false,
      );
    }
    try {
      return readProfile(path);
    } catch {
      throw new AdeAutomationError(
        'Profilo autenticazione CIE non valido.',
        'ADE_AUTH_PROFILE_INVALID',
        'CONFIGURATION',
        false,
      );
    }
  }
}
