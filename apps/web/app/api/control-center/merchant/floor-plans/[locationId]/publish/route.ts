import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function PUT(
  request: Request,
  context: { params: Promise<{ locationId: string }> },
) {
  const { locationId } = await context.params;
  return proxyAuthenticatedJson(`/floor-plans/${locationId}/publish`, {
    method: 'PUT',
    body: await request.text(),
  });
}
