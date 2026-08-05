'use client';

import { useEffect, useState } from 'react';

type Status = 'OK' | 'DEGRADED' | 'DOWN' | 'NOT_CONFIGURED' | 'UNKNOWN';
type Location = { id: string; code: string; name: string };
type Health = {
  generatedAt: string;
  overallStatus: Status;
  api: { status: Status; latencyMs: number };
  location: Location;
  printers: {
    status: Status;
    items: Array<{ id: string; name: string; status: Status; lastSeenAt: string | null; statusMessage: string | null }>;
    lastJob: null | { id: string; status: string; printerName: string; documentType: string; updatedAt: string; lastError: string | null };
  };
  fiscal: { status: Status; provider?: string; environment?: string; lastDocumentStatus?: string | null; errorMessage?: string | null };
  paymentTerminal: { status: Status; provider?: string; lastTransactionStatus?: string; failureMessage?: string | null };
  suggestions: string[];
};

const badge: Record<Status, string> = {
  OK: 'bg-emerald-100 text-emerald-800',
  DEGRADED: 'bg-amber-100 text-amber-800',
  DOWN: 'bg-red-100 text-red-800',
  NOT_CONFIGURED: 'bg-neutral-100 text-neutral-700',
  UNKNOWN: 'bg-neutral-100 text-neutral-700',
};

export default function HealthPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [health, setHealth] = useState<Health | null>(null);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function load(target = locationId) {
    if (!target) return;
    setMessage(null);
    const startedAt = performance.now();
    try {
      const response = await fetch(`/api/control-center/merchant/health?locationId=${encodeURIComponent(target)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Diagnostica non disponibile.');
      const payload = (await response.json()) as Health;
      payload.api.latencyMs = Math.round(performance.now() - startedAt);
      setHealth(payload);
      setNetworkOnline(true);
    } catch (error) {
      setNetworkOnline(navigator.onLine);
      setMessage(error instanceof Error ? error.message : 'Errore inatteso.');
    }
  }

  useEffect(() => {
    const updateNetwork = () => setNetworkOnline(navigator.onLine);
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    void fetch('/api/control-center/merchant/locations', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Sedi non disponibili.');
        return (await response.json()) as Location[];
      })
      .then((items) => {
        setLocations(items);
        const first = items[0]?.id ?? '';
        setLocationId(first);
        if (first) void load(first);
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Errore inatteso.'));
    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
    };
  }, []);

  function exportDiagnostics() {
    if (!health) return;
    const safe = { ...health, client: { networkOnline, exportedAt: new Date().toISOString() } };
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fluxa-diagnostics-${health.location.code}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Operatività</p>
        <h1 className="text-3xl font-semibold text-neutral-950">Health panel</h1>
        <p className="max-w-3xl text-sm text-neutral-600">Stato reale dei servizi del locale e suggerimenti di ripristino. L’esportazione esclude credenziali, token e identificativi fiscali sensibili.</p>
      </header>
      <div className="flex flex-wrap gap-3">
        <select className="rounded-lg border px-3 py-2" value={locationId} onChange={(event) => { setLocationId(event.target.value); void load(event.target.value); }}>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.code} — {location.name}</option>)}
        </select>
        <button className="rounded-lg border px-4 py-2" type="button" onClick={() => void load()}>Aggiorna</button>
        <button className="rounded-lg bg-neutral-950 px-4 py-2 text-white disabled:opacity-50" disabled={!health} type="button" onClick={exportDiagnostics}>Esporta JSON</button>
      </div>
      {message ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div> : null}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <HealthCard title="Rete" status={networkOnline ? 'OK' : 'DOWN'} detail={networkOnline ? 'Dispositivo online' : 'Connessione non disponibile'} />
        <HealthCard title="API" status={health?.api.status ?? 'UNKNOWN'} detail={health ? `${health.api.latencyMs} ms` : 'In attesa'} />
        <HealthCard title="Stampanti" status={health?.printers.status ?? 'UNKNOWN'} detail={`${health?.printers.items.length ?? 0} configurate`} />
        <HealthCard title="Fiscal worker / A-Cube" status={health?.fiscal.status ?? 'UNKNOWN'} detail={health?.fiscal.provider ?? 'Non configurato'} />
        <HealthCard title="Terminale pagamento" status={health?.paymentTerminal.status ?? 'UNKNOWN'} detail={health?.paymentTerminal.provider ?? 'Nessun segnale disponibile'} />
        <HealthCard title="Stato complessivo" status={health?.overallStatus ?? 'UNKNOWN'} detail={health ? new Date(health.generatedAt).toLocaleString('it-IT') : 'In attesa'} />
      </section>
      {health?.printers.lastJob ? <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Ultimo job di stampa</h2><p className="mt-2 text-sm text-neutral-600">{health.printers.lastJob.printerName} · {health.printers.lastJob.documentType} · {health.printers.lastJob.status}</p>{health.printers.lastJob.lastError ? <p className="mt-2 text-sm text-red-700">{health.printers.lastJob.lastError}</p> : null}</section> : null}
      <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Suggerimenti di ripristino</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-700">{(health?.suggestions ?? ['Carica la diagnostica per ricevere indicazioni.']).map((item) => <li key={item}>{item}</li>)}</ul></section>
    </main>
  );
}

function HealthCard({ title, status, detail }: { title: string; status: Status; detail: string }) {
  return <article className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{title}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge[status]}`}>{status}</span></div><p className="mt-3 text-sm text-neutral-600">{detail}</p></article>;
}
