import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  return proxyAuthenticatedJson(`/events/${eventId}/table-groups`, {
    method: 'POST',
    body: await request.text(),
  });
}
