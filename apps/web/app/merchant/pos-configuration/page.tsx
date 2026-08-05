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

const modeCopy: Record<OperatorMode, string> = {
  AUTO: 'Deriva dal ruolo dell’utente',
  CASHIER: 'Cassa, Tavoli, Ordini, stampa e diagnostica',
  KITCHEN: 'Solo Cucina',
  MANAGER: 'Tutte le sezioni operative',
};

async function fetchPosConfiguration(): Promise<PosConfiguration> {
  const [devicesResponse, locationsResponse] = await Promise.all([
    fetch('/api/control-center/merchant/devices', { cache: 'no-store' }),
    fetch('/api/control-center/merchant/locations', { cache: 'no-store' }),
  ]);

  if (!devicesResponse.ok || !locationsResponse.ok) {
    throw new Error('Configurazione POS non disponibile.');
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
      setMessage(error instanceof Error ? error.message : 'Errore inatteso.');
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
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'Errore inatteso.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const activeDevices = useMemo(
    () => devices.filter((device) => device.active),
    [devices],
  );

  async function save(
    device: Device,
    locationId: string,
    operatorMode: OperatorMode,
  ) {
    setMessage(null);
    const response = await fetch(
      `/api/control-center/merchant/devices/${device.deviceId}/assignment`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locationId: locationId || undefined,
          operatorMode,
        }),
      },
    );
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      setMessage(payload?.message ?? 'Salvataggio non riuscito.');
      return;
    }
    setMessage(
      `Configurazione di ${device.deviceName} salvata. Il POS la riceverà alla prossima sincronizzazione.`,
    );
    await reload();
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
          POS
        </p>
        <h1 className="text-3xl font-semibold text-neutral-950">
          Configurazione dispositivi
        </h1>
        <p className="max-w-3xl text-sm text-neutral-600">
          Assegna sede e modalità operativa dal web. Stampanti e profilo fiscale
          restano configurazioni amministrative centralizzate; sul terminale POS
          rimane soltanto la diagnostica locale.
        </p>
      </header>

      <nav className="flex flex-wrap gap-3 text-sm">
        <a className="rounded-full border px-4 py-2" href="/merchant/location">
          Sedi e tavoli
        </a>
        <a
          className="rounded-full border px-4 py-2"
          href="/merchant/fiscal-documents"
        >
          Documenti fiscali
        </a>
      </nav>

      {message ? (
        <div className="rounded-xl border border-neutral-300 bg-white p-4 text-sm">
          {message}
        </div>
      ) : null}

      {loading ? <p>Caricamento dispositivi…</p> : null}
      {!loading && activeDevices.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6">
          Nessun dispositivo POS attivo assegnato all’organizzazione.
        </div>
      ) : null}

      <section className="grid gap-4">
        {activeDevices.map((device) => (
          <DeviceCard
            key={device.deviceId}
            device={device}
            locations={locations}
            onSave={save}
          />
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
  onSave: (
    device: Device,
    locationId: string,
    operatorMode: OperatorMode,
  ) => Promise<void>;
}) {
  const [locationId, setLocationId] = useState(device.locationId ?? '');
  const [operatorMode, setOperatorMode] = useState<OperatorMode>(
    device.operatorMode,
  );
  const [saving, setSaving] = useState(false);

  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-neutral-950">
            {device.deviceName}
          </h2>
          <p className="truncate text-sm text-neutral-600">
            {device.userDisplayName} · {device.userEmail}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {device.platform} · ultimo contatto{' '}
            {new Date(device.lastSeenAt).toLocaleString('it-IT')}
          </p>
        </div>

        <label className="grid min-w-56 gap-1 text-sm font-medium">
          Sede
          <select
            className="rounded-lg border px-3 py-2"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">Nessuna sede</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code} — {location.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid min-w-64 gap-1 text-sm font-medium">
          Modalità operatore
          <select
            className="rounded-lg border px-3 py-2"
            value={operatorMode}
            onChange={(event) =>
              setOperatorMode(event.target.value as OperatorMode)
            }
          >
            {(Object.keys(modeCopy) as OperatorMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {mode} — {modeCopy[mode]}
              </option>
            ))}
          </select>
        </label>

        <button
          className="rounded-lg bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          disabled={saving}
          type="button"
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(device, locationId, operatorMode);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
    </article>
  );
}
