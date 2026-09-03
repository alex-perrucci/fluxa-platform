import type { Frame, Page, Response } from 'playwright';
import { AdeAutomationError } from './ade-automation-error';

const ADE_ORIGIN = 'https://ivaservizi.agenziaentrate.gov.it';
const DCO_ROOT = '/ser/documenticommercialionline/';
const DCO_ERROR_PATH = `${DCO_ROOT}error.html`;
const DCO_NONAUTH_PATH = `${DCO_ROOT}nonauth.html`;
const INSTRADAMENTO_ROOT = '/instr/InstradamentofcWeb/';

export function classifyAdeDcoHttpFailure(
  rawUrl: string,
  status: number,
): AdeAutomationError | null {
  const url = parseAdeUrl(rawUrl);
  if (!url || !isCriticalBootstrapPath(url.pathname)) return null;

  if (status === 401 || status === 403) {
    return sessionInvalid(
      `Bootstrap DCO non autorizzato (HTTP ${status}, path ${url.pathname}).`,
    );
  }

  if (status >= 500 && status <= 599) {
    return upstreamUnavailable(
      `Servizio DCO non disponibile (HTTP ${status}, path ${url.pathname}).`,
    );
  }

  return null;
}

export function classifyAdeDcoNavigationFailure(
  rawUrl: string,
): AdeAutomationError | null {
  const url = parseAdeUrl(rawUrl);
  if (!url) return null;

  const path = url.pathname.toLowerCase();
  if (path === DCO_NONAUTH_PATH.toLowerCase()) {
    return sessionInvalid(
      'Il portale DCO ha reindirizzato alla pagina non autenticata.',
    );
  }

  if (
    path === DCO_ERROR_PATH.toLowerCase() ||
    (path.startsWith(INSTRADAMENTO_ROOT.toLowerCase()) &&
      path.endsWith('/error'))
  ) {
    return upstreamUnavailable(
      `Il portale AdE ha reindirizzato a una pagina di errore (${url.pathname}).`,
    );
  }

  return null;
}

export function isAdeDcoFailFastError(
  error: unknown,
): error is AdeAutomationError {
  return (
    error instanceof AdeAutomationError &&
    (error.code === 'ADE_SESSION_INVALID' ||
      error.code === 'ADE_UPSTREAM_UNAVAILABLE')
  );
}

export class AdeDcoBootstrapGuard {
  private readonly failure: Promise<AdeAutomationError>;
  private resolveFailure!: (error: AdeAutomationError) => void;
  private failureError: AdeAutomationError | null = null;

  private readonly onResponse = (response: Response): void => {
    const error = classifyAdeDcoHttpFailure(response.url(), response.status());
    if (error) this.signal(error);
  };

  private readonly onFrameNavigated = (frame: Frame): void => {
    if (frame !== this.page.mainFrame()) return;
    const error = classifyAdeDcoNavigationFailure(frame.url());
    if (error) this.signal(error);
  };

  constructor(private readonly page: Page) {
    this.failure = new Promise<AdeAutomationError>((resolve) => {
      this.resolveFailure = resolve;
    });
    page.on('response', this.onResponse);
    page.on('framenavigated', this.onFrameNavigated);
  }

  async race<T>(operation: Promise<T>): Promise<T> {
    this.throwIfFailed();

    const result = await Promise.race([
      operation.then((value) => ({ type: 'VALUE' as const, value })),
      this.failure.then((error) => ({ type: 'ERROR' as const, error })),
    ]);

    if (result.type === 'ERROR') throw result.error;
    this.throwIfFailed();
    return result.value;
  }

  throwIfFailed(): void {
    if (this.failureError) throw this.failureError;
  }

  stop(): void {
    this.page.off('response', this.onResponse);
    this.page.off('framenavigated', this.onFrameNavigated);
  }

  private signal(error: AdeAutomationError): void {
    if (this.failureError) return;
    this.failureError = error;
    this.resolveFailure(error);
  }
}

function parseAdeUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    return url.origin === ADE_ORIGIN ? url : null;
  } catch {
    return null;
  }
}

function isCriticalBootstrapPath(pathname: string): boolean {
  return (
    pathname === DCO_ROOT ||
    pathname === DCO_ERROR_PATH ||
    pathname === DCO_NONAUTH_PATH ||
    pathname.startsWith('/ser/api/') ||
    pathname.startsWith('/common/') ||
    pathname.startsWith(INSTRADAMENTO_ROOT)
  );
}

function sessionInvalid(message: string): AdeAutomationError {
  return new AdeAutomationError(
    message,
    'ADE_SESSION_INVALID',
    'AUTH_REQUIRED',
    false,
  );
}

function upstreamUnavailable(message: string): AdeAutomationError {
  return new AdeAutomationError(
    message,
    'ADE_UPSTREAM_UNAVAILABLE',
    'NAVIGATION',
    true,
  );
}
