// PHASE_9_PUBLIC_BOOKING
import type { PublicHold } from '@/lib/public-booking/types';
import { proxyPublicJson } from '@/lib/api/public-bff';

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;

  return proxyPublicJson<PublicHold>(
    `/public/events/${encodeURIComponent(slug)}/holds`,
    {
      method: 'POST',
      body: await request.text(),
    },
  );
}
