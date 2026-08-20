'use client';

import { useEffect, useMemo, useState } from 'react';

type OperatorMode = 'AUTO' | 'CASHIER' | 'KITCHEN' | 'MANAGER';

type Device = {
  deviceId: string;
  deviceName: string;
  locationId: string | null;
  locationName: string | null;
  operatorMode: OperatorMode;
  active: boolean;
  lastSeenAt: string;
};

type Location = { id: string; name: string };
type PosConfiguration = { devices: Device[]; locations: Location[] };

const modeCopy: Record<OperatorMode, { label: string; description: string }> = {
  AUTO: { label: 'Automatico', description: 'Fluxa adatta il dispositivo a chi accede.' },
  CASHIER: { label: 'Cassa', description: 'Vendite, tavoli, ordini e ricevute.' },
  KITCHEN: { label: 'Cucina', description: 'Preparazione e comande.' },
  MANAGER: { label: 'Responsabile', description: 'Funzioni operative complete.' },
};

async function fetchConfiguration(): Promise<PosConfiguration> {
  const [devicesResponse, locationsResponse] = await Promise.all([
    fetch('/api/control-center/merchant/devices', { cache: 'no-store' }),
    fetch('/api/control-center/merchant/locations', { cache: 'no-store' }),
  ]);
  if (!devicesResponse.ok || !locationsResponse.ok) {
    throw new Error('Non siamo riusciti a caricare i dispositivi. Riprova.');
  }
  return {
    devices: (await devicesResponse.json()) as Device[],
    locations: (await locationsResponse.json()) as Location[],
  };
}

export function PosDevicesConsole() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const configuration = await fetchConfiguration();
      setDevices(configuration.devices);
      setLocations(configuration.locations);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Non siamo riusciti a caricare questa sezione.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetchConfiguration()
      .then((configuration) => {
        if (!cancelled) {
          setDevices(configuration.devices);
          setLocations(configuration.locations);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Non siamo riusciti a caricare questa sezione.');
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
      setMessage(payload?.message ?? 'Non siamo riusciti a salvare il dispositivo.');
      return;
    }
    setMessage(`${device.deviceName} aggiornato.`);
    await reload();
  }

  return (
    <div className="space-y-4">
      {message ? <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">{message}</div> : null}
      {loading ? (
        <div className="grid gap-4">
          {[0, 1].map((item) => <div className="h-32 animate-pulse rounded-2xl border bg-neutral-50" key={item} />)}
        </div>
      ) : null}
      {!loading && !activeDevices.length ? (
        <div className="rounded-2xl border border-dashed bg-white p-6">
          <strong>Non ci sono ancora dispositivi POS attivi.</strong>
          <p className="muted mt-1">Quando colleghi un POS a Fluxa comparirà automaticamente qui.</p>
        </div>
      ) : null}
      {!loading ? activeDevices.map((device) => (
        <DeviceCard device={device} key={device.deviceId} locations={locations} onSave={save} />
      )) : null}
    </div>
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
      <div className="grid gap-5 lg:grid-cols-[minmax(180px,1fr)_220px_260px_auto] lg:items-end">
        <div>
          <h3 className="text-lg font-semibold">{device.deviceName}</h3>
          <p className="muted">{device.locationName ?? 'Nessuna sede assegnata'}</p>
          <p className="mt-1 text-xs text-neutral-500">Ultimo collegamento {new Date(device.lastSeenAt).toLocaleString('it-IT')}</p>
        </div>
        <label className="field"><span>Sede</span><select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Nessuna sede</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label className="field"><span>Uso</span><select value={operatorMode} onChange={(event) => setOperatorMode(event.target.value as OperatorMode)}>{(Object.keys(modeCopy) as OperatorMode[]).map((mode) => <option key={mode} value={mode}>{modeCopy[mode].label}</option>)}</select><small className="muted">{modeCopy[operatorMode].description}</small></label>
        <button className="button-primary" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(device, locationId, operatorMode); } finally { setSaving(false); } }} type="button">{saving ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </article>
  );
}
