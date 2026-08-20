import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

type FiscalResource = 'openapi-fiscal-profile' | 'fiscal-profile';

function fiscalResource(request: NextRequest): FiscalResource | null {
  const resource = request.nextUrl.searchParams.get('resource');
  return resource === 'openapi-fiscal-profile' || resource === 'fiscal-profile'
    ? resource
    : null;
}

function fiscalTarget(
  organizationId: string,
  locationId: string,
  resource: FiscalResource,
) {
  return `/platform/organizations/${organizationId}/locations/${locationId}/${resource}`;
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ organizationId: string; locationId: string }>;
  },
) {
  const resource = fiscalResource(request);
  if (!resource) {
    return NextResponse.json(
      { message: 'Risorsa non supportata.' },
      { status: 400 },
    );
  }
  const { organizationId, locationId } = await context.params;
  return proxyAuthenticatedJson(
    fiscalTarget(organizationId, locationId, resource),
  );
}

export async function PUT(
  request: NextRequest,
  context: {
    params: Promise<{ organizationId: string; locationId: string }>;
  },
) {
  const resource = fiscalResource(request);
  if (!resource) {
    return NextResponse.json(
      { message: 'Risorsa non supportata.' },
      { status: 400 },
    );
  }
  const { organizationId, locationId } = await context.params;
  const payload = (await request.json()) as Record<string, unknown>;

  if (resource === 'openapi-fiscal-profile') {
    const companyName =
      typeof payload.companyName === 'string' && payload.companyName.trim()
        ? payload.companyName
        : payload.displayName;
    const companyEmail =
      typeof payload.companyEmail === 'string' && payload.companyEmail.trim()
        ? payload.companyEmail
        : payload.receiptEmail;
    return proxyAuthenticatedJson(
      fiscalTarget(organizationId, locationId, resource),
      {
        method: 'PUT',
        body: JSON.stringify({ ...payload, companyName, companyEmail }),
      },
    );
  }

  return proxyAuthenticatedJson(
    fiscalTarget(organizationId, locationId, resource),
    { method: 'PUT', body: JSON.stringify(payload) },
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
