// PHASE_8_TRUE_CONTROL_CENTER
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

const schema = z.object({
  action: z.enum(['publish', 'cancel', 'archive']),
  reason: z.string().max(1000).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await context.params;
  const input = schema.safeParse(await request.json());

  if (!input.success) {
    return NextResponse.json(
      {
        code: 'INVALID_EVENT_ACTION',
        message: 'Azione evento non valida.',
      },
      { status: 400 },
    );
  }

  if (input.data.action === 'archive') {
    return proxyAuthenticatedJson(`/events/${eventId}`, {
      method: 'DELETE',
    });
  }

  return proxyAuthenticatedJson(`/events/${eventId}/${input.data.action}`, {
    method: 'POST',
    ...(input.data.action === 'cancel'
      ? {
          body: JSON.stringify({
            reason: input.data.reason ?? 'Annullato dal Control Center Fluxa',
          }),
        }
      : {}),
  });
}
