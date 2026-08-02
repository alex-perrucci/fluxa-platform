import { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

interface Context {
  params: Promise<{ organizationId: string; membershipId: string }>;
}

export async function GET(_request: NextRequest, context: Context) {
  const { organizationId, membershipId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/members/${membershipId}/location-access`,
  );
}

export async function PUT(request: NextRequest, context: Context) {
  const { organizationId, membershipId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/members/${membershipId}/location-access`,
    {
      method: 'PUT',
      body: await request.text(),
    },
  );
}
