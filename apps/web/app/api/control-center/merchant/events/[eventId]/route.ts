// PHASE_8_TRUE_CONTROL_CENTER
import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

interface EventEditorPayload {
  locationId: string;
  tableIds: string[];
  bookingRules: Record<string, unknown>;
  [key: string]: unknown;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const payload = (await request.json()) as EventEditorPayload;
  const { tableIds, bookingRules } = payload;
  const event = Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) => !['locationId', 'tableIds', 'bookingRules'].includes(key),
    ),
  );

  const eventResponse = await proxyAuthenticatedJson(`/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(event),
  });

  if (!eventResponse.ok) {
    return eventResponse;
  }

  const eventBody = await eventResponse.json();

  const tablesResponse = await proxyAuthenticatedJson(
    `/events/${eventId}/tables`,
    {
      method: 'PUT',
      body: JSON.stringify({ tableIds }),
    },
  );

  if (!tablesResponse.ok) {
    return tablesResponse;
  }

  const rulesResponse = await proxyAuthenticatedJson(
    `/events/${eventId}/booking-rules`,
    {
      method: 'PUT',
      body: JSON.stringify(bookingRules),
    },
  );

  if (!rulesResponse.ok) {
    return rulesResponse;
  }

  return NextResponse.json(eventBody);
}
