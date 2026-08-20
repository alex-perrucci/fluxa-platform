// PHASE_8_TRUE_CONTROL_CENTER
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { controlCenterErrorView } from '@/lib/control-center/error-policy';

export async function proxyAuthenticatedJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<NextResponse<T | Record<string, unknown>>> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  if (!accessToken) {
    const view = controlCenterErrorView('SESSION_REQUIRED', 401);
    return NextResponse.json(
      { code: 'SESSION_REQUIRED', ...view },
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
      const view = controlCenterErrorView(error.code, error.status);
      console.error('control-center upstream error', {
        path,
        status: error.status,
        code: error.code,
      });
      return NextResponse.json(
        {
          code: error.code,
          ...view,
        },
        { status: error.status },
      );
    }

    console.error('control-center unexpected error', { path, error });
    const view = controlCenterErrorView('SERVER_ERROR', 500);
    return NextResponse.json(
      {
        code: 'CONTROL_CENTER_REQUEST_FAILED',
        ...view,
      },
      { status: 500 },
    );
  }
}
