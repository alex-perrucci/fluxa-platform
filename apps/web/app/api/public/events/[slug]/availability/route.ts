// PHASE_9_PUBLIC_BOOKING
import type { NextRequest } from 'next/server';
import type { PublicAvailability } from '@/lib/public-booking/types';
import { proxyPublicJson } from '@/lib/api/public-bff';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const query = request.nextUrl.searchParams.toString();

  return proxyPublicJson<PublicAvailability>(
    `/public/events/${encodeURIComponent(slug)}/availability${
      query ? `?${query}` : ''
    }`,
  );
}
