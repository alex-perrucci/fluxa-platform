'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import { StatusBadge } from '@/components/control-center/status-badge';
import type { CatalogCategory, CatalogLocation, CatalogPage } from './catalog-console';

export interface KitchenStation {
  id: string;
  locationId: string;
  code: string;
  name: string;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface CategoryRoute {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  categoryStatus: 'ACTIVE' | 'INACTIVE';
  stationId: string;
  stationCode: string;
  stationName: string;
  stationStatus: 'ACTIVE' | 'INACTIVE';
}

export interface LogicalPrinter {
  id: string;
  code: string;
  name: string;
  purpose: 'RECEIPT' | 'KITCHEN' | 'LABEL' | 'GENERIC';
  status: 'ACTIVE' | 'DISABLED';
  agentDeviceId: string | null;
}

export interface PrintRoute {
  id: string;
  documentType: 'KITCHEN_TICKET' | 'ORDER_RECEIPT' | 'PAYMENT_RECEIPT' | 'TEST_PAGE';
  kitchenStationId: string | null;
  kitchenStationName: string | null;
  printerId: string;
  printerCode: string;
  printerName: string;
  printerPurpose: LogicalPrinter['purpose'];
  copies: number;
  active: boolean;
}

interface Props {
  canManage: boolean;
  categories: CatalogCategory[];
  initialLocations: CatalogLocation[];
  initialLocationId: string | null;
  initialStations: KitchenStation[];
  initialCategoryRoutes: CategoryRoute[];
  initialPrinters: LogicalPrinter[];
  initialPrintRoutes: PrintRoute[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as { message?: string } | T | null;
  if (!response.ok) {
    throw new Error(
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : 'Operazione non riuscita.',
    );
  }
  return body as T;
}

export function KitchenConfigurationConsole({
  canManage,
  categories,
  initialLocations,
  initialLocationId,
  initialStations,
  initialCategoryRoutes,
  initialPrinters,
  initialPrintRoutes,
}: Props) {
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [stations, setStations] = useState(initialStations);
  const [categoryRoutes, setCategoryRoutes] = useState(initialCategoryRoutes);
  const [printers, setPrinters] = useState(initialPrinters);
  const [printRoutes, setPrintRoutes] = useState(initialPrintRoutes);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<PrintRoute['documentType']>('KITCHEN_TICKET');

  const routeByCategory = useMemo(
    () => new Map(categoryRoutes.map((route) => [route.categoryId, route])),
    [categoryRoutes],
  );
  const activeStations = stations.filter((station) => station.status === 'ACTIVE');
  const activeCategories = categories.filter((category) => category.status === 'ACTIVE');
  const activePrinters = printers.filter((printer) => printer.status === 'ACTIVE');

  async function reload(targetLocationId = locationId) {
    if (!targetLocationId) {
      setStations([]);
      setCategoryRoutes([]);
      setPrinters([]);
      setPrintRoutes([]);
      return;
    }
    const encoded = encodeURIComponent(targetLocationId);
    const [nextStations, nextRoutes, nextPrinters, nextPrintRoutes] = await Promise.all([
      requestJson<KitchenStation[]>(`/api/control-center/merchant/configuration/kitchen-stations?locationId=${encoded}`),
      requestJson<CategoryRoute[]>(`/api/control-center/merchant/configuration/kitchen-station-routes?locationId=${encoded}`),
      requestJson<CatalogPage<LogicalPrinter>>(`/api/control-center/merchant/configuration/printers?locationId=${encoded}&page=1&pageSize=100`),
      requestJson<PrintRoute[]>(`/api/control-center/merchant/configuration/print-routes?locationId=${encoded}`),
    ]);
    setStations(nextStations);
    setCategoryRoutes(nextRoutes);
    setPrinters(nextPrinters.items);
    setPrintRoutes(nextPrintRoutes);
  }

  async function run(action: () => Promise<void>, success: string) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Operazione non riuscita.');
    } finally {
      setPending(false);
    }
  }

  async function changeLocation(next: string) {
    setLocationId(next);
    await run(() => reload(next), 'Configurazione della sede caricata.');
  }

  async function createStation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson('/api/control-center/merchant/configuration/kitchen-stations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locationId,
          code: String(form.get('code') ?? ''),
          name: String(form.get('name') ?? ''),
          sortOrder: Number(form.get('sortOrder') ?? 0),
        }),
      });
      event.currentTarget.reset();
      await reload();
    }, 'Postazione cucina creata.');
  }

  async function saveStation(event: FormEvent<HTMLFormElement>, station: KitchenStation) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/kitchen-stations/${station.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? ''),
          name: String(form.get('name') ?? ''),
          sortOrder: Number(form.get('sortOrder') ?? 0),
          status: String(form.get('status') ?? 'ACTIVE'),
        }),
      });
      await reload();
    }, 'Postazione aggiornata.');
  }

  async function routeCategory(categoryId: string, stationId: string) {
    const current = routeByCategory.get(categoryId);
    await run(async () => {
      if (!stationId) {
        if (current) {
          await requestJson(
            `/api/control-center/merchant/configuration/kitchen-stations/${current.stationId}/categories/${categoryId}`,
            { method: 'DELETE' },
          );
        }
      } else {
        await requestJson(
          `/api/control-center/merchant/configuration/kitchen-stations/${stationId}/categories/${categoryId}`,
          { method: 'PUT' },
        );
      }
      await reload();
    }, stationId ? 'Categoria instradata alla postazione.' : 'Routing categoria rimosso.');
  }

  async function savePrintRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const stationId = String(form.get('kitchenStationId') ?? '');
    if (documentType === 'KITCHEN_TICKET' && !stationId) {
      setError('Per una comanda cucina scegli la postazione.');
      return;
    }
    await run(async () => {
      await requestJson('/api/control-center/merchant/configuration/print-routes', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locationId,
          documentType,
          printerId: String(form.get('printerId') ?? ''),
          copies: Number(form.get('copies') ?? 1),
          active: true,
          kitchenStationId: documentType === 'KITCHEN_TICKET' ? stationId : undefined,
        }),
      });
      event.currentTarget.reset();
      await reload();
    }, 'Rotta di stampa salvata.');
  }

  async function removePrintRoute(routeId: string) {
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/print-routes/${routeId}`, { method: 'DELETE' });
      await reload();
    }, 'Rotta di stampa rimossa.');
  }

  return (
    <div>
      <ControlCenterNotification message={error} onDismiss={() => setError(null)} title="Operazione non completata" />
      <ControlCenterNotification message={message} onDismiss={() => setMessage(null)} title="Configurazione aggiornata" />

      <div className="filter-bar">
        <select disabled={pending} onChange={(event) => void changeLocation(event.target.value)} value={locationId}>
          <option value="">Seleziona sede</option>
          {initialLocations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.code}</option>)}
        </select>
        <span className="muted">{stations.length} postazioni · {categoryRoutes.length} categorie instradate · {printers.length} stampanti logiche</span>
      </div>

      <section className="glass-panel panel-padding mt-5">
        <div className="wizard-actions"><strong>Postazioni cucina</strong><span className="muted">Configurazione server-side per la sede selezionata</span></div>
        {canManage && locationId ? (
          <form className="form-grid mt-5" onSubmit={createStation}>
            <label className="field"><span>Codice</span><input name="code" required /></label>
            <label className="field"><span>Nome</span><input name="name" required /></label>
            <label className="field"><span>Ordine</span><input defaultValue="0" min="0" name="sortOrder" type="number" /></label>
            <div className="wizard-actions span-2"><span /><button className="button-primary" disabled={pending} type="submit">Aggiungi postazione</button></div>
          </form>
        ) : null}
        <div className="data-list mt-5">
          {stations.map((station) => (
            <form className="data-row" key={station.id} onSubmit={(event) => void saveStation(event, station)}>
              <div><input defaultValue={station.name} disabled={!canManage} name="name" required /><small>{station.code}</small></div>
              <input defaultValue={station.code} disabled={!canManage} name="code" required />
              <input defaultValue={station.sortOrder} disabled={!canManage} min="0" name="sortOrder" type="number" />
              <select defaultValue={station.status} disabled={!canManage} name="status"><option value="ACTIVE">Attiva</option><option value="INACTIVE">Inattiva</option></select>
              {canManage ? <button className="button-secondary" disabled={pending} type="submit">Salva</button> : <StatusBadge status={station.status} />}
            </form>
          ))}
        </div>
      </section>

      <section className="glass-panel panel-padding mt-5">
        <div className="wizard-actions"><strong>Routing categorie → cucina</strong><span className="muted">Ogni categoria può puntare a una sola postazione per sede.</span></div>
        <div className="data-list mt-5">
          {activeCategories.map((category) => {
            const current = routeByCategory.get(category.id);
            return (
              <div className="data-row" key={category.id}>
                <div><strong>{category.name}</strong><small>{category.code}</small></div>
                <select disabled={!canManage || pending} onChange={(event) => void routeCategory(category.id, event.target.value)} value={current?.stationId ?? ''}>
                  <option value="">Non instradata</option>
                  {activeStations.map((station) => <option key={station.id} value={station.id}>{station.name} · {station.code}</option>)}
                </select>
                <StatusBadge status={current ? 'ROUTED' : 'UNROUTED'} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass-panel panel-padding mt-5">
        <div className="wizard-actions"><div><strong>Routing logico di stampa</strong><p className="muted">Qui scegli quale stampante logica riceve i documenti. Wi-Fi/Bluetooth si associa dal POS.</p></div><span className="muted">{printRoutes.length} rotte</span></div>
        {activePrinters.length === 0 ? (
          <div className="mt-5"><p className="muted">Nessuna stampante logica attiva. Creala dal POS in Impostazioni → Configura stampanti, poi torna qui per il routing.</p></div>
        ) : null}
        {canManage && locationId && activePrinters.length ? (
          <form className="form-grid mt-5" onSubmit={savePrintRoute}>
            <label className="field"><span>Documento</span><select name="documentType" onChange={(event) => setDocumentType(event.target.value as PrintRoute['documentType'])} value={documentType}><option value="KITCHEN_TICKET">Comanda cucina</option><option value="ORDER_RECEIPT">Riepilogo ordine</option><option value="PAYMENT_RECEIPT">Riepilogo pagamento</option><option value="TEST_PAGE">Pagina di test</option></select></label>
            <label className="field"><span>Postazione cucina</span><select disabled={documentType !== 'KITCHEN_TICKET'} name="kitchenStationId"><option value="">Seleziona postazione</option>{activeStations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
            <label className="field"><span>Stampante logica</span><select name="printerId" required>{activePrinters.map((printer) => <option key={printer.id} value={printer.id}>{printer.name} · {printer.purpose}</option>)}</select></label>
            <label className="field"><span>Copie</span><input defaultValue="1" max="5" min="1" name="copies" type="number" /></label>
            <div className="wizard-actions span-2"><span /><button className="button-primary" disabled={pending} type="submit">Salva rotta</button></div>
          </form>
        ) : null}
        <div className="data-list mt-5">
          {printRoutes.map((route) => (
            <div className="data-row" key={route.id}>
              <div><strong>{route.documentType}</strong><small>{route.kitchenStationName ?? 'Generale'}</small></div>
              <div><span>{route.printerName}</span><small>{route.printerCode} · {route.copies} copia/e</small></div>
              <StatusBadge status={route.active ? 'ACTIVE' : 'INACTIVE'} />
              {canManage ? <button className="button-secondary" disabled={pending} onClick={() => void removePrintRoute(route.id)} type="button">Rimuovi</button> : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
