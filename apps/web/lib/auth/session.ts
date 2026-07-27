import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import type {
  ActiveOrganization,
  AuthenticatedSession,
  MeResponse,
} from '@/lib/auth/auth-types';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

function currentOrganization(session: MeResponse): ActiveOrganization | null {
  const selected = session.availableOrganizations.find(
    (organization) =>
      organization.organizationId === session.session.organizationId,
  );

  return selected
    ? {
        id: selected.organizationId,
        name: selected.organizationName,
        slug: selected.organizationSlug,
        role: selected.role,
      }
    : null;
}

export async function getCurrentSession(): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  if (!accessToken) {
    return null;
  }

  try {
    const session = await fluxaServerFetch<MeResponse>('/auth/me', {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    return {
      ...session,
      organization: currentOrganization(session),
    };
  } catch (error) {
    if (error instanceof FluxaApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function requireMerchantSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect('/login?reason=session');
  }

  if (!session.session.organizationId || !session.session.role) {
    redirect('/login?reason=organization');
  }

  return session;
}

export async function requirePlatformAdminSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect('/login?reason=session');
  }

  if (!session.user.platformAdmin) {
    redirect('/merchant');
  }

  return session;
}
