import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(
  _request: Request,
  context: { params: Promise<{ locationId: string }> },
) {
  const { locationId } = await context.params;
  return proxyAuthenticatedJson(`/floor-plans/${locationId}`);
}
