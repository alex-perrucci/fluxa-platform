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

function statusLabel(status: Status) {
  switch (status) {
    case 'OK': return 'Operativo';
    case 'DEGRADED': return 'Da verificare';
    case 'DOWN': return 'Non operativo';
    case 'NOT_CONFIGURED': return 'Da configurare';
    default: return 'Verifica in corso';
  }
}

function statusClass(status: Status) {
  if (status === 'OK') return 'bg-emerald-100 text-emerald-800';
  if (status === 'DEGRADED' || status === 'NOT_CONFIGURED') return 'bg-amber-100 text-amber-800';
  if (status === 'DOWN') return 'bg-red-100 text-red-800';
  return 'bg-neutral-100 text-neutral-700';
}

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
      if (!response.ok) throw new Error('Non siamo riusciti a verificare lo stato del locale. Riprova.');
      const payload = (await response.json()) as Health;
      payload.api.latencyMs = Math.round(performance.now() - startedAt);
      setHealth(payload);
      setNetworkOnline(true);
    } catch (error) {
      setNetworkOnline(navigator.onLine);
      setMessage(error instanceof Error ? error.message : 'Non siamo riusciti a caricare questa sezione. Riprova.');
    }
  }

  useEffect(() => {
    const updateNetwork = () => setNetworkOnline(navigator.onLine);
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    void fetch('/api/control-center/merchant/locations', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Non siamo riusciti a caricare le sedi.');
        return (await response.json()) as Location[];
      })
      .then((items) => {
        setLocations(items);
        const first = items[0]?.id ?? '';
        setLocationId(first);
        if (first) void load(first);
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Non siamo riusciti a caricare questa sezione.'));
    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
    };
    // The initial request deliberately runs once; later refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const overall = health?.overallStatus ?? 'UNKNOWN';
  const operational = overall === 'OK' && networkOnline;
  const offlinePrinters = health?.printers.items.filter((printer) => printer.status !== 'OK') ?? [];

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Assistenza</p>
        <h1 className="text-3xl font-semibold text-neutral-950">Stato del locale</h1>
        <p className="max-w-3xl text-sm text-neutral-600">Qui vedi solo ciò che può impedirti di lavorare. I dettagli tecnici restano disponibili per l’assistenza.</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <select className="rounded-lg border px-3 py-2" value={locationId} onChange={(event) => { setLocationId(event.target.value); void load(event.target.value); }}>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
        <button className="button-secondary" type="button" onClick={() => void load()}>Aggiorna</button>
      </div>

      {message ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div> : null}

      <section className={`rounded-2xl border bg-white p-6 ${operational ? 'border-emerald-200' : 'border-amber-200'}`}>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-neutral-500">Posso lavorare?</p>
        <h2 className="mt-2 text-2xl font-semibold">{operational ? 'Tutto operativo' : 'Serve attenzione'}</h2>
        <p className="mt-2 text-sm text-neutral-600">
          {operational
            ? 'Non risultano problemi che richiedono il tuo intervento.'
            : !networkOnline
              ? 'Questo dispositivo non è connesso a Internet.'
              : health?.suggestions[0] ?? 'Controlla gli elementi indicati qui sotto.'}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <SimpleStatus title="Connessione" status={networkOnline ? 'OK' : 'DOWN'} detail={networkOnline ? 'Dispositivo online' : 'Connessione non disponibile'} />
        <SimpleStatus title="Stampanti" status={health?.printers.status ?? 'UNKNOWN'} detail={offlinePrinters.length ? `${offlinePrinters.length} richiedono attenzione` : `${health?.printers.items.length ?? 0} configurate`} />
        <SimpleStatus title="Fiscalizzazione" status={health?.fiscal.status ?? 'UNKNOWN'} detail={health?.fiscal.status === 'OK' ? 'Emissione disponibile' : 'Contatta Fluxa se il problema persiste'} />
        <SimpleStatus title="Pagamenti" status={health?.paymentTerminal.status ?? 'UNKNOWN'} detail={health?.paymentTerminal.status === 'OK' ? 'Servizio disponibile' : 'Verifica il terminale se lo utilizzi'} />
      </section>

      {health?.suggestions.length ? (
        <section className="rounded-2xl border bg-white p-5">
          <h2 className="font-semibold">Come risolvere</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-neutral-700">{health.suggestions.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}

      <details className="rounded-2xl border bg-white p-5">
        <summary className="cursor-pointer font-semibold">Dettagli tecnici per assistenza</summary>
        <div className="mt-4 grid gap-3 text-sm text-neutral-700 md:grid-cols-2">
          <p><strong>API:</strong> {statusLabel(health?.api.status ?? 'UNKNOWN')} · {health?.api.latencyMs ?? '—'} ms</p>
          <p><strong>Ultima verifica:</strong> {health ? new Date(health.generatedAt).toLocaleString('it-IT') : '—'}</p>
          {health?.printers.lastJob ? <p><strong>Ultima stampa:</strong> {health.printers.lastJob.printerName} · {health.printers.lastJob.status}</p> : null}
          {health?.printers.lastJob?.lastError ? <p><strong>Errore stampa:</strong> {health.printers.lastJob.lastError}</p> : null}
        </div>
        <button className="button-secondary mt-4" disabled={!health} type="button" onClick={exportDiagnostics}>Esporta diagnostica</button>
      </details>
    </main>
  );
}

function SimpleStatus({ title, status, detail }: { title: string; status: Status; detail: string }) {
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>{statusLabel(status)}</span>
      </div>
      <p className="mt-3 text-sm text-neutral-600">{detail}</p>
    </article>
  );
}
