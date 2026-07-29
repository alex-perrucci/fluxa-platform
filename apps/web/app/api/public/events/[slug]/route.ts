// PHASE_9_PUBLIC_BOOKING
import type { PublicEventDetail } from '@/lib/public-booking/types';
import { proxyPublicJson } from '@/lib/api/public-bff';

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;

  return proxyPublicJson<PublicEventDetail>(
    `/public/events/${encodeURIComponent(slug)}`,
  );
}
