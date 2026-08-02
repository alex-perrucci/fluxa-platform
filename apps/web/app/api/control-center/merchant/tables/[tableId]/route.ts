import { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ tableId: string }> },
) {
  const { tableId } = await context.params;
  return proxyAuthenticatedJson(`/dining-tables/${tableId}`, {
    method: 'PATCH',
    body: JSON.stringify(await request.json()),
  });
}
