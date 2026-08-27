'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
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
        : 'Non siamo riusciti a completare l’operazione. Riprova.',
    );
  }
  return body as T;
}

function internalCode(name: string) {
  const suffix = Date.now().toString(36).slice(-5).toUpperCase();
  const safe = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'POSTAZIONE';
  return `${safe.slice(0, 34)}_${suffix}`;
}

function documentLabel(type: PrintRoute['documentType']) {
  switch (type) {
    case 'KITCHEN_TICKET': return 'Comande cucina';
    case 'ORDER_RECEIPT': return 'Ricevute ordine';
    case 'PAYMENT_RECEIPT': return 'Ricevute pagamento';
    case 'TEST_PAGE': return 'Pagina di test';
  }
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
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
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
      setLoadWarning(null);
      return;
    }

    const encoded = encodeURIComponent(targetLocationId);
    const results = await Promise.allSettled([
      requestJson<KitchenStation[]>(`/api/control-center/merchant/configuration/kitchen-stations?locationId=${encoded}`),
      requestJson<CategoryRoute[]>(`/api/control-center/merchant/configuration/kitchen-station-routes?locationId=${encoded}`),
      requestJson<CatalogPage<LogicalPrinter>>(`/api/control-center/merchant/configuration/printers?locationId=${encoded}&page=1&pageSize=100`),
      requestJson<PrintRoute[]>(`/api/control-center/merchant/configuration/print-routes?locationId=${encoded}`),
    ] as const);

    const [stationsResult, routesResult, printersResult, printRoutesResult] = results;
    setStations(stationsResult.status === 'fulfilled' ? stationsResult.value : []);
    setCategoryRoutes(routesResult.status === 'fulfilled' ? routesResult.value : []);
    setPrinters(printersResult.status === 'fulfilled' ? printersResult.value.items : []);
    setPrintRoutes(printRoutesResult.status === 'fulfilled' ? printRoutesResult.value : []);

    const failures = results.filter((result) => result.status === 'rejected').length;
    setLoadWarning(
      failures === 0
        ? null
        : failures === results.length
          ? 'La configurazione operativa della sede non ha risposto. I dati non disponibili sono stati svuotati per evitare di mostrare configurazioni di un’altra sede.'
          : 'Alcune configurazioni della sede non hanno risposto. Le sezioni disponibili restano utilizzabili e i dati non caricati non vengono sostituiti con dati vecchi.',
    );
  }

  async function run(action: () => Promise<void>, success: string) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Non siamo riusciti a completare l’operazione. Riprova.');
    } finally {
      setPending(false);
    }
  }

  async function changeLocation(next: string) {
    setLocationId(next);
    await run(() => reload(next), 'Sede caricata.');
  }

  async function createStation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name') ?? '').trim();
    await run(async () => {
      await requestJson('/api/control-center/merchant/configuration/kitchen-stations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locationId,
          code: String(form.get('code') ?? '').trim() || internalCode(name),
          name,
          sortOrder: Number(form.get('sortOrder') ?? 0),
        }),
      });
      formElement.reset();
      await reload();
    }, 'Postazione creata.');
  }

  async function saveStation(event: FormEvent<HTMLFormElement>, station: KitchenStation) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/kitchen-stations/${station.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? station.code),
          name: String(form.get('name') ?? station.name),
          sortOrder: Number(form.get('sortOrder') ?? station.sortOrder),
          status: String(form.get('status') ?? station.status),
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
    }, stationId ? 'Destinazione aggiornata.' : 'Preparazione rimossa per la categoria.');
  }

  async function savePrintRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const stationId = String(form.get('kitchenStationId') ?? '');
    if (documentType === 'KITCHEN_TICKET' && !stationId) {
      setError('Per le comande cucina scegli dove devono arrivare.');
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
      formElement.reset();
      await reload();
    }, 'Stampante configurata.');
  }

  async function removePrintRoute(routeId: string) {
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/print-routes/${routeId}`, { method: 'DELETE' });
      await reload();
    }, 'Configurazione di stampa rimossa.');
  }

  return (
    <div>
      <ControlCenterNotification message={error} onDismiss={() => setError(null)} title="Operazione non completata" />
      <ControlCenterNotification message={message} onDismiss={() => setMessage(null)} title="Operatività aggiornata" />
      <ControlCenterNotification message={loadWarning} onDismiss={() => setLoadWarning(null)} title="Configurazione parziale" />

      <div className="filter-bar">
        <select disabled={pending} onChange={(event) => void changeLocation(event.target.value)} value={locationId}>
          <option value="">Seleziona sede</option>
          {initialLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
        <span className="muted">{activeStations.length} postazioni · {activePrinters.length} stampanti</span>
      </div>

      <section className="glass-panel panel-padding mt-5">
        <div className="wizard-actions">
          <div>
            <strong>Dove devono arrivare i prodotti?</strong>
            <p className="muted">Imposta la destinazione una volta per categoria. I prodotti della categoria la useranno automaticamente.</p>
          </div>
        </div>

        {!activeStations.length && locationId ? (
          <div className="mt-5 rounded-2xl border border-dashed p-5">
            <strong>Non hai ancora postazioni di preparazione.</strong>
            <p className="muted mt-1">Aggiungi “Cucina”, “Bar” o un altro punto di preparazione.</p>
          </div>
        ) : null}

        {canManage && locationId ? (
          <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={createStation}>
            <label className="field min-w-[240px]"><span>Nuova postazione</span><input name="name" placeholder="Cucina" required /></label>
            <button className="button-secondary" disabled={pending} type="submit">Aggiungi</button>
            <details className="text-sm">
              <summary className="cursor-pointer text-neutral-500">Opzioni avanzate</summary>
              <div className="mt-2 flex flex-wrap gap-2"><input name="code" placeholder="Codice automatico" /><input defaultValue="0" min="0" name="sortOrder" placeholder="Ordine" type="number" /></div>
            </details>
          </form>
        ) : null}

        <div className="data-list mt-5">
          {activeCategories.map((category) => {
            const current = routeByCategory.get(category.id);
            return (
              <div className="data-row" key={category.id}>
                <div><strong>{category.name}</strong><small>{current ? `Va a ${current.stationName}` : 'Nessuna preparazione'}</small></div>
                <label className="field min-w-0"><span>Dove arriva?</span><select disabled={!canManage || pending} onChange={(event) => void routeCategory(category.id, event.target.value)} value={current?.stationId ?? ''}><option value="">Nessuna preparazione</option>{activeStations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass-panel panel-padding mt-5">
        <div className="wizard-actions">
          <div>
            <strong>Stampanti</strong>
            <p className="muted">Scegli cosa deve uscire su ciascuna stampante. La connessione fisica della stampante resta gestita dal POS.</p>
          </div>
        </div>

        {!activePrinters.length ? (
          <div className="mt-5 rounded-2xl border border-dashed p-5"><strong>Nessuna stampante disponibile.</strong><p className="muted mt-1">Configura prima la stampante dal POS, poi torna qui per scegliere cosa deve stampare.</p></div>
        ) : null}

        {canManage && locationId && activePrinters.length ? (
          <form className="form-grid mt-5" onSubmit={savePrintRoute}>
            <label className="field"><span>Cosa deve stampare?</span><select name="documentType" onChange={(event) => setDocumentType(event.target.value as PrintRoute['documentType'])} value={documentType}><option value="KITCHEN_TICKET">Comande cucina</option><option value="ORDER_RECEIPT">Ricevute ordine</option><option value="PAYMENT_RECEIPT">Ricevute pagamento</option><option value="TEST_PAGE">Pagina di test</option></select></label>
            <label className="field"><span>Dove?</span><select disabled={documentType !== 'KITCHEN_TICKET'} name="kitchenStationId"><option value="">Scegli postazione</option>{activeStations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
            <label className="field"><span>Stampante</span><select name="printerId" required>{activePrinters.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</select></label>
            <label className="field"><span>Copie</span><input defaultValue="1" max="5" min="1" name="copies" type="number" /></label>
            <div className="wizard-actions span-2"><span /><button className="button-primary" disabled={pending} type="submit">Salva stampa</button></div>
          </form>
        ) : null}

        <div className="data-list mt-5">
          {printRoutes.map((route) => (
            <div className="data-row" key={route.id}>
              <div><strong>{documentLabel(route.documentType)}</strong><small>{route.kitchenStationName ?? 'Generale'}</small></div>
              <div><span>{route.printerName}</span><small>{route.copies} copia/e</small></div>
              <span>{route.active ? 'Attiva' : 'Non attiva'}</span>
              {canManage ? <button className="button-secondary" disabled={pending} onClick={() => void removePrintRoute(route.id)} type="button">Rimuovi</button> : null}
            </div>
          ))}
        </div>
      </section>

      {stations.length ? (
        <details className="glass-panel panel-padding mt-5">
          <summary className="cursor-pointer font-semibold">Impostazioni avanzate postazioni</summary>
          <p className="muted mt-2">Codici e ordinamento servono solo in casi particolari o per assistenza.</p>
          <div className="data-list mt-5">
            {stations.map((station) => (
              <form className="data-row" key={station.id} onSubmit={(event) => void saveStation(event, station)}>
                <input defaultValue={station.name} disabled={!canManage} name="name" aria-label="Nome postazione" required />
                <input defaultValue={station.code} disabled={!canManage} name="code" aria-label="Codice postazione" required />
                <input defaultValue={station.sortOrder} disabled={!canManage} min="0" name="sortOrder" aria-label="Ordine postazione" type="number" />
                <select defaultValue={station.status} disabled={!canManage} name="status"><option value="ACTIVE">Attiva</option><option value="INACTIVE">Inattiva</option></select>
                {canManage ? <button className="button-secondary" disabled={pending} type="submit">Salva</button> : null}
              </form>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
