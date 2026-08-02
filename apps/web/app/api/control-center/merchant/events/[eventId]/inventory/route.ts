import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  return proxyAuthenticatedJson(`/events/${eventId}/inventory`);
}
