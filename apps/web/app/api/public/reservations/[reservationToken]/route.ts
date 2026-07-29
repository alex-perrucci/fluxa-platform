// PHASE_9_PUBLIC_BOOKING
import type { PublicReservation } from '@/lib/public-booking/types';
import { proxyPublicJson } from '@/lib/api/public-bff';

export async function GET(
  _request: Request,
  context: { params: Promise<{ reservationToken: string }> },
) {
  const { reservationToken } = await context.params;

  return proxyPublicJson<PublicReservation>(
    `/public/reservations/${encodeURIComponent(reservationToken)}`,
  );
}
