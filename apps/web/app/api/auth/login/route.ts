import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { LoginResponse } from '@/lib/auth/auth-types';
import {
  ACCESS_COOKIE,
  INSTALLATION_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  installationCookieOptions,
  refreshCookieOptions,
} from '@/lib/auth/cookies';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  organizationId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const input = loginSchema.parse(await request.json());
    const installationId =
      request.cookies.get(INSTALLATION_COOKIE)?.value ?? randomUUID();

    const result = await fluxaServerFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        device: {
          installationId,
          name: 'Fluxa Web',
          platform: 'WEB',
          model: 'Browser',
          appVersion: '0.1.0',
        },
      }),
    });

    const response = NextResponse.json({
      user: result.user,
      organization: result.organization,
      availableOrganizations: result.availableOrganizations,
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
    response.cookies.set(
      INSTALLATION_COOKIE,
      installationId,
      installationCookieOptions(),
    );

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          code: 'INVALID_LOGIN_INPUT',
          message: 'Controlla email, password e organizzazione.',
          issues: error.issues,
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
        code: 'LOGIN_FAILED',
        message: 'Accesso non riuscito.',
      },
      { status: 500 },
    );
  }
}
