import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get('locationId');
  if (!locationId) {
    return NextResponse.json(
      { code: 'LOCATION_REQUIRED', message: 'Sede obbligatoria.' },
      { status: 400 },
    );
  }
  return proxyAuthenticatedJson(
    `/dining-areas?locationId=${encodeURIComponent(locationId)}`,
  );
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as {
    locationId?: string;
    [key: string]: unknown;
  };
  if (!payload.locationId) {
    return NextResponse.json(
      { code: 'LOCATION_REQUIRED', message: 'Sede obbligatoria.' },
      { status: 400 },
    );
  }
  const { locationId, ...area } = payload;
  return proxyAuthenticatedJson(`/dining-areas/${locationId}`, {
    method: 'POST',
    body: JSON.stringify(area),
  });
}
