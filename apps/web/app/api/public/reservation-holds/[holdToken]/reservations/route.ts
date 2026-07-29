// PHASE_9_PUBLIC_BOOKING
import type { PublicReservation } from '@/lib/public-booking/types';
import { proxyPublicJson } from '@/lib/api/public-bff';

export async function POST(
  request: Request,
  context: { params: Promise<{ holdToken: string }> },
) {
  const { holdToken } = await context.params;

  return proxyPublicJson<PublicReservation>(
    `/public/reservation-holds/${encodeURIComponent(holdToken)}/reservations`,
    {
      method: 'POST',
      body: await request.text(),
    },
  );
}
