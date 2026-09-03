import { statSync } from 'node:fs';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { request, type APIRequestContext } from 'playwright';
import { AdeAutomationError } from './ade-automation-error';
import { adeSessionPoolMax } from './ade-submit-observability';

const DCO_ORIGIN = 'https://ivaservizi.agenziaentrate.gov.it';
const ALLOWED_READ_PREFIXES = ['/ser/api/', '/common/'] as const;

interface ReusableApiContext {
  fingerprint: string;
  context: APIRequestContext;
}

export interface AdeDcoHttpReadResult<T = unknown> {
  status: number;
  path: string;
  contentType: string;
  body: T;
}

export function validateAdeDcoReadPath(rawPath: string): string {
  const value = rawPath.trim();
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('://')
  ) {
    throw new AdeAutomationError(
      'Percorso DCO read-only non valido.',
      'ADE_CONFIGURATION_INVALID',
      'CONFIGURATION',
      false,
    );
  }

  let url: URL;
  try {
    url = new URL(value, DCO_ORIGIN);
  } catch {
    throw new AdeAutomationError(
      'Percorso DCO read-only non valido.',
      'ADE_CONFIGURATION_INVALID',
      'CONFIGURATION',
      false,
    );
  }

  if (
    url.origin !== DCO_ORIGIN ||
    url.hash ||
    !ALLOWED_READ_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    throw new AdeAutomationError(
      'Percorso DCO read-only fuori allowlist.',
      'ADE_CONFIGURATION_INVALID',
      'CONFIGURATION',
      false,
    );
  }

  return `${url.pathname}${url.search}`;
}

@Injectable()
export class AdeDcoHttpClient implements OnApplicationShutdown {
  private readonly contexts = new Map<string, ReusableApiContext>();
  private readonly maxContexts = adeSessionPoolMax();

  async getJson<T = unknown>(input: {
    storageStatePath: string;
    path: string;
    timeoutMs: number;
  }): Promise<AdeDcoHttpReadResult<T>> {
    const path = validateAdeDcoReadPath(input.path);
    const context = await this.contextForSession(input.storageStatePath);

    let response;
    try {
      response = await context.get(`${DCO_ORIGIN}${path}`, {
        timeout: input.timeoutMs,
        failOnStatusCode: false,
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      throw new AdeAutomationError(
        error instanceof Error
          ? `Lettura DCO non riuscita: ${error.message}`
          : 'Lettura DCO non riuscita.',
        'ADE_NAVIGATION_FAILED',
        'NAVIGATION',
        true,
      );
    }

    if (response.status() === 401 || response.status() === 403) {
      await this.reset(input.storageStatePath);
      throw new AdeAutomationError(
        'Sessione Agenzia delle Entrate non valida per la lettura DCO.',
        'ADE_SESSION_INVALID',
        'AUTH_REQUIRED',
        false,
      );
    }

    if (!response.ok()) {
      throw new AdeAutomationError(
        `Lettura DCO fallita con HTTP ${response.status()}.`,
        'ADE_NAVIGATION_FAILED',
        'NAVIGATION',
        true,
      );
    }

    const contentType = response.headers()['content-type'] ?? '';
    if (!contentType.toLowerCase().includes('json')) {
      throw new AdeAutomationError(
        'La lettura DCO non ha restituito JSON.',
        'ADE_NAVIGATION_FAILED',
        'NAVIGATION',
        true,
      );
    }

    let body: T;
    try {
      body = (await response.json()) as T;
    } catch {
      throw new AdeAutomationError(
        'La risposta JSON DCO non è leggibile.',
        'ADE_NAVIGATION_FAILED',
        'NAVIGATION',
        true,
      );
    }

    return {
      status: response.status(),
      path,
      contentType,
      body,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.reset();
  }

  private async contextForSession(
    storageStatePath: string,
  ): Promise<APIRequestContext> {
    const fingerprint = this.sessionFingerprint(storageStatePath);
    const existing = this.contexts.get(storageStatePath);

    if (existing && existing.fingerprint === fingerprint) {
      this.touch(storageStatePath, existing);
      return existing.context;
    }
    if (existing) await this.reset(storageStatePath);

    try {
      const context = await request.newContext({
        storageState: storageStatePath,
        extraHTTPHeaders: { Accept: 'application/json' },
      });
      this.contexts.set(storageStatePath, { fingerprint, context });
      await this.evictOverflow(storageStatePath);
      return context;
    } catch {
      throw new AdeAutomationError(
        'Impossibile caricare la sessione browser Agenzia delle Entrate.',
        'ADE_SESSION_INVALID',
        'AUTH_REQUIRED',
        false,
      );
    }
  }

  private sessionFingerprint(storageStatePath: string): string {
    try {
      const stat = statSync(storageStatePath);
      return `${storageStatePath}:${stat.size}:${stat.mtimeMs}`;
    } catch {
      throw new AdeAutomationError(
        'Impossibile leggere la sessione browser Agenzia delle Entrate.',
        'ADE_SESSION_INVALID',
        'AUTH_REQUIRED',
        false,
      );
    }
  }

  private touch(key: string, value: ReusableApiContext): void {
    this.contexts.delete(key);
    this.contexts.set(key, value);
  }

  private async evictOverflow(currentKey: string): Promise<void> {
    while (this.contexts.size > this.maxContexts) {
      const oldestKey = this.contexts.keys().next().value as string | undefined;
      if (!oldestKey) return;
      if (oldestKey === currentKey && this.contexts.size === 1) return;
      await this.reset(oldestKey);
    }
  }

  private async reset(key?: string): Promise<void> {
    if (key != null) {
      const entry = this.contexts.get(key);
      if (!entry) return;
      this.contexts.delete(key);
      await entry.context.dispose().catch(() => undefined);
      return;
    }

    const entries = [...this.contexts.values()];
    this.contexts.clear();
    await Promise.all(
      entries.map((entry) => entry.context.dispose().catch(() => undefined)),
    );
  }
}
