import type { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await context.params;
  return proxyAuthenticatedJson(
    `/payments/${encodeURIComponent(paymentId)}/refund-quote`,
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await context.params;
  return proxyAuthenticatedJson(
    `/payments/${encodeURIComponent(paymentId)}/refunds`,
    {
      method: 'POST',
      body: await request.text(),
      headers: { 'content-type': 'application/json' },
    },
  );
}
