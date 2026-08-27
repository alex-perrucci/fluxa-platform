import { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/subscription`,
  );
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/subscription`,
    {
      method: 'PATCH',
      body: await request.text(),
    },
  );
}
