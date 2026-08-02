import { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function PUT(
  request: NextRequest,
  context: {
    params: Promise<{ organizationId: string; locationId: string }>;
  },
) {
  const { organizationId, locationId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/locations/${locationId}/lifecycle`,
    {
      method: 'PUT',
      body: await request.text(),
    },
  );
}
