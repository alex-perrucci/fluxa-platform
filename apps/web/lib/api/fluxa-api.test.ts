import { afterEach, describe, expect, it, vi } from 'vitest';
import { FluxaApiError, fluxaServerFetch } from './fluxa-api';

describe('fluxaServerFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FLUXA_API_BASE_URL;
  });

  it('returns the decoded payload for a successful request', async () => {
    process.env.FLUXA_API_BASE_URL = 'http://localhost:3000/api/v1';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    await expect(fluxaServerFetch('/health/ready')).resolves.toEqual({
      status: 'ok',
    });
  });

  it('maps backend errors to FluxaApiError', async () => {
    process.env.FLUXA_API_BASE_URL = 'http://localhost:3000/api/v1';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'INVALID_ACCESS_TOKEN',
            message: 'Token non valido.',
          }),
          {
            status: 401,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    );

    await expect(fluxaServerFetch('/auth/me')).rejects.toMatchObject<
      Partial<FluxaApiError>
    >({
      status: 401,
      code: 'INVALID_ACCESS_TOKEN',
      message: 'Token non valido.',
    });
  });
});
