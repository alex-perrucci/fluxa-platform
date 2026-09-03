import { statSync } from 'node:fs';
import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { request, type APIRequestContext, type APIResponse } from 'playwright';
import { AdeAutomationError } from './ade-automation-error';
import { adeSessionPoolMax } from './ade-submit-observability';

const DCO_ORIGIN = 'https://ivaservizi.agenziaentrate.gov.it';
const DCO_ROOT_PATH = '/ser/documenticommercialionline/';
const DCO_DOCUMENTS_PATH = '/ser/api/documenti/v1/doc/documenti/';
const ALLOWED_READ_PREFIXES = ['/ser/api/', '/common/'] as const;
const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;

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

export interface AdeDcoHttpBootstrapResult {
  status: number;
  path: typeof DCO_ROOT_PATH;
  contentType: string;
}

export interface AdeDcoHttpSubmitResult {
  status: number;
  path: typeof DCO_DOCUMENTS_PATH;
  contentType: string;
  responseDate: string | null;
  body: unknown;
  submitAttempted: true;
}

export interface AdeDcoOfficialArtifactResult {
  status: number;
  contentType: string;
  bytes: Buffer;
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

function validateArtifactId(raw: string): string {
  const value = raw.trim();
  if (!/^\d{1,32}$/.test(value)) {
    throw new AdeAutomationError(
      'Identificativo documento AdE non valido.',
      'ADE_ARTIFACT_INPUT_INVALID',
      'CONFIGURATION',
      false,
    );
  }
  return value;
}

@Injectable()
export class AdeDcoHttpClient implements OnApplicationShutdown {
  private readonly contexts = new Map<string, ReusableApiContext>();
  private readonly maxContexts = adeSessionPoolMax();

  async bootstrapDco(input: {
    storageStatePath: string;
    timeoutMs: number;
  }): Promise<AdeDcoHttpBootstrapResult> {
    const context = await this.contextForSession(input.storageStatePath);
    let response: APIResponse;
    try {
      response = await context.get(`${DCO_ORIGIN}${DCO_ROOT_PATH}`, {
        timeout: input.timeoutMs,
        failOnStatusCode: false,
        headers: {
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: `${DCO_ORIGIN}/instr/InstradamentofcWeb/home`,
        },
      });
    } catch (error) {
      throw this.navigationError(error, 'Bootstrap DCO non riuscito.');
    }

    await this.assertReadableResponse(
      response,
      input.storageStatePath,
      DCO_ROOT_PATH,
    );

    return {
      status: response.status(),
      path: DCO_ROOT_PATH,
      contentType: response.headers()['content-type'] ?? '',
    };
  }

  async getJson<T = unknown>(input: {
    storageStatePath: string;
    path: string;
    timeoutMs: number;
  }): Promise<AdeDcoHttpReadResult<T>> {
    const path = validateAdeDcoReadPath(input.path);
    const context = await this.contextForSession(input.storageStatePath);

    let response: APIResponse;
    try {
      response = await context.get(`${DCO_ORIGIN}${path}`, {
        timeout: input.timeoutMs,
        failOnStatusCode: false,
        headers: {
          Accept: 'application/json, text/plain, */*',
          Referer: `${DCO_ORIGIN}${DCO_ROOT_PATH}`,
        },
      });
    } catch (error) {
      throw this.navigationError(error, 'Lettura DCO non riuscita.');
    }

    await this.assertReadableResponse(response, input.storageStatePath, path);

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

  async postDocumentJson(input: {
    storageStatePath: string;
    body: unknown;
    timeoutMs: number;
  }): Promise<AdeDcoHttpSubmitResult> {
    const context = await this.contextForSession(input.storageStatePath);
    let response: APIResponse;

    try {
      // Irreversible HTTP boundary: from the moment this POST is started, a
      // network ambiguity must never be converted into an automatic retry.
      response = await context.post(`${DCO_ORIGIN}${DCO_DOCUMENTS_PATH}`, {
        timeout: input.timeoutMs,
        failOnStatusCode: false,
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          Origin: DCO_ORIGIN,
          Referer: `${DCO_ORIGIN}${DCO_ROOT_PATH}`,
        },
        data: input.body,
      });
    } catch (error) {
      throw new AdeAutomationError(
        error instanceof Error
          ? `Esito POST DCO non verificabile: ${error.message}`
          : 'Esito POST DCO non verificabile.',
        'ADE_DOCUMENT_SUBMIT_UNKNOWN',
        'SUBMIT_UNKNOWN',
        false,
        true,
      );
    }

    return {
      status: response.status(),
      path: DCO_DOCUMENTS_PATH,
      contentType: response.headers()['content-type'] ?? '',
      responseDate: response.headers().date ?? null,
      body: await this.readOptionalJson(response),
      submitAttempted: true,
    };
  }

  async getOfficialArtifact(input: {
    storageStatePath: string;
    externalId: string;
    timeoutMs: number;
  }): Promise<AdeDcoOfficialArtifactResult> {
    const externalId = validateArtifactId(input.externalId);
    const path = `${DCO_DOCUMENTS_PATH}${externalId}/stampa/`;
    const context = await this.contextForSession(input.storageStatePath);

    let response: APIResponse;
    try {
      response = await context.get(`${DCO_ORIGIN}${path}`, {
        timeout: input.timeoutMs,
        failOnStatusCode: false,
        headers: {
          Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8',
          Referer: `${DCO_ORIGIN}${DCO_ROOT_PATH}`,
        },
      });
    } catch (error) {
      throw this.navigationError(
        error,
        'Recupero documento commerciale AdE non riuscito.',
      );
    }

    const status = response.status();
    if (status === 401 || status === 403) {
      await this.reset(input.storageStatePath);
      throw new AdeAutomationError(
        `Sessione Agenzia delle Entrate non valida per il documento ufficiale (HTTP ${status}).`,
        'ADE_SESSION_INVALID',
        'AUTH_REQUIRED',
        false,
      );
    }
    if (status === 404) {
      throw new AdeAutomationError(
        'Documento commerciale ufficiale non trovato su AdE.',
        'ADE_ARTIFACT_NOT_FOUND',
        'NAVIGATION',
        false,
      );
    }
    if (status >= 500 && status <= 599) {
      throw new AdeAutomationError(
        `Servizio DCO non disponibile durante il recupero del documento (HTTP ${status}).`,
        'ADE_UPSTREAM_UNAVAILABLE',
        'NAVIGATION',
        true,
      );
    }
    if (!response.ok()) {
      throw new AdeAutomationError(
        `Recupero documento commerciale ufficiale fallito con HTTP ${status}.`,
        'ADE_ARTIFACT_UNAVAILABLE',
        'NAVIGATION',
        true,
      );
    }

    const declaredLength = Number(response.headers()['content-length'] ?? 0);
    if (declaredLength > MAX_ARTIFACT_BYTES) {
      throw new AdeAutomationError(
        'Documento commerciale ufficiale troppo grande.',
        'ADE_ARTIFACT_INVALID',
        'NAVIGATION',
        false,
      );
    }

    const bytes = Buffer.from(await response.body());
    if (
      bytes.length === 0 ||
      bytes.length > MAX_ARTIFACT_BYTES ||
      bytes.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      throw new AdeAutomationError(
        'AdE non ha restituito un PDF ufficiale valido.',
        'ADE_ARTIFACT_INVALID',
        'NAVIGATION',
        false,
      );
    }

    return {
      status,
      contentType: response.headers()['content-type'] ?? 'application/pdf',
      bytes,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.reset();
  }

  private async assertReadableResponse(
    response: APIResponse,
    storageStatePath: string,
    path: string,
  ): Promise<void> {
    const status = response.status();
    if (status === 401 || status === 403) {
      await this.reset(storageStatePath);
      throw new AdeAutomationError(
        `Sessione Agenzia delle Entrate non valida per DCO (HTTP ${status}, path ${path}).`,
        'ADE_SESSION_INVALID',
        'AUTH_REQUIRED',
        false,
      );
    }
    if (status >= 500 && status <= 599) {
      throw new AdeAutomationError(
        `Servizio DCO non disponibile (HTTP ${status}, path ${path}).`,
        'ADE_UPSTREAM_UNAVAILABLE',
        'NAVIGATION',
        true,
      );
    }
    if (!response.ok()) {
      throw new AdeAutomationError(
        `Lettura DCO fallita con HTTP ${status} (path ${path}).`,
        'ADE_NAVIGATION_FAILED',
        'NAVIGATION',
        true,
      );
    }
  }

  private async readOptionalJson(response: APIResponse): Promise<unknown> {
    let text: string;
    try {
      text = await response.text();
    } catch {
      return null;
    }
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }

  private navigationError(
    error: unknown,
    fallback: string,
  ): AdeAutomationError {
    return new AdeAutomationError(
      error instanceof Error ? `${fallback} ${error.message}` : fallback,
      'ADE_NAVIGATION_FAILED',
      'NAVIGATION',
      true,
    );
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
        extraHTTPHeaders: { Accept: 'application/json, text/plain, */*' },
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
