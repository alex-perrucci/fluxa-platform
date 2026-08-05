import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(request: Request) {
  const locationId = new URL(request.url).searchParams.get('locationId');
  const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
  return proxyAuthenticatedJson(`/health/operational${query}`);
}
