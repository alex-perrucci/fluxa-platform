// PHASE_8_TRUE_CONTROL_CENTER
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

export async function proxyAuthenticatedJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<NextResponse<T | Record<string, unknown>>> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json(
      { code: 'SESSION_REQUIRED', message: 'Sessione non disponibile.' },
      { status: 401 },
    );
  }

  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${accessToken}`);

  try {
    const result = await fluxaServerFetch<T>(path, { ...init, headers });
    return NextResponse.json(result);
  } catch (error) {
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
        code: 'CONTROL_CENTER_REQUEST_FAILED',
        message: 'Operazione non riuscita.',
      },
      { status: 500 },
    );
  }
}
