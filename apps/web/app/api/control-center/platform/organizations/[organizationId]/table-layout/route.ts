import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  const locationId = request.nextUrl.searchParams.get('locationId');

  if (!locationId) {
    return NextResponse.json(
      { code: 'LOCATION_REQUIRED', message: 'Sede obbligatoria.' },
      { status: 400 },
    );
  }

  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/table-layout?locationId=${encodeURIComponent(locationId)}`,
  );
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  const payload = await request.json();

  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/table-layout`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
}
