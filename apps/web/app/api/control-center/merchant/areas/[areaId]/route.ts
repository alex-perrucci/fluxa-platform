import { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ areaId: string }> },
) {
  const { areaId } = await context.params;
  return proxyAuthenticatedJson(`/dining-areas/${areaId}`, {
    method: 'PATCH',
    body: JSON.stringify(await request.json()),
  });
}
