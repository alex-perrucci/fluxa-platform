import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  if (!accessToken) {
    return NextResponse.json(
      { code: 'SESSION_REQUIRED', message: 'Sessione non disponibile.' },
      { status: 401 },
    );
  }

  const query = new URL(request.url).searchParams.toString();

  try {
    const csv = await fluxaServerFetch<string>(
      `/control-center/sales/reports.csv${query ? `?${query}` : ''}`,
      {
        headers: { authorization: `Bearer ${accessToken}` },
      },
    );

    return new NextResponse(csv, {
      headers: {
        'content-disposition': 'attachment; filename="fluxa-sales-report.csv"',
        'content-type': 'text/csv; charset=utf-8',
      },
    });
  } catch (error) {
    if (error instanceof FluxaApiError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { code: 'CSV_EXPORT_FAILED', message: 'Esportazione CSV non riuscita.' },
      { status: 500 },
    );
  }
}
