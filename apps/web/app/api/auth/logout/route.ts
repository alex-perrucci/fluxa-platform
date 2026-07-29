import { NextRequest, NextResponse } from 'next/server';
import { fluxaServerFetch } from '@/lib/api/fluxa-api';
import { ACCESS_COOKIE, clearAuthCookies } from '@/lib/auth/cookies';

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;

  if (accessToken) {
    try {
      await fluxaServerFetch('/auth/logout', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      // La sessione locale viene rimossa anche se il backend è irraggiungibile.
    }
  }

  const response = NextResponse.json({ success: true });
  clearAuthCookies(response.cookies);
  return response;
}
