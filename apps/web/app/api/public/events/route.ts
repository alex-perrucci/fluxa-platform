// PHASE_9_PUBLIC_BOOKING
import type { NextRequest } from 'next/server';
import type { PublicEventListResponse } from '@/lib/public-booking/types';
import { proxyPublicJson } from '@/lib/api/public-bff';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();

  return proxyPublicJson<PublicEventListResponse>(
    `/public/events${query ? `?${query}` : ''}`,
  );
}
