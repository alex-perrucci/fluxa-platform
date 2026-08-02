import { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/locations`,
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  return proxyAuthenticatedJson(
    `/platform/organizations/${organizationId}/locations`,
    {
      method: 'POST',
      body: await request.text(),
    },
  );
}
