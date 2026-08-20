import { Injectable } from '@nestjs/common';

const DEFAULT_NAVIGATION_TIMEOUT_MS = 20_000;
const DEFAULT_MFA_TIMEOUT_MS = 180_000;
const MIN_NAVIGATION_TIMEOUT_MS = 1_000;
const MAX_NAVIGATION_TIMEOUT_MS = 60_000;
const MIN_MFA_TIMEOUT_MS = 30_000;
const MAX_MFA_TIMEOUT_MS = 300_000;
const MIN_INTERNAL_TOKEN_LENGTH = 32;

export interface AdeRuntimeConfig {
  dryRunEnabled: boolean;
  submitEnabled: boolean;
  internalToken: string | null;
  entryUrl: string | null;
  authEntryUrl: string | null;
  storageStatePath: string | null;
  selectorProfilePath: string | null;
  authProfilePath: string | null;
  cieUsernameFile: string | null;
  ciePasswordFile: string | null;
  incaricanteCf: string | null;
  navigationTimeoutMs: number;
  mfaTimeoutMs: number;
}

function optionalString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function parseBoundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

@Injectable()
export class AdeRuntimeConfigService {
  read(): AdeRuntimeConfig {
    return {
      dryRunEnabled: parseBoolean(process.env.ADE_DRY_RUN_ENABLED),
      submitEnabled: parseBoolean(process.env.ADE_SUBMIT_ENABLED),
      internalToken: optionalString(process.env.ADE_WORKER_INTERNAL_TOKEN),
      entryUrl: optionalString(process.env.ADE_WEB_ENTRY_URL),
      authEntryUrl: optionalString(process.env.ADE_AUTH_ENTRY_URL),
      storageStatePath: optionalString(process.env.ADE_STORAGE_STATE_PATH),
      selectorProfilePath: optionalString(
        process.env.ADE_SELECTOR_PROFILE_PATH,
      ),
      authProfilePath: optionalString(process.env.ADE_AUTH_PROFILE_PATH),
      cieUsernameFile: optionalString(process.env.ADE_CIE_USERNAME_FILE),
      ciePasswordFile: optionalString(process.env.ADE_CIE_PASSWORD_FILE),
      incaricanteCf: optionalString(process.env.ADE_INCARICANTE_CF),
      navigationTimeoutMs: parseBoundedInt(
        process.env.ADE_NAVIGATION_TIMEOUT_MS,
        DEFAULT_NAVIGATION_TIMEOUT_MS,
        MIN_NAVIGATION_TIMEOUT_MS,
        MAX_NAVIGATION_TIMEOUT_MS,
      ),
      mfaTimeoutMs: parseBoundedInt(
        process.env.ADE_MFA_TIMEOUT_MS,
        DEFAULT_MFA_TIMEOUT_MS,
        MIN_MFA_TIMEOUT_MS,
        MAX_MFA_TIMEOUT_MS,
      ),
    };
  }

  validatedInternalToken(): string | null {
    const token = this.read().internalToken;
    return token && token.length >= MIN_INTERNAL_TOKEN_LENGTH ? token : null;
  }

  validatedEntryUrl(): URL | null {
    return this.validatedHttpsUrl(this.read().entryUrl);
  }

  validatedAuthEntryUrl(): URL | null {
    return this.validatedHttpsUrl(this.read().authEntryUrl);
  }

  private validatedHttpsUrl(raw: string | null): URL | null {
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
