import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

function fiscalResource(request: NextRequest) {
  return request.nextUrl.searchParams.get('resource') === 'openapi-fiscal-profile';
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ organizationId: string; locationId: string }>;
  },
) {
  if (!fiscalResource(request)) {
    return NextResponse.json({ message: 'Risorsa non supportata.' }, { status: 400 });
  }
  const { organizationId, locationId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/locations/${locationId}/openapi-fiscal-profile`,
  );
}

export async function PUT(
  request: NextRequest,
  context: {
    params: Promise<{ organizationId: string; locationId: string }>;
  },
) {
  if (!fiscalResource(request)) {
    return NextResponse.json({ message: 'Risorsa non supportata.' }, { status: 400 });
  }
  const { organizationId, locationId } = await context.params;
  const payload = (await request.json()) as Record<string, unknown>;
  const companyName =
    typeof payload.companyName === 'string' && payload.companyName.trim()
      ? payload.companyName
      : payload.displayName;
  const companyEmail =
    typeof payload.companyEmail === 'string' && payload.companyEmail.trim()
      ? payload.companyEmail
      : payload.receiptEmail;

  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/locations/${locationId}/openapi-fiscal-profile`,
    {
      method: 'PUT',
      body: JSON.stringify({ ...payload, companyName, companyEmail }),
    },
  );
}

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ organizationId: string; locationId: string }>;
  },
) {
  const { organizationId, locationId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/locations/${locationId}`,
    {
      method: 'PATCH',
      body: await request.text(),
    },
  );
}

export async function DELETE(
  _request: NextRequest,
  context: {
    params: Promise<{ organizationId: string; locationId: string }>;
  },
) {
  const { organizationId, locationId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/locations/${locationId}`,
    { method: 'DELETE' },
  );
}
