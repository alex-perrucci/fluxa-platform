import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { Page, Request } from 'playwright';

const DEFAULT_SESSION_POOL_MAX = 8;
const MIN_SESSION_POOL_MAX = 1;
const MAX_SESSION_POOL_MAX = 32;
const MAX_SCHEMA_LENGTH = 240;

const instrumentedPages = new WeakSet<Page>();
const requestStartedAt = new WeakMap<Request, number>();

export function adeProtocolDiagnosticsEnabled(): boolean {
  return process.env.ADE_PROTOCOL_DIAGNOSTICS?.trim().toLowerCase() === 'true';
}

export function adeSessionPoolMax(): number {
  const parsed = Number(process.env.ADE_SESSION_POOL_MAX);
  if (
    Number.isInteger(parsed) &&
    parsed >= MIN_SESSION_POOL_MAX &&
    parsed <= MAX_SESSION_POOL_MAX
  ) {
    return parsed;
  }
  return DEFAULT_SESSION_POOL_MAX;
}

export function adeSessionMetricKey(storageStatePath: string): string {
  return createHash('sha256').update(storageStatePath).digest('hex').slice(0, 12);
}

export async function measureAdeSubmitStage<T>(
  logger: Logger,
  sessionKey: string,
  stage: string,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await action();
  } finally {
    logger.log(
      `ADE submit timing session=${sessionKey} stage=${stage} durationMs=${Date.now() - startedAt}`,
    );
  }
}

export function attachAdeProtocolDiagnostics(
  page: Page,
  logger: Logger,
): void {
  if (!adeProtocolDiagnosticsEnabled() || instrumentedPages.has(page)) return;
  instrumentedPages.add(page);

  page.on('request', (request) => {
    if (!isDiagnosticRequest(request)) return;
    requestStartedAt.set(request, Date.now());
  });

  page.on('response', (response) => {
    const request = response.request();
    if (!isDiagnosticRequest(request)) return;

    const startedAt = requestStartedAt.get(request);
    const durationMs = startedAt == null ? -1 : Date.now() - startedAt;
    const postData = request.postData();
    const requestBodyBytes = postData == null ? 0 : Buffer.byteLength(postData);
    const contentType = response.headers()['content-type'] ?? '';
    const schema = requestJsonSchema(request);

    logger.debug(
      `ADE protocol method=${request.method()} path=${safePathname(request.url())} status=${response.status()} contentType=${sanitizeToken(contentType)} durationMs=${durationMs} requestBodyBytes=${requestBodyBytes} schema=${schema}`,
    );
  });
}

function isDiagnosticRequest(request: Request): boolean {
  try {
    const url = new URL(request.url());
    if (url.hostname !== 'ivaservizi.agenziaentrate.gov.it') return false;
    return (
      url.pathname.startsWith('/ser/') || url.pathname.startsWith('/common/')
    );
  } catch {
    return false;
  }
}

function safePathname(raw: string): string {
  try {
    return new URL(raw).pathname;
  } catch {
    return 'unavailable';
  }
}

function requestJsonSchema(request: Request): string {
  const postData = request.postData();
  if (!postData) return '-';

  try {
    const parsed = JSON.parse(postData) as unknown;
    return describeJsonShape(parsed).slice(0, MAX_SCHEMA_LENGTH);
  } catch {
    return 'non-json';
  }
}

function describeJsonShape(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? 'array[]' : `array[${describeJsonShape(value[0])}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `object{${keys.join(',')}}`;
  }
  if (value === null) return 'null';
  return typeof value;
}

function sanitizeToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_./;+\-=]/g, '').slice(0, 120) || '-';
}
