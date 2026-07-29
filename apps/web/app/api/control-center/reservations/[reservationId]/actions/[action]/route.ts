// PHASE_10_RESERVATION_OPERATIONS
import type { ReservationDetail } from '@/lib/control-center/types';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      reservationId: string;
      action: string;
    }>;
  },
) {
  const { reservationId, action } = await context.params;

  return proxyAuthenticatedJson<ReservationDetail>(
    `/control-center/reservations/${encodeURIComponent(
      reservationId,
    )}/actions/${encodeURIComponent(action)}`,
    {
      method: 'POST',
      body: await request.text(),
    },
  );
}
