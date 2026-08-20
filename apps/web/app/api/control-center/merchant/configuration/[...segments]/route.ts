import { NextRequest, NextResponse } from 'next/server';
import { proxyAuthenticatedJson } from '@/lib/api/bff';

interface RouteContext {
  params: Promise<{ segments: string[] }>;
}

const readableRoots = new Set([
  'categories',
  'vat-rates',
  'products',
  'price-lists',
  'kitchen-stations',
  'kitchen-station-routes',
  'printers',
  'print-routes',
  'fiscal-profiles',
]);

const writableRoots = new Set([
  'categories',
  'vat-rates',
  'products',
  'price-lists',
  'kitchen-stations',
  'print-routes',
]);

async function forward(
  request: NextRequest,
  context: RouteContext,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
) {
  const { segments } = await context.params;
  const root = segments[0];

  if (!root || !readableRoots.has(root)) {
    return NextResponse.json(
      {
        code: 'CONFIGURATION_ROUTE_NOT_FOUND',
        message: 'Configurazione non disponibile.',
      },
      { status: 404 },
    );
  }

  if (method !== 'GET' && !writableRoots.has(root)) {
    return NextResponse.json(
      {
        code: 'CONFIGURATION_ROUTE_READ_ONLY',
        message:
          root === 'fiscal-profiles'
            ? 'La fiscalizzazione è gestita dall’assistenza Fluxa.'
            : 'Questa configurazione è disponibile in sola lettura.',
      },
      { status: 405 },
    );
  }

  const encodedPath = segments
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const target = `/${encodedPath}${request.nextUrl.search}`;
  const init: RequestInit = { method };

  if (method !== 'GET' && method !== 'DELETE') {
    const body = await request.text();
    if (body) {
      init.body = body;
      const contentType = request.headers.get('content-type');
      if (contentType) {
        init.headers = { 'content-type': contentType };
      }
    }
  }

  return proxyAuthenticatedJson(target, init);
}

export async function GET(request: NextRequest, context: RouteContext) {
  return forward(request, context, 'GET');
}

export async function POST(request: NextRequest, context: RouteContext) {
  return forward(request, context, 'POST');
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return forward(request, context, 'PUT');
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return forward(request, context, 'PATCH');
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return forward(request, context, 'DELETE');
}
