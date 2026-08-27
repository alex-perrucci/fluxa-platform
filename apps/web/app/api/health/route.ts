import { NextResponse } from 'next/server';
import { fluxaServerFetch } from '@/lib/api/fluxa-api';

interface BackendReadyPayload {
  status?: unknown;
  release?: {
    sha?: unknown;
    version?: unknown;
  };
}

export const dynamic = 'force-dynamic';

function webRelease() {
  return {
    sha: process.env.FLUXA_RELEASE_SHA?.trim() || 'unknown',
    version: process.env.FLUXA_RELEASE_VERSION?.trim() || 'unknown',
  };
}

export async function GET() {
  const release = webRelease();

  try {
    const backend = await fluxaServerFetch<BackendReadyPayload>('/health/ready');
    const backendRelease = {
      sha: backend.release?.sha?.toString() ?? 'unknown',
      version: backend.release?.version?.toString() ?? 'unknown',
    };
    const aligned =
      release.sha !== 'unknown' &&
      release.version !== 'unknown' &&
      backend.status === 'ok' &&
      backendRelease.sha === release.sha &&
      backendRelease.version === release.version;

    return NextResponse.json(
      {
        status: aligned ? 'ok' : 'error',
        service: 'fluxa-web',
        release,
        backend: {
          status: backend.status === 'ok' ? 'up' : 'down',
          release: backendRelease,
        },
        timestamp: new Date().toISOString(),
      },
      { status: aligned ? 200 : 503 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        service: 'fluxa-web',
        release,
        backend: {
          status: 'down',
          message: error instanceof Error ? error.message : 'Backend unavailable',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
