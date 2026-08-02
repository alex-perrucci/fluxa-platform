import { proxyAuthenticatedJson } from '@/lib/api/bff';

export async function GET() {
  return proxyAuthenticatedJson('/floor-plans');
}
