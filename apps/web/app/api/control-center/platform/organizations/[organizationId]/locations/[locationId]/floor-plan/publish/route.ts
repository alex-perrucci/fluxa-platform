import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function PUT(
  request: Request,
  context: {
    params: Promise<{ organizationId: string; locationId: string }>;
  },
) {
  const { organizationId, locationId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/locations/${locationId}/floor-plan/publish`,
    {
      method: 'PUT',
      body: await request.text(),
    },
  );
}
