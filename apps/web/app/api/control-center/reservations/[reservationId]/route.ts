// PHASE_10_RESERVATION_OPERATIONS
import type { ReservationDetail } from '@/lib/control-center/types';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(
  _request: Request,
  context: { params: Promise<{ reservationId: string }> },
) {
  const { reservationId } = await context.params;

  return proxyAuthenticatedJson<ReservationDetail>(
    `/control-center/reservations/${encodeURIComponent(reservationId)}`,
  );
}
