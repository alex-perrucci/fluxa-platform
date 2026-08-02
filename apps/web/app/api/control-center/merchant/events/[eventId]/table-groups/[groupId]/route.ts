import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ eventId: string; groupId: string }> },
) {
  const { eventId, groupId } = await context.params;
  return proxyAuthenticatedJson(
    `/events/${eventId}/table-groups/${groupId}`,
    { method: 'DELETE' },
  );
}
