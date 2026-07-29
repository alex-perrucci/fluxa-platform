// PHASE_8_TRUE_CONTROL_CENTER
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { fluxaServerFetch } from '@/lib/api/fluxa-api';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

export async function authenticatedFluxaFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  if (!accessToken) {
    redirect('/login?reason=session');
  }

  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${accessToken}`);

  return fluxaServerFetch<T>(path, { ...init, headers });
}
