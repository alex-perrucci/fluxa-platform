'use client';

import { useMemo, useState } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import type {
  PlatformOrganizationDetail,
  PlatformTableLayout,
} from '@/lib/control-center/types';

interface EditableTable {
  id?: string;
  code: string;
  name: string;
  capacity: number;
}

interface Props {
  organizationId: string;
  locations: PlatformOrganizationDetail['locations'];
  initialLayout: PlatformTableLayout | null;
}

function createTable(index: number, capacity: number): EditableTable {
  return {
    code: `T${index + 1}`,
    name: `Tavolo ${index + 1}`,
    capacity,
  };
}

function activeTables(layout: PlatformTableLayout): EditableTable[] {
  return layout.tables
    .filter((table) => table.status === 'ACTIVE')
    .map((table) => ({
      id: table.id,
      code: table.code,
      name: table.name,
      capacity: table.capacity,
    }));
}

export function PlatformTableLayoutEditor({
  organizationId,
  locations,
  initialLayout,
}: Props) {
  const [layout, setLayout] = useState(initialLayout);
  const [locationId, setLocationId] = useState(
    initialLayout?.location.id ?? locations[0]?.id ?? '',
  );
  const [areaId, setAreaId] = useState(
    initialLayout?.areas.find((area) => area.status === 'ACTIVE')?.id ?? '',
  );
  const [tables, setTables] = useState<EditableTable[]>(() =>
    initialLayout ? activeTables(initialLayout) : [],
  );
  const [defaultCapacity, setDefaultCapacity] = useState(4);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeAreas = useMemo(
    () => layout?.areas.filter((area) => area.status === 'ACTIVE') ?? [],
    [layout],
  );

  function resizeTables(nextCount: number) {
    const safeCount = Math.min(100, Math.max(1, nextCount || 1));
    setTables((current) =>
      Array.from(
        { length: safeCount },
        (_, index) =>
          current[index] ?? createTable(index, defaultCapacity),
      ),
    );
  }

  function updateTable(index: number, patch: Partial<EditableTable>) {
    setTables((current) =>
      current.map((table, tableIndex) =>
        tableIndex === index ? { ...table, ...patch } : table,
      ),
    );
  }

  async function loadLocation(nextLocationId: string) {
    setLocationId(nextLocationId);
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/control-center/platform/organizations/${organizationId}/table-layout?locationId=${encodeURIComponent(nextLocationId)}`,
      );
      const body = (await response.json()) as
        | PlatformTableLayout
        | { message?: string };
      if (!response.ok) {
        throw new Error(
          'message' in body && body.message
            ? body.message
            : 'Layout della sede non disponibile.',
        );
      }
      const nextLayout = body as PlatformTableLayout;
      setLayout(nextLayout);
      setAreaId(
        nextLayout.areas.find((area) => area.status === 'ACTIVE')?.id ?? '',
      );
      setTables(activeTables(nextLayout));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Layout della sede non disponibile.',
      );
    } finally {
      setPending(false);
    }
  }

  async function save() {
    setError(null);
    setMessage(null);

    if (!locationId || !areaId) {
      setError('Seleziona una sede e una sala attiva.');
      return;
    }

    const normalized = tables.map((table) => ({
      id: table.id,
      code: table.code.trim().toUpperCase(),
      name: table.name.trim(),
      capacity: table.capacity,
    }));
    if (
      normalized.some(
        (table) =>
          !table.code ||
          !table.name ||
          !Number.isInteger(table.capacity) ||
          table.capacity < 1 ||
          table.capacity > 100,
      )
    ) {
      setError('Controlla codice, nome e posti di ogni tavolo.');
      return;
    }
    if (new Set(normalized.map((table) => table.code)).size !== normalized.length) {
      setError('I codici dei tavoli devono essere univoci.');
      return;
    }

    setPending(true);
    try {
      const response = await fetch(
        `/api/control-center/platform/organizations/${organizationId}/table-layout`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locationId, areaId, tables: normalized }),
        },
      );
      const body = (await response.json()) as
        | PlatformTableLayout
        | { message?: string };
      if (!response.ok) {
        throw new Error(
          'message' in body && body.message
            ? body.message
            : 'Configurazione tavoli non salvata.',
        );
      }
      const nextLayout = body as PlatformTableLayout;
      setLayout(nextLayout);
      setTables(activeTables(nextLayout));
      setMessage(`${activeTables(nextLayout).length} tavoli salvati.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Configurazione tavoli non salvata.',
      );
    } finally {
      setPending(false);
    }
  }

  if (locations.length === 0) {
    return <p className="muted">Crea prima una sede operativa.</p>;
  }

  return (
    <div>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Configurazione non salvata"
      />
      <ControlCenterNotification
        message={message}
        onDismiss={() => setMessage(null)}
        title="Layout aggiornato"
      />

      <div className="form-grid">
        <label className="field">
          <span>Sede</span>
          <select
            disabled={pending}
            onChange={(event) => void loadLocation(event.target.value)}
            value={locationId}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Sala</span>
          <select
            disabled={pending || activeAreas.length === 0}
            onChange={(event) => setAreaId(event.target.value)}
            value={areaId}
          >
            {activeAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Numero tavoli</span>
          <input
            max={100}
            min={1}
            onChange={(event) => resizeTables(Number(event.target.value))}
            type="number"
            value={Math.max(1, tables.length)}
          />
        </label>
        <label className="field">
          <span>Posti da applicare</span>
          <input
            max={100}
            min={1}
            onChange={(event) =>
              setDefaultCapacity(
                Math.min(100, Math.max(1, Number(event.target.value) || 1)),
              )
            }
            type="number"
            value={defaultCapacity}
          />
        </label>
      </div>

      <div className="table-editor-toolbar">
        <div>
          <strong>{tables.length} tavoli attivi</strong>
          <span>I tavoli rimossi vengono disattivati senza perdere lo storico.</span>
        </div>
        <button
          className="button-secondary"
          onClick={() =>
            setTables((current) =>
              current.map((table) => ({ ...table, capacity: defaultCapacity })),
            )
          }
          type="button"
        >
          Applica {defaultCapacity} posti a tutti
        </button>
      </div>

      <div className="table-editor">
        {tables.map((table, index) => (
          <div className="table-editor-row" key={table.id ?? `new-${index}`}>
            <div className="table-editor-index">{index + 1}</div>
            <label className="field">
              <span>Codice</span>
              <input
                maxLength={40}
                onChange={(event) =>
                  updateTable(index, { code: event.target.value })
                }
                value={table.code}
              />
            </label>
            <label className="field">
              <span>Nome</span>
              <input
                maxLength={120}
                onChange={(event) =>
                  updateTable(index, { name: event.target.value })
                }
                value={table.name}
              />
            </label>
            <label className="field table-editor-capacity">
              <span>Posti</span>
              <input
                max={100}
                min={1}
                onChange={(event) =>
                  updateTable(index, {
                    capacity: Math.min(
                      100,
                      Math.max(1, Number(event.target.value) || 1),
                    ),
                  })
                }
                type="number"
                value={table.capacity}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="wizard-actions">
        <span className="muted">
          Non puoi disattivare un tavolo con una sessione aperta.
        </span>
        <button
          className="button-primary"
          disabled={pending || !areaId}
          onClick={() => void save()}
          type="button"
        >
          {pending ? 'Salvataggio…' : 'Salva configurazione'}
        </button>
      </div>
    </div>
  );
}
