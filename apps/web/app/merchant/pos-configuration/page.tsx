'use client';

import { useEffect, useMemo, useState } from 'react';

type OperatorMode = 'AUTO' | 'CASHIER' | 'KITCHEN' | 'MANAGER';

type Device = {
  deviceId: string;
  deviceName: string;
  installationId: string;
  platform: string;
  userDisplayName: string;
  userEmail: string;
  locationId: string | null;
  locationName: string | null;
  operatorMode: OperatorMode;
  active: boolean;
  lastSeenAt: string;
};

type Location = {
  id: string;
  code: string;
  name: string;
};

type PosConfiguration = {
  devices: Device[];
  locations: Location[];
};

const modeCopy: Record<OperatorMode, { label: string; description: string }> = {
  AUTO: { label: 'Automatico', description: 'Fluxa usa il ruolo della persona che accede.' },
  CASHIER: { label: 'Cassa', description: 'Vendite, tavoli, ordini e stampa.' },
  KITCHEN: { label: 'Cucina', description: 'Schermate dedicate alla preparazione.' },
  MANAGER: { label: 'Responsabile', description: 'Accesso alle funzioni operative complete.' },
};

async function fetchPosConfiguration(): Promise<PosConfiguration> {
  const [devicesResponse, locationsResponse] = await Promise.all([
    fetch('/api/control-center/merchant/devices', { cache: 'no-store' }),
    fetch('/api/control-center/merchant/locations', { cache: 'no-store' }),
  ]);

  if (!devicesResponse.ok || !locationsResponse.ok) {
    throw new Error('Non siamo riusciti a caricare i dispositivi POS. Riprova.');
  }

  return {
    devices: (await devicesResponse.json()) as Device[],
    locations: (await locationsResponse.json()) as Location[],
  };
}

export default function PosConfigurationPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  function applyConfiguration(configuration: PosConfiguration) {
    setDevices(configuration.devices);
    setLocations(configuration.locations);
  }

  async function reload() {
    setLoading(true);
    setMessage(null);
    try {
      applyConfiguration(await fetchPosConfiguration());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Non siamo riusciti a caricare questa sezione. Riprova.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetchPosConfiguration()
      .then((configuration) => {
        if (!cancelled) {
          setDevices(configuration.devices);
          setLocations(configuration.locations);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Non siamo riusciti a caricare questa sezione. Riprova.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const activeDevices = useMemo(() => devices.filter((device) => device.active), [devices]);

  async function save(device: Device, locationId: string, operatorMode: OperatorMode) {
    setMessage(null);
    const response = await fetch(`/api/control-center/merchant/devices/${device.deviceId}/assignment`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locationId: locationId || undefined, operatorMode }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setMessage(payload?.message ?? 'Non siamo riusciti a salvare il dispositivo. Riprova.');
      return;
    }
    setMessage(`${device.deviceName} aggiornato. Il POS riceverà la modifica alla prossima sincronizzazione.`);
    await reload();
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">Operatività</p>
        <h1 className="text-3xl font-semibold text-neutral-950">Dispositivi POS</h1>
        <p className="max-w-3xl text-sm text-neutral-600">
          Dai un nome chiaro a ogni cassa e scegli dove viene usata. I dettagli tecnici restano disponibili solo per assistenza.
        </p>
      </header>

      {message ? <div className="rounded-xl border border-neutral-300 bg-white p-4 text-sm">{message}</div> : null}
      {loading ? <p>Caricamento dispositivi…</p> : null}
      {!loading && activeDevices.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-6">
          <strong>Non ci sono ancora dispositivi POS attivi.</strong>
          <p className="mt-1 text-sm text-neutral-600">Quando un POS viene collegato a Fluxa comparirà qui.</p>
        </div>
      ) : null}

      <section className="grid gap-4">
        {activeDevices.map((device) => (
          <DeviceCard key={device.deviceId} device={device} locations={locations} onSave={save} />
        ))}
      </section>
    </main>
  );
}

function DeviceCard({
  device,
  locations,
  onSave,
}: {
  device: Device;
  locations: Location[];
  onSave: (device: Device, locationId: string, operatorMode: OperatorMode) => Promise<void>;
}) {
  const [locationId, setLocationId] = useState(device.locationId ?? '');
  const [operatorMode, setOperatorMode] = useState<OperatorMode>(device.operatorMode);
  const [saving, setSaving] = useState(false);

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-neutral-950">{device.deviceName}</h2>
          <p className="truncate text-sm text-neutral-600">{device.locationName ?? 'Nessuna sede assegnata'}</p>
          <p className="mt-1 text-xs text-neutral-500">Online {new Date(device.lastSeenAt).toLocaleString('it-IT')}</p>
        </div>

        <label className="grid min-w-56 gap-1 text-sm font-medium">
          Sede
          <select className="rounded-lg border px-3 py-2" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
            <option value="">Nessuna sede</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>

        <label className="grid min-w-64 gap-1 text-sm font-medium">
          Come viene usato?
          <select className="rounded-lg border px-3 py-2" value={operatorMode} onChange={(event) => setOperatorMode(event.target.value as OperatorMode)}>
            {(Object.keys(modeCopy) as OperatorMode[]).map((mode) => <option key={mode} value={mode}>{modeCopy[mode].label}</option>)}
          </select>
          <span className="text-xs font-normal text-neutral-500">{modeCopy[operatorMode].description}</span>
        </label>

        <button
          className="rounded-lg bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          disabled={saving}
          type="button"
          onClick={async () => {
            setSaving(true);
            try { await onSave(device, locationId, operatorMode); }
            finally { setSaving(false); }
          }}
        >
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>

      <details className="mt-4 border-t border-neutral-100 pt-3 text-sm text-neutral-600">
        <summary className="cursor-pointer font-medium">Dettagli tecnici per assistenza</summary>
        <dl className="mt-3 grid gap-2 md:grid-cols-2">
          <div><dt className="font-medium">Utente</dt><dd>{device.userDisplayName} · {device.userEmail}</dd></div>
          <div><dt className="font-medium">Piattaforma</dt><dd>{device.platform}</dd></div>
          <div><dt className="font-medium">ID dispositivo</dt><dd className="break-all">{device.deviceId}</dd></div>
          <div><dt className="font-medium">Installazione</dt><dd className="break-all">{device.installationId}</dd></div>
        </dl>
      </details>
    </article>
  );
}
