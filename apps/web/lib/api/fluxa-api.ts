import { getFluxaServerApiBaseUrl } from '@/lib/config/env';

interface FluxaErrorBody {
  code?: unknown;
  message?: unknown;
}

export class FluxaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown,
  ) {
    super(message);
    this.name = 'FluxaApiError';
  }
}

function buildUrl(path: string): URL {
  const base = getFluxaServerApiBaseUrl();
  const normalizedPath = path.replace(/^\/+/, '');
  return new URL(`${base}/${normalizedPath}`);
}

async function parseResponse(response: Response): Promise<unknown> {
  const raw = await response.text();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export async function fluxaServerFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  headers.set('accept', 'application/json');

  const response = await fetch(buildUrl(path), {
    ...init,
    headers,
    cache: 'no-store',
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    const body =
      payload && typeof payload === 'object'
        ? (payload as FluxaErrorBody)
        : undefined;

    throw new FluxaApiError(
      response.status,
      typeof body?.code === 'string' ? body.code : 'FLUXA_API_ERROR',
      typeof body?.message === 'string'
        ? body.message
        : `Fluxa API ha risposto con HTTP ${response.status}.`,
      payload,
    );
  }

  return payload as T;
}
