// PHASE_9_PUBLIC_BOOKING
import type { PublicCheckoutSession } from '@/lib/public-booking/types';
import { proxyPublicJson } from '@/lib/api/public-bff';

export async function POST(
  request: Request,
  context: { params: Promise<{ reservationToken: string }> },
) {
  const { reservationToken } = await context.params;

  return proxyPublicJson<PublicCheckoutSession>(
    `/public/reservations/${encodeURIComponent(
      reservationToken,
    )}/checkout-sessions`,
    {
      method: 'POST',
      body: await request.text(),
    },
  );
}
