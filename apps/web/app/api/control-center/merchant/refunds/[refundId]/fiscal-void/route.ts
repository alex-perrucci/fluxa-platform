import type { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ refundId: string }> },
) {
  const { refundId } = await context.params;
  return proxyAuthenticatedJson(
    `/payment-refunds/${encodeURIComponent(refundId)}/fiscal-void`,
    {
      method: 'POST',
      body: await request.text(),
      headers: { 'content-type': 'application/json' },
    },
  );
}
