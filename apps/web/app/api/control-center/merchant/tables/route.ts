// PHASE_8_TRUE_CONTROL_CENTER
import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get('locationId');

  if (!locationId) {
    return NextResponse.json(
      {
        code: 'LOCATION_REQUIRED',
        message: 'Sede obbligatoria.',
      },
      { status: 400 },
    );
  }

  return proxyAuthenticatedJson(
    `/dining-tables?locationId=${encodeURIComponent(locationId)}`,
  );
}
