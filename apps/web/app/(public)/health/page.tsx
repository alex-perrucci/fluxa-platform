import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { fluxaServerFetch } from '@/lib/api/fluxa-api';
import { getServerEnv } from '@/lib/config/env';

export const metadata: Metadata = {
  title: 'Configurazione',
};

export const dynamic = 'force-dynamic';

async function loadBackendHealth(): Promise<{
  ok: boolean;
  payload: unknown;
}> {
  try {
    const payload = await fluxaServerFetch<unknown>('/health/ready');
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      payload: error instanceof Error ? error.message : 'Errore sconosciuto',
    };
  }
}

export default async function HealthPage() {
  const environment = getServerEnv();
  const health = await loadBackendHealth();

  return (
    <main className="shell py-12">
      <Card>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
          Diagnostica
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Configurazione web</h1>

        <dl className="mt-8 grid gap-5">
          <div>
            <dt className="muted text-sm">Fluxa API</dt>
            <dd className="mt-1 break-all font-mono text-sm">
              {environment.FLUXA_API_BASE_URL}
            </dd>
          </div>

          <div>
            <dt className="muted text-sm">Backend ready</dt>
            <dd
              className={
                health.ok ? 'mt-1 text-emerald-300' : 'mt-1 text-red-300'
              }
            >
              {health.ok ? 'Raggiungibile' : 'Non raggiungibile'}
            </dd>
          </div>
        </dl>

        <pre className="mt-8 overflow-auto rounded-xl border border-slate-800 bg-black/30 p-4 text-xs">
          {JSON.stringify(health.payload, null, 2)}
        </pre>
      </Card>
    </main>
  );
}
