import { NextRequest, NextResponse } from 'next/server';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { RefreshResponse } from '@/lib/auth/auth-types';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  clearAuthCookies,
  refreshCookieOptions,
} from '@/lib/auth/cookies';

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.json(
      {
        code: 'REFRESH_TOKEN_MISSING',
        message: 'Sessione non disponibile.',
      },
      { status: 401 },
    );
  }

  try {
    const result = await fluxaServerFetch<RefreshResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    const response = NextResponse.json({
      organization: result.organization,
    });

    response.cookies.set(
      ACCESS_COOKIE,
      result.tokens.accessToken,
      accessCookieOptions(result.tokens.expiresIn),
    );
    response.cookies.set(
      REFRESH_COOKIE,
      result.tokens.refreshToken,
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
            : 'SESSION_REFRESH_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Aggiornamento sessione non riuscito.',
      },
      { status },
    );

    if (status === 401 || status === 403) {
      clearAuthCookies(response.cookies);
    }

    return response;
  }
}
