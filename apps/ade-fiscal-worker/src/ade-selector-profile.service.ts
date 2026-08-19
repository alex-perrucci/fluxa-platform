import { lstatSync, readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { AdeAutomationError } from './ade-automation-error';
import { AdeRuntimeConfigService } from './ade-runtime-config.service';

export interface AdeSelectorProfile {
  version: 1;
  authenticatedMarker?: string;
  receiptAreaMarker?: string;
}

export type AdeSelectorProfileStatus = 'empty' | 'invalid' | 'configured';

const ALLOWED_KEYS = new Set([
  'version',
  'authenticatedMarker',
  'receiptAreaMarker',
]);

function optionalSelector(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('selector must be a non-empty string');
  }
  return value.trim();
}

function readProfile(path: string): AdeSelectorProfile {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('selector profile must be a regular file');
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('selector profile must be an object');
  }

  const record = parsed as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`unsupported selector profile key: ${key}`);
    }
  }
  if (record.version !== 1)
    throw new Error('selector profile version must be 1');

  return {
    version: 1,
    authenticatedMarker: optionalSelector(record.authenticatedMarker),
    receiptAreaMarker: optionalSelector(record.receiptAreaMarker),
  };
}

@Injectable()
export class AdeSelectorProfileService {
  constructor(private readonly config: AdeRuntimeConfigService) {}

  readiness(): AdeSelectorProfileStatus {
    const path = this.config.read().selectorProfilePath;
    if (!path) return 'empty';
    try {
      readProfile(path);
      return 'configured';
    } catch {
      return 'invalid';
    }
  }

  loadForUse(): AdeSelectorProfile | null {
    const path = this.config.read().selectorProfilePath;
    if (!path) return null;
    try {
      return readProfile(path);
    } catch {
      throw new AdeAutomationError(
        'Il profilo selector AdE non è valido.',
        'ADE_SELECTOR_PROFILE_INVALID',
        'CONFIGURATION',
        false,
      );
    }
  }
}
