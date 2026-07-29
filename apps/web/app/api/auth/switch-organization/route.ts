// PHASE_8_TRUE_CONTROL_CENTER
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { RefreshResponse } from '@/lib/auth/auth-types';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  refreshCookieOptions,
} from '@/lib/auth/cookies';

const schema = z.object({
  organizationId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;

  if (!refreshToken || !accessToken) {
    return NextResponse.json(
      {
        code: 'SESSION_REQUIRED',
        message: 'Sessione non disponibile.',
      },
      { status: 401 },
    );
  }

  try {
    const input = schema.parse(await request.json());
    const result = await fluxaServerFetch<RefreshResponse>(
      '/auth/switch-organization',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          organizationId: input.organizationId,
          refreshToken,
        }),
      },
    );
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          code: 'INVALID_ORGANIZATION',
          message: 'Organizzazione non valida.',
        },
        { status: 400 },
      );
    }

    if (error instanceof FluxaApiError) {
      return NextResponse.json(
        {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        code: 'ORGANIZATION_SWITCH_FAILED',
        message: 'Cambio workspace non riuscito.',
      },
      { status: 500 },
    );
  }
}
