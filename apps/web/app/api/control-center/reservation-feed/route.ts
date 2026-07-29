// PHASE_10_RESERVATION_OPERATIONS
import type { NextRequest } from 'next/server';
import type { ReservationFeedResponse } from '@/lib/control-center/types';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.toString();

  return proxyAuthenticatedJson<ReservationFeedResponse>(
    `/control-center/reservation-feed${query ? `?${query}` : ''}`,
  );
}
