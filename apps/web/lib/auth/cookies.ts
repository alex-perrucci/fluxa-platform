import type { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies';

export const ACCESS_COOKIE = 'fluxa_access_token';
export const REFRESH_COOKIE = 'fluxa_refresh_token';
export const INSTALLATION_COOKIE = 'fluxa_web_installation';

function secureCookie() {
  return process.env.NODE_ENV === 'production';
}

export function accessCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: secureCookie(),
    path: '/',
    maxAge,
  };
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: secureCookie(),
    path: '/',
  };
}

export function installationCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: secureCookie(),
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  };
}

export function clearAuthCookies(cookies: ResponseCookies) {
  cookies.set(ACCESS_COOKIE, '', {
    ...accessCookieOptions(0),
    expires: new Date(0),
  });
  cookies.set(REFRESH_COOKIE, '', {
    ...refreshCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
}
