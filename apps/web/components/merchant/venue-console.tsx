'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import type { DiningArea, DiningTable, MerchantLocation } from './location-console';

type InitialAction = 'table' | 'area' | null;

interface Props {
  initialLocations: MerchantLocation[];
  initialLocationId: string | null;
  initialAreas: DiningArea[];
  initialTables: DiningTable[];
  initialAction?: InitialAction;
}

async function responseBody(response: Response) {
  return (await response.json().catch(() => null)) as { message?: string } | null;
}

function internalCode(name: string, prefix: string) {
  const safe = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || prefix;
  const suffix = Date.now().toString(36).slice(-5).toUpperCase();
  return `${safe.slice(0, 30)}_${suffix}`;
}

export function VenueConsole({
  initialLocations,
  initialLocationId,
  initialAreas,
  initialTables,
  initialAction = null,
}: Props) {
  const [locations, setLocations] = useState(initialLocations);
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [areas, setAreas] = useState(initialAreas);
  const [tables, setTables] = useState(initialTables);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAreaComposer, setShowAreaComposer] = useState(initialAction === 'area');
  const [showTableComposer, setShowTableComposer] = useState(initialAction === 'table');

  const location = useMemo(
    () => locations.find((item) => item.id === locationId) ?? null,
    [locationId, locations],
  );
  const activeAreas = areas.filter((area) => area.status === 'ACTIVE');
  const activeTables = tables.filter((table) => table.status === 'ACTIVE');
  const totalCapacity = activeTables.reduce((sum, table) => sum + table.capacity, 0);

  async function refreshLocations() {
    const response = await fetch('/api/control-center/merchant/locations');
    if (!response.ok) return;
    setLocations((await response.json()) as MerchantLocation[]);
  }

  async function refreshLayout(targetLocationId = locationId) {
    if (!targetLocationId) {
      setAreas([]);
      setTables([]);
      return;
    }
    const encoded = encodeURIComponent(targetLocationId);
    const [areasResponse, tablesResponse] = await Promise.all([
      fetch(`/api/control-center/merchant/areas?locationId=${encoded}`),
      fetch(`/api/control-center/merchant/tables?locationId=${encoded}`),
    ]);
    if (!areasResponse.ok || !tablesResponse.ok) {
      const failed = !areasResponse.ok ? areasResponse : tablesResponse;
      const body = await responseBody(failed);
      throw new Error(body?.message ?? 'Non siamo riusciti a caricare sale e tavoli.');
    }
    setAreas((await areasResponse.json()) as DiningArea[]);
    setTables((await tablesResponse.json()) as DiningTable[]);
  }

  async function run(action: () => Promise<void>, success: string) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Operazione non completata. Riprova.');
    } finally {
      setPending(false);
    }
  }

  async function changeLocation(nextLocationId: string) {
    setLocationId(nextLocationId);
    await run(() => refreshLayout(nextLocationId), 'Locale caricato.');
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location) return;
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const response = await fetch(`/api/control-center/merchant/locations/${location.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? location.code),
          name: String(form.get('name') ?? location.name),
          addressLine1: String(form.get('addressLine1') ?? location.addressLine1),
          addressLine2: String(form.get('addressLine2') ?? location.addressLine2 ?? ''),
          postalCode: String(form.get('postalCode') ?? location.postalCode),
          city: String(form.get('city') ?? location.city),
          province: String(form.get('province') ?? location.province ?? ''),
          timezone: String(form.get('timezone') ?? location.timezone),
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body?.message ?? 'Dati della sede non aggiornati.');
      await refreshLocations();
    }, 'Dati della sede aggiornati.');
  }

  async function createArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name') ?? '').trim();
    await run(async () => {
      const response = await fetch('/api/control-center/merchant/areas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locationId: location.id,
          code: internalCode(name, 'SALA'),
          name,
          sortOrder: areas.length,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body?.message ?? 'Sala non creata.');
      formElement.reset();
      setShowAreaComposer(false);
      await refreshLayout(location.id);
    }, 'Sala creata.');
  }

  async function createTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name') ?? '').trim();
    await run(async () => {
      const response = await fetch('/api/control-center/merchant/tables', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locationId: location.id,
          areaId: String(form.get('areaId') ?? ''),
          code: internalCode(name, 'TAVOLO'),
          name,
          capacity: Number(form.get('capacity') ?? 4),
          sortOrder: tables.length,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body?.message ?? 'Tavolo non creato.');
      formElement.reset();
      setShowTableComposer(false);
      await refreshLayout(location.id);
    }, 'Tavolo creato.');
  }

  async function saveArea(event: FormEvent<HTMLFormElement>, area: DiningArea) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const response = await fetch(`/api/control-center/merchant/areas/${area.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: area.code,
          name: String(form.get('name') ?? area.name),
          status: String(form.get('status') ?? area.status),
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body?.message ?? 'Sala non aggiornata.');
      await refreshLayout();
    }, 'Sala aggiornata.');
  }

  async function saveTable(event: FormEvent<HTMLFormElement>, table: DiningTable) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const response = await fetch(`/api/control-center/merchant/tables/${table.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          areaId: String(form.get('areaId') ?? table.areaId),
          code: table.code,
          name: String(form.get('name') ?? table.name),
          capacity: Number(form.get('capacity') ?? table.capacity),
          status: String(form.get('status') ?? table.status),
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body?.message ?? 'Tavolo non aggiornato.');
      await refreshLayout();
    }, 'Tavolo aggiornato.');
  }

  return (
    <div className="space-y-5">
      <ControlCenterNotification message={error} onDismiss={() => setError(null)} title="Operazione non completata" />
      <ControlCenterNotification message={message} onDismiss={() => setMessage(null)} title="Locale aggiornato" />

      <section className="glass-panel panel-padding">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="field min-w-[240px]">
            <span>Sede</span>
            <select disabled={pending} onChange={(event) => void changeLocation(event.target.value)} value={locationId}>
              {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <div className="text-right">
            <strong>{activeAreas.length} sale · {activeTables.length} tavoli</strong>
            <p className="muted">{totalCapacity} posti complessivi</p>
          </div>
        </div>
      </section>

      {location ? (
        <>
          <section className="glass-panel panel-padding">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="eyebrow">Sede</span>
                <h2 className="mt-1 text-xl font-semibold">{location.name}</h2>
                <p className="muted mt-1">{location.addressLine1} · {location.postalCode} {location.city}</p>
              </div>
              {location.canManageLocation ? (
                <details>
                  <summary className="button-secondary cursor-pointer list-none">Modifica sede</summary>
                  <form className="mt-3 w-full rounded-2xl border border-neutral-200 bg-white p-4 md:w-[620px]" onSubmit={saveLocation}>
                    <div className="form-grid">
                      <label className="field"><span>Nome</span><input defaultValue={location.name} name="name" required /></label>
                      <label className="field"><span>Indirizzo</span><input defaultValue={location.addressLine1} name="addressLine1" required /></label>
                      <label className="field"><span>CAP</span><input defaultValue={location.postalCode} name="postalCode" required /></label>
                      <label className="field"><span>Città</span><input defaultValue={location.city} name="city" required /></label>
                      <label className="field"><span>Provincia</span><input defaultValue={location.province ?? ''} name="province" /></label>
                      <label className="field"><span>Dettagli indirizzo</span><input defaultValue={location.addressLine2 ?? ''} name="addressLine2" /></label>
                    </div>
                    <details className="mt-4 rounded-xl border border-neutral-200 p-3">
                      <summary className="cursor-pointer text-sm font-medium">Dettagli avanzati</summary>
                      <div className="form-grid mt-3">
                        <label className="field"><span>Codice sede</span><input defaultValue={location.code} name="code" /></label>
                        <label className="field"><span>Fuso orario</span><input defaultValue={location.timezone} name="timezone" /></label>
                      </div>
                    </details>
                    <div className="mt-4 flex justify-end"><button className="button-primary" disabled={pending} type="submit">Salva</button></div>
                  </form>
                </details>
              ) : null}
            </div>
          </section>

          <section className="glass-panel panel-padding">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><strong className="text-lg">Sale</strong><p className="muted">Organizza gli spazi del locale.</p></div>
              {location.canManageTables ? <button className="button-secondary" onClick={() => setShowAreaComposer((value) => !value)} type="button">+ Sala</button> : null}
            </div>
            {showAreaComposer ? (
              <form className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-200 bg-white p-4" onSubmit={createArea}>
                <label className="field min-w-[260px]"><span>Nome sala</span><input autoFocus name="name" placeholder="Sala principale" required /></label>
                <button className="button-primary" disabled={pending} type="submit">Salva sala</button>
              </form>
            ) : null}
            <div className="data-list mt-4">
              {areas.map((area) => (
                <form className="data-row" key={area.id} onSubmit={(event) => void saveArea(event, area)}>
                  <div><strong>{area.name}</strong><small>{tables.filter((table) => table.areaId === area.id && table.status === 'ACTIVE').length} tavoli</small></div>
                  {location.canManageTables ? <input aria-label={`Nome ${area.name}`} defaultValue={area.name} name="name" /> : <span />}
                  <select aria-label={`Stato ${area.name}`} defaultValue={area.status} disabled={!location.canManageTables} name="status"><option value="ACTIVE">Attiva</option><option value="INACTIVE">Nascosta</option></select>
                  {location.canManageTables ? <button className="button-secondary" disabled={pending} type="submit">Salva</button> : null}
                </form>
              ))}
            </div>
          </section>

          <section className="glass-panel panel-padding">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><strong className="text-lg">Tavoli</strong><p className="muted">Aggiungi e sposta i tavoli senza gestire codici tecnici.</p></div>
              {location.canManageTables && activeAreas.length ? <button className="button-primary" onClick={() => setShowTableComposer((value) => !value)} type="button">+ Tavolo</button> : null}
            </div>

            {!activeAreas.length ? (
              <div className="mt-4 rounded-2xl border border-dashed p-5"><strong>Crea prima una sala.</strong><p className="muted mt-1">Serve solo un nome, ad esempio “Sala principale” o “Terrazza”.</p></div>
            ) : null}

            {showTableComposer && activeAreas.length ? (
              <form className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4" onSubmit={createTable}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="field"><span>Numero o nome</span><input autoFocus name="name" placeholder="12" required /></label>
                  <label className="field"><span>Sala</span><select name="areaId" required>{activeAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
                </div>
                <details className="mt-4 rounded-xl border border-neutral-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium">Altre impostazioni</summary>
                  <label className="field mt-3 max-w-[220px]"><span>Posti</span><input defaultValue="4" max="100" min="1" name="capacity" type="number" /></label>
                </details>
                <div className="mt-4 flex justify-end gap-2"><button className="button-secondary" onClick={() => setShowTableComposer(false)} type="button">Annulla</button><button className="button-primary" disabled={pending} type="submit">Salva tavolo</button></div>
              </form>
            ) : null}

            <div className="data-list mt-4">
              {tables.map((table) => (
                <form className="data-row" key={table.id} onSubmit={(event) => void saveTable(event, table)}>
                  <div><strong>{table.name}</strong><small>{table.areaName} · {table.capacity} posti</small></div>
                  <input aria-label={`Nome ${table.name}`} defaultValue={table.name} disabled={!location.canManageTables} name="name" />
                  <select aria-label={`Sala ${table.name}`} defaultValue={table.areaId} disabled={!location.canManageTables} name="areaId">{activeAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
                  <input aria-label={`Posti ${table.name}`} defaultValue={table.capacity} disabled={!location.canManageTables} max="100" min="1" name="capacity" type="number" />
                  <select aria-label={`Stato ${table.name}`} defaultValue={table.status} disabled={!location.canManageTables} name="status"><option value="ACTIVE">Attivo</option><option value="INACTIVE">Non attivo</option></select>
                  {location.canManageTables ? <button className="button-secondary" disabled={pending} type="submit">Salva</button> : null}
                </form>
              ))}
            </div>

            {!tables.length && activeAreas.length ? (
              <div className="mt-4 rounded-2xl border border-dashed p-5"><strong>Non hai ancora tavoli.</strong><p className="muted mt-1">Aggiungi il primo tavolo per usarlo dal POS.</p></div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
