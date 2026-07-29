// PHASE_8_TRUE_CONTROL_CENTER
import { NextRequest } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function POST(request: NextRequest) {
  return proxyAuthenticatedJson('/platform/onboarding', {
    method: 'POST',
    body: await request.text(),
  });
}
