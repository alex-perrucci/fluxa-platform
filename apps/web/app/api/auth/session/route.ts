import { NextRequest, NextResponse } from 'next/server';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { MeResponse, RefreshResponse } from '@/lib/auth/auth-types';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  clearAuthCookies,
  refreshCookieOptions,
} from '@/lib/auth/cookies';

async function loadSession(accessToken: string) {
  return fluxaServerFetch<MeResponse>('/auth/me', {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (accessToken) {
    try {
      return NextResponse.json(await loadSession(accessToken));
    } catch (error) {
      if (!(error instanceof FluxaApiError) || error.status !== 401) {
        throw error;
      }
    }
  }

  if (!refreshToken) {
    return NextResponse.json(
      {
        code: 'SESSION_NOT_AVAILABLE',
        message: 'Sessione non disponibile.',
      },
      { status: 401 },
    );
  }

  try {
    const refreshed = await fluxaServerFetch<RefreshResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    const session = await loadSession(refreshed.tokens.accessToken);
    const response = NextResponse.json(session);

    response.cookies.set(
      ACCESS_COOKIE,
      refreshed.tokens.accessToken,
      accessCookieOptions(refreshed.tokens.expiresIn),
    );
    response.cookies.set(
      REFRESH_COOKIE,
      refreshed.tokens.refreshToken,
      refreshCookieOptions(),
    );

    return response;
  } catch (error) {
    const status = error instanceof FluxaApiError ? error.status : 500;
    const response = NextResponse.json(
      {
        code:
          error instanceof FluxaApiError
            ? error.code
            : 'SESSION_LOAD_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Impossibile caricare la sessione.',
      },
      { status },
    );

    if (status === 401 || status === 403) {
      clearAuthCookies(response.cookies);
    }

    return response;
  }
}
