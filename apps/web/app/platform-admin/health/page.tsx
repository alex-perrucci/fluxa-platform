'use client';

import { useEffect, useState } from 'react';

type Infrastructure = {
  generatedAt: string;
  database: { status: string };
  redis: { status: string };
  queues: { fiscalPending: number | null; outboxPending: number | null };
  durationMs: number;
};

export default function InfrastructureHealthPage() {
  const [data, setData] = useState<Infrastructure | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setMessage(null);
    try {
      const response = await fetch('/api/control-center/platform/health', { cache: 'no-store' });
      if (!response.ok) throw new Error('Stato infrastruttura non disponibile.');
      setData((await response.json()) as Infrastructure);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Errore inatteso.');
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/control-center/platform/health', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Stato infrastruttura non disponibile.');
        }
        return (await response.json()) as Infrastructure;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(
            error instanceof Error ? error.message : 'Errore inatteso.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <main className="space-y-6">
    <header className="space-y-2"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Amministrazione Fluxa</p><h1 className="text-3xl font-semibold">Infrastruttura e code</h1><p className="text-sm text-neutral-600">Visibile solo agli amministratori di piattaforma. Nessun endpoint, host Redis o segreto viene esposto.</p></header>
    <button className="rounded-lg border px-4 py-2" onClick={() => void load()} type="button">Aggiorna</button>
    {message ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{message}</div> : null}
    <section className="grid gap-4 md:grid-cols-2">
      <Card title="Database" value={data?.database.status ?? 'UNKNOWN'} />
      <Card title="Redis" value={data?.redis.status ?? 'UNKNOWN'} />
      <Card title="Fiscal queue" value={data?.queues.fiscalPending == null ? 'UNKNOWN' : `${data.queues.fiscalPending} pendenti`} />
      <Card title="Outbox queue" value={data?.queues.outboxPending == null ? 'UNKNOWN' : `${data.queues.outboxPending} pendenti`} />
    </section>
  </main>;
}

function Card({ title, value }: { title: string; value: string }) {
  return <article className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm text-neutral-600">{value}</p></article>;
}
