import { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ organizationId: string; locationId: string }>;
  },
) {
  const { organizationId, locationId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/locations/${locationId}`,
    {
      method: 'PATCH',
      body: await request.text(),
    },
  );
}

export async function DELETE(
  _request: NextRequest,
  context: {
    params: Promise<{ organizationId: string; locationId: string }>;
  },
) {
  const { organizationId, locationId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/locations/${locationId}`,
    { method: 'DELETE' },
  );
}
