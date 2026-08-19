import { Injectable } from '@nestjs/common';

const DEFAULT_NAVIGATION_TIMEOUT_MS = 20_000;
const MIN_NAVIGATION_TIMEOUT_MS = 1_000;
const MAX_NAVIGATION_TIMEOUT_MS = 60_000;

export interface AdeRuntimeConfig {
  dryRunEnabled: boolean;
  internalToken: string | null;
  entryUrl: string | null;
  storageStatePath: string | null;
  selectorProfilePath: string | null;
  navigationTimeoutMs: number;
}

function optionalString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function parseTimeout(value: string | undefined): number {
  if (!value) return DEFAULT_NAVIGATION_TIMEOUT_MS;
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_NAVIGATION_TIMEOUT_MS ||
    parsed > MAX_NAVIGATION_TIMEOUT_MS
  ) {
    return DEFAULT_NAVIGATION_TIMEOUT_MS;
  }
  return parsed;
}

@Injectable()
export class AdeRuntimeConfigService {
  read(): AdeRuntimeConfig {
    return {
      dryRunEnabled: parseBoolean(process.env.ADE_DRY_RUN_ENABLED),
      internalToken: optionalString(process.env.ADE_WORKER_INTERNAL_TOKEN),
      entryUrl: optionalString(process.env.ADE_WEB_ENTRY_URL),
      storageStatePath: optionalString(process.env.ADE_STORAGE_STATE_PATH),
      selectorProfilePath: optionalString(process.env.ADE_SELECTOR_PROFILE_PATH),
      navigationTimeoutMs: parseTimeout(process.env.ADE_NAVIGATION_TIMEOUT_MS),
    };
  }

  validatedEntryUrl(): URL | null {
    const raw = this.read().entryUrl;
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') return null;
      return url;
    } catch {
      return null;
    }
  }
}
