import { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ deviceId: string }> },
) {
  const { deviceId } = await context.params;
  return proxyAuthenticatedJson(`/devices/${deviceId}/assignment`, {
    method: 'PUT',
    body: JSON.stringify(await request.json()),
  });
}
