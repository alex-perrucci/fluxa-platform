'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import { StatusBadge } from '@/components/control-center/status-badge';

export interface MerchantLocation {
  id: string;
  code: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  countryCode: string;
  timezone: string;
  status: 'ACTIVE' | 'INACTIVE';
  kind: 'PERMANENT' | 'TEMPORARY';
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  canManageLocation: boolean;
  canManageTables: boolean;
}

export interface DiningArea {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface DiningTable {
  id: string;
  areaId: string;
  areaCode: string;
  areaName: string;
  code: string;
  name: string;
  capacity: number;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
}

interface Props {
  initialLocations: MerchantLocation[];
  initialLocationId: string | null;
  initialAreas: DiningArea[];
  initialTables: DiningTable[];
}

async function responseBody(response: Response) {
  return (await response.json()) as { message?: string };
}

export function LocationConsole({
  initialLocations,
  initialLocationId,
  initialAreas,
  initialTables,
}: Props) {
  const [locations, setLocations] = useState(initialLocations);
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [areas, setAreas] = useState(initialAreas);
  const [tables, setTables] = useState(initialTables);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const location = useMemo(
    () => locations.find((item) => item.id === locationId) ?? null,
    [locationId, locations],
  );
  const totalCapacity = useMemo(
    () =>
      tables
        .filter((table) => table.status === 'ACTIVE')
        .reduce((sum, table) => sum + table.capacity, 0),
    [tables],
  );

  async function refreshLocations() {
    const response = await fetch('/api/control-center/merchant/locations');
    if (response.ok) {
      setLocations((await response.json()) as MerchantLocation[]);
    }
  }

  async function refreshLayout(targetLocationId = locationId) {
    if (!targetLocationId) {
      setAreas([]);
      setTables([]);
      return;
    }

    const [areasResponse, tablesResponse] = await Promise.all([
      fetch(
        `/api/control-center/merchant/areas?locationId=${encodeURIComponent(targetLocationId)}`,
      ),
      fetch(
        `/api/control-center/merchant/tables?locationId=${encodeURIComponent(targetLocationId)}`,
      ),
    ]);

    if (!areasResponse.ok || !tablesResponse.ok) {
      const failed = !areasResponse.ok ? areasResponse : tablesResponse;
      const body = await responseBody(failed);
      throw new Error(body.message ?? 'Configurazione locale non caricata.');
    }

    setAreas((await areasResponse.json()) as DiningArea[]);
    setTables((await tablesResponse.json()) as DiningTable[]);
  }

  async function changeLocation(nextLocationId: string) {
    setLocationId(nextLocationId);
    setPending(true);
    setError(null);
    setMessage(null);
    setAreas([]);
    setTables([]);

    try {
      await refreshLayout(nextLocationId);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Configurazione locale non caricata.',
      );
    } finally {
      setPending(false);
    }
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/control-center/merchant/locations/${location.id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code: String(form.get('code') ?? ''),
            name: String(form.get('name') ?? ''),
            addressLine1: String(form.get('addressLine1') ?? ''),
            addressLine2: String(form.get('addressLine2') ?? ''),
            postalCode: String(form.get('postalCode') ?? ''),
            city: String(form.get('city') ?? ''),
            province: String(form.get('province') ?? ''),
            timezone: String(form.get('timezone') ?? ''),
          }),
        },
      );
      const body = await responseBody(response);
      if (!response.ok) {
        throw new Error(body.message ?? 'Location non aggiornata.');
      }
      await refreshLocations();
      setMessage('Dati della location aggiornati.');
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Location non aggiornata.',
      );
    } finally {
      setPending(false);
    }
  }

  async function createArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/control-center/merchant/areas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locationId: location.id,
          code: String(form.get('code') ?? ''),
          name: String(form.get('name') ?? ''),
          sortOrder: areas.length,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.message ?? 'Sala non creata.');
      event.currentTarget.reset();
      await refreshLayout();
      setMessage('Sala creata.');
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'Sala non creata.',
      );
    } finally {
      setPending(false);
    }
  }

  async function createTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/control-center/merchant/tables', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locationId: location.id,
          areaId: String(form.get('areaId') ?? ''),
          code: String(form.get('code') ?? ''),
          name: String(form.get('name') ?? ''),
          capacity: Number(form.get('capacity')),
          sortOrder: tables.length,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.message ?? 'Tavolo non creato.');
      event.currentTarget.reset();
      await refreshLayout();
      setMessage('Tavolo creato.');
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Tavolo non creato.',
      );
    } finally {
      setPending(false);
    }
  }

  async function updateArea(
    event: FormEvent<HTMLFormElement>,
    area: DiningArea,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(
      `/api/control-center/merchant/areas/${area.id}`,
      {
        code: String(form.get('code') ?? ''),
        name: String(form.get('name') ?? ''),
        status: String(form.get('status') ?? 'ACTIVE'),
      },
      'Sala aggiornata.',
    );
  }

  async function updateTable(
    event: FormEvent<HTMLFormElement>,
    table: DiningTable,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(
      `/api/control-center/merchant/tables/${table.id}`,
      {
        areaId: String(form.get('areaId') ?? ''),
        code: String(form.get('code') ?? ''),
        name: String(form.get('name') ?? ''),
        capacity: Number(form.get('capacity')),
        status: String(form.get('status') ?? 'ACTIVE'),
      },
      'Tavolo aggiornato.',
    );
  }

  async function mutate(
    url: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.message ?? 'Modifica non salvata.');
      await refreshLayout();
      setMessage(successMessage);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Modifica non salvata.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Operazione non completata"
      />
      <ControlCenterNotification
        message={message}
        onDismiss={() => setMessage(null)}
        title="Locale aggiornato"
      />

      <div className="filter-bar">
        <select
          disabled={pending}
          onChange={(event) => void changeLocation(event.target.value)}
          value={locationId}
        >
          {locations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.code}
            </option>
          ))}
        </select>
        <span className="muted">
          {areas.length} sale · {tables.length} tavoli · {totalCapacity} posti
        </span>
      </div>

      {location ? (
        <>
          <section className="glass-panel panel-padding mt-5">
            <div className="wizard-actions">
              <div>
                <strong>Dati location</strong>
                <p className="muted">
                  {location.kind === 'TEMPORARY'
                    ? 'Temporanea'
                    : 'Permanente'}{' '}
                  · {location.city}
                </p>
              </div>
              <StatusBadge status={location.lifecycleStatus} />
            </div>
            <form className="form-grid mt-5" onSubmit={saveLocation}>
              <label className="field">
                <span>Codice</span>
                <input
                  defaultValue={location.code}
                  disabled={!location.canManageLocation}
                  key={`${location.id}-code`}
                  name="code"
                  required
                />
              </label>
              <label className="field">
                <span>Nome</span>
                <input
                  defaultValue={location.name}
                  disabled={!location.canManageLocation}
                  key={`${location.id}-name`}
                  name="name"
                  required
                />
              </label>
              <label className="field span-2">
                <span>Indirizzo</span>
                <input
                  defaultValue={location.addressLine1}
                  disabled={!location.canManageLocation}
                  key={`${location.id}-address-1`}
                  name="addressLine1"
                  required
                />
              </label>
              <label className="field span-2">
                <span>Dettagli indirizzo</span>
                <input
                  defaultValue={location.addressLine2 ?? ''}
                  disabled={!location.canManageLocation}
                  key={`${location.id}-address-2`}
                  name="addressLine2"
                />
              </label>
              <label className="field">
                <span>CAP</span>
                <input
                  defaultValue={location.postalCode}
                  disabled={!location.canManageLocation}
                  key={`${location.id}-postal-code`}
                  name="postalCode"
                  required
                />
              </label>
              <label className="field">
                <span>Città</span>
                <input
                  defaultValue={location.city}
                  disabled={!location.canManageLocation}
                  key={`${location.id}-city`}
                  name="city"
                  required
                />
              </label>
              <label className="field">
                <span>Provincia</span>
                <input
                  defaultValue={location.province ?? ''}
                  disabled={!location.canManageLocation}
                  key={`${location.id}-province`}
                  name="province"
                />
              </label>
              <label className="field">
                <span>Timezone</span>
                <input
                  defaultValue={location.timezone}
                  disabled={!location.canManageLocation}
                  key={`${location.id}-timezone`}
                  name="timezone"
                  required
                />
              </label>
              {location.canManageLocation ? (
                <div className="wizard-actions span-2">
                  <span />
                  <button
                    className="button-primary"
                    disabled={pending}
                    type="submit"
                  >
                    Salva dati location
                  </button>
                </div>
              ) : null}
            </form>
          </section>

          <section className="glass-panel panel-padding mt-5">
            <div className="wizard-actions">
              <strong>Sale</strong>
              <span className="muted">Organizza gli spazi operativi</span>
            </div>
            {location.canManageTables ? (
              <form className="form-grid mt-5" onSubmit={createArea}>
                <label className="field">
                  <span>Codice nuova sala</span>
                  <input name="code" placeholder="SALA1" required />
                </label>
                <label className="field">
                  <span>Nome nuova sala</span>
                  <input
                    name="name"
                    placeholder="Sala principale"
                    required
                  />
                </label>
                <div className="wizard-actions span-2">
                  <span />
                  <button
                    className="button-primary"
                    disabled={pending}
                    type="submit"
                  >
                    Aggiungi sala
                  </button>
                </div>
              </form>
            ) : null}
            <div className="data-list mt-5">
              {areas.map((area) => (
                <form
                  className="data-row"
                  key={area.id}
                  onSubmit={(event) => void updateArea(event, area)}
                >
                  <div>
                    <input
                      defaultValue={area.name}
                      disabled={!location.canManageTables}
                      name="name"
                      required
                    />
                    <small>{area.code}</small>
                  </div>
                  <div>
                    <input
                      defaultValue={area.code}
                      disabled={!location.canManageTables}
                      name="code"
                      required
                    />
                    <select
                      defaultValue={area.status}
                      disabled={!location.canManageTables}
                      name="status"
                    >
                      <option value="ACTIVE">Attiva</option>
                      <option value="INACTIVE">Inattiva</option>
                    </select>
                  </div>
                  {location.canManageTables ? (
                    <button
                      className="button-secondary"
                      disabled={pending}
                      type="submit"
                    >
                      Salva
                    </button>
                  ) : (
                    <StatusBadge status={area.status} />
                  )}
                </form>
              ))}
            </div>
          </section>

          <section className="glass-panel panel-padding mt-5">
            <div className="wizard-actions">
              <strong>Tavoli e capienze</strong>
              <span className="muted">
                Capienza totale attiva: {totalCapacity}
              </span>
            </div>
            {location.canManageTables && areas.length ? (
              <form className="form-grid mt-5" onSubmit={createTable}>
                <label className="field">
                  <span>Sala</span>
                  <select name="areaId" required>
                    {areas
                      .filter((area) => area.status === 'ACTIVE')
                      .map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span>Codice</span>
                  <input name="code" placeholder="T1" required />
                </label>
                <label className="field">
                  <span>Nome</span>
                  <input name="name" placeholder="Tavolo 1" required />
                </label>
                <label className="field">
                  <span>Posti</span>
                  <input
                    max={100}
                    min={1}
                    name="capacity"
                    required
                    type="number"
                  />
                </label>
                <div className="wizard-actions span-2">
                  <span />
                  <button
                    className="button-primary"
                    disabled={pending}
                    type="submit"
                  >
                    Aggiungi tavolo
                  </button>
                </div>
              </form>
            ) : null}
            <div className="data-list mt-5">
              {tables.map((table) => (
                <form
                  className="data-row"
                  key={table.id}
                  onSubmit={(event) => void updateTable(event, table)}
                >
                  <div>
                    <input
                      defaultValue={table.name}
                      disabled={!location.canManageTables}
                      name="name"
                      required
                    />
                    <small>
                      {table.code} · {table.areaName}
                    </small>
                  </div>
                  <div>
                    <select
                      defaultValue={table.areaId}
                      disabled={!location.canManageTables}
                      name="areaId"
                    >
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                    <input
                      defaultValue={table.code}
                      disabled={!location.canManageTables}
                      name="code"
                      required
                    />
                  </div>
                  <div>
                    <input
                      defaultValue={table.capacity}
                      disabled={!location.canManageTables}
                      max={100}
                      min={1}
                      name="capacity"
                      type="number"
                    />
                    <select
                      defaultValue={table.status}
                      disabled={!location.canManageTables}
                      name="status"
                    >
                      <option value="ACTIVE">Attivo</option>
                      <option value="INACTIVE">Inattivo</option>
                    </select>
                    {location.canManageTables ? (
                      <button
                        className="button-secondary"
                        disabled={pending}
                        type="submit"
                      >
                        Salva
                      </button>
                    ) : null}
                  </div>
                </form>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
