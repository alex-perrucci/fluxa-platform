import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';

export interface AdeAuthProfile {
  version: 2;
  cieTabSelector: string;
  enterWithCieSelector: string;
  usernameSelector: string;
  passwordSelector: string;
  credentialsSubmitSelector: string;
  postMfaContinueSelector: string;
  serviceSearchSelector: string;
  serviceLinkSelector: string;
  serviceAccessButtonSelector: string;
  workProfileRadioSelector: string;
  workProfileProceedSelector: string;
  workProfileSelectLabel: string;
  workProfileConfirmSelector: string;
  finalMarker?: string;
}

const REQUIRED_KEYS = [
  'cieTabSelector',
  'enterWithCieSelector',
  'usernameSelector',
  'passwordSelector',
  'credentialsSubmitSelector',
  'postMfaContinueSelector',
  'serviceSearchSelector',
  'serviceLinkSelector',
  'serviceAccessButtonSelector',
  'workProfileRadioSelector',
  'workProfileProceedSelector',
  'workProfileSelectLabel',
  'workProfileConfirmSelector',
] as const;

const ALLOWED_KEYS = new Set<string>([
  'version',
  ...REQUIRED_KEYS,
  'finalMarker',
]);

function requiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
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
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`unsupported auth profile key: ${key}`);
    }
  }
  if (record.version !== 2) {
    throw new Error('auth profile version must be 2');
  }

  return {
    version: 2,
    cieTabSelector: requiredString(record, 'cieTabSelector'),
    enterWithCieSelector: requiredString(record, 'enterWithCieSelector'),
    usernameSelector: requiredString(record, 'usernameSelector'),
    passwordSelector: requiredString(record, 'passwordSelector'),
    credentialsSubmitSelector: requiredString(
      record,
      'credentialsSubmitSelector',
    ),
    postMfaContinueSelector: requiredString(
      record,
      'postMfaContinueSelector',
    ),
    serviceSearchSelector: requiredString(record, 'serviceSearchSelector'),
    serviceLinkSelector: requiredString(record, 'serviceLinkSelector'),
    serviceAccessButtonSelector: requiredString(
      record,
      'serviceAccessButtonSelector',
    ),
    workProfileRadioSelector: requiredString(
      record,
      'workProfileRadioSelector',
    ),
    workProfileProceedSelector: requiredString(
      record,
      'workProfileProceedSelector',
    ),
    workProfileSelectLabel: requiredString(record, 'workProfileSelectLabel'),
    workProfileConfirmSelector: requiredString(
      record,
      'workProfileConfirmSelector',
    ),
    finalMarker: optionalString(record, 'finalMarker'),
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
