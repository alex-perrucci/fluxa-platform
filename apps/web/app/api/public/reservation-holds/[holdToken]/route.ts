// PHASE_9_PUBLIC_BOOKING
import type { PublicHold } from '@/lib/public-booking/types';
import { proxyPublicJson } from '@/lib/api/public-bff';

export async function GET(
  _request: Request,
  context: { params: Promise<{ holdToken: string }> },
) {
  const { holdToken } = await context.params;

  return proxyPublicJson<PublicHold>(
    `/public/reservation-holds/${encodeURIComponent(holdToken)}`,
  );
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ holdToken: string }> },
) {
  const { holdToken } = await context.params;

  return proxyPublicJson<PublicHold>(
    `/public/reservation-holds/${encodeURIComponent(holdToken)}`,
    { method: 'DELETE' },
  );
}
