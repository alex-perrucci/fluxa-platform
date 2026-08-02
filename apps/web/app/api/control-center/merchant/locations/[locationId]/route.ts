import { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ locationId: string }> },
) {
  const { locationId } = await context.params;
  return proxyAuthenticatedJson(`/locations/${locationId}`);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ locationId: string }> },
) {
  const { locationId } = await context.params;
  return proxyAuthenticatedJson(`/locations/${locationId}`, {
    method: 'PATCH',
    body: JSON.stringify(await request.json()),
  });
}
