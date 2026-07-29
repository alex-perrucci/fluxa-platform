// PHASE_9_PUBLIC_BOOKING
import { NextResponse } from 'next/server';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';

export async function proxyPublicJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<NextResponse<T | Record<string, unknown>>> {
  try {
    const result = await fluxaServerFetch<T>(path, init);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FluxaApiError) {
      return NextResponse.json(
        {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        code: 'PUBLIC_BOOKING_REQUEST_FAILED',
        message: 'Operazione di prenotazione non riuscita.',
      },
      { status: 500 },
    );
  }
}
