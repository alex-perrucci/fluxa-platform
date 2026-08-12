'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import { StatusBadge } from '@/components/control-center/status-badge';

export type CatalogStatus = 'ACTIVE' | 'INACTIVE';

export interface CatalogPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CatalogLocation {
  id: string;
  code: string;
  name: string;
  status: CatalogStatus;
}

export interface CatalogCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  colorHex: string | null;
  sortOrder: number;
  status: CatalogStatus;
}

export interface VatRate {
  id: string;
  code: string;
  name: string;
  rateBasisPoints: number;
  natureCode: string | null;
  fiscalDescription: string | null;
  isDefault: boolean;
  status: CatalogStatus;
}

export interface CatalogProduct {
  id: string;
  categoryId: string;
  categoryName: string;
  vatRateId: string;
  vatCode: string;
  vatRateBasisPoints: number;
  code: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  unit: 'EACH' | 'WEIGHT' | 'VOLUME';
  quantityScale: number;
  trackAvailability: boolean;
  status: CatalogStatus;
}

export interface PriceList {
  id: string;
  code: string;
  name: string;
  currency: string;
  priority: number;
  status: CatalogStatus;
}

export interface ProductPrice {
  id: string;
  productId: string;
  variantId: string | null;
  amountCents: number;
  status: CatalogStatus;
}

export interface PriceListDetail extends PriceList {
  assignments: Array<{
    id: string;
    locationId: string;
    priority: number;
    active: boolean;
  }>;
  prices: ProductPrice[];
}

interface Props {
  canManage: boolean;
  initialCategories: CatalogCategory[];
  initialVatRates: VatRate[];
  initialProducts: CatalogProduct[];
  initialPriceLists: PriceList[];
  initialPriceListDetail: PriceListDetail | null;
  initialLocations: CatalogLocation[];
  initialLocationId: string | null;
}

type Tab = 'products' | 'categories' | 'vat' | 'prices';

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

function euro(cents: number | undefined) {
  if (cents === undefined) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function centsFromInput(value: FormDataEntryValue | null) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Prezzo non valido.');
  return Math.round(amount * 100);
}

export function CatalogConsole({
  canManage,
  initialCategories,
  initialVatRates,
  initialProducts,
  initialPriceLists,
  initialPriceListDetail,
  initialLocations,
  initialLocationId,
}: Props) {
  const [tab, setTab] = useState<Tab>('products');
  const [categories, setCategories] = useState(initialCategories);
  const [vatRates, setVatRates] = useState(initialVatRates);
  const [products, setProducts] = useState(initialProducts);
  const [priceLists, setPriceLists] = useState(initialPriceLists);
  const [priceList, setPriceList] = useState(initialPriceListDetail);
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const prices = useMemo(
    () => new Map((priceList?.prices ?? []).filter((price) => !price.variantId).map((price) => [price.productId, price])),
    [priceList],
  );

  async function loadPriceList(priceListId: string) {
    if (!priceListId) {
      setPriceList(null);
      return;
    }
    setPriceList(
      await requestJson<PriceListDetail>(
        `/api/control-center/merchant/configuration/price-lists/${priceListId}`,
      ),
    );
  }

  async function refresh(preferredPriceListId = priceList?.id ?? '') {
    const [nextCategories, nextVatRates, nextProducts, nextPriceLists] = await Promise.all([
      requestJson<CatalogPage<CatalogCategory>>('/api/control-center/merchant/configuration/categories?page=1&pageSize=100'),
      requestJson<CatalogPage<VatRate>>('/api/control-center/merchant/configuration/vat-rates?page=1&pageSize=100'),
      requestJson<CatalogPage<CatalogProduct>>('/api/control-center/merchant/configuration/products?page=1&pageSize=100'),
      requestJson<CatalogPage<PriceList>>('/api/control-center/merchant/configuration/price-lists?page=1&pageSize=100'),
    ]);
    setCategories(nextCategories.items);
    setVatRates(nextVatRates.items);
    setProducts(nextProducts.items);
    setPriceLists(nextPriceLists.items);
    const selected =
      nextPriceLists.items.find((item) => item.id === preferredPriceListId) ??
      nextPriceLists.items.find((item) => item.status === 'ACTIVE') ??
      nextPriceLists.items[0];
    await loadPriceList(selected?.id ?? '');
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

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!priceList) {
      setError('Crea o seleziona prima un listino.');
      return;
    }
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const unit = String(form.get('unit') ?? 'EACH');
      const product = await requestJson<CatalogProduct>('/api/control-center/merchant/configuration/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          categoryId: String(form.get('categoryId') ?? ''),
          vatRateId: String(form.get('vatRateId') ?? ''),
          code: String(form.get('code') ?? ''),
          sku: String(form.get('sku') ?? '') || undefined,
          barcode: String(form.get('barcode') ?? '') || undefined,
          name: String(form.get('name') ?? ''),
          unit,
          quantityScale: unit === 'EACH' ? 0 : 3,
          trackAvailability: form.get('trackAvailability') === 'on',
        }),
      });
      try {
        await requestJson(`/api/control-center/merchant/configuration/price-lists/${priceList.id}/prices`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ productId: product.id, amountCents: centsFromInput(form.get('price')) }),
        });
      } catch (priceError) {
        throw new Error(
          `Prodotto creato, ma il prezzo non è stato salvato: ${priceError instanceof Error ? priceError.message : 'errore inatteso'}`,
        );
      }
      event.currentTarget.reset();
      await refresh(priceList.id);
    }, 'Prodotto creato e pubblicato nel listino selezionato.');
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>, product: CatalogProduct) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          categoryId: String(form.get('categoryId') ?? ''),
          vatRateId: String(form.get('vatRateId') ?? ''),
          code: String(form.get('code') ?? ''),
          sku: String(form.get('sku') ?? ''),
          name: String(form.get('name') ?? ''),
          status: String(form.get('status') ?? 'ACTIVE'),
        }),
      });
      if (priceList) {
        await requestJson(`/api/control-center/merchant/configuration/price-lists/${priceList.id}/prices`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ productId: product.id, amountCents: centsFromInput(form.get('price')) }),
        });
      }
      await refresh(priceList?.id);
    }, 'Prodotto aggiornato.');
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson('/api/control-center/merchant/configuration/categories', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? ''), name: String(form.get('name') ?? ''),
          colorHex: String(form.get('colorHex') ?? '') || undefined,
          sortOrder: Number(form.get('sortOrder') ?? 0),
        }),
      });
      event.currentTarget.reset();
      await refresh();
    }, 'Categoria creata.');
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>, category: CatalogCategory) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/categories/${category.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? ''), name: String(form.get('name') ?? ''),
          colorHex: String(form.get('colorHex') ?? ''), sortOrder: Number(form.get('sortOrder') ?? 0),
          status: String(form.get('status') ?? 'ACTIVE'),
        }),
      });
      await refresh();
    }, 'Categoria aggiornata.');
  }

  async function createVat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson('/api/control-center/merchant/configuration/vat-rates', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? ''), name: String(form.get('name') ?? ''),
          rateBasisPoints: Math.round(Number(String(form.get('rate') ?? '0').replace(',', '.')) * 100),
          natureCode: String(form.get('natureCode') ?? '') || undefined,
          isDefault: form.get('isDefault') === 'on',
        }),
      });
      event.currentTarget.reset();
      await refresh();
    }, 'Aliquota IVA creata.');
  }

  async function saveVat(event: FormEvent<HTMLFormElement>, vat: VatRate) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/vat-rates/${vat.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? ''), name: String(form.get('name') ?? ''),
          rateBasisPoints: Math.round(Number(String(form.get('rate') ?? '0').replace(',', '.')) * 100),
          natureCode: String(form.get('natureCode') ?? ''),
          isDefault: form.get('isDefault') === 'on',
          status: String(form.get('status') ?? 'ACTIVE'),
        }),
      });
      await refresh();
    }, 'Aliquota IVA aggiornata.');
  }

  async function createPriceList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const created = await requestJson<PriceList>('/api/control-center/merchant/configuration/price-lists', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? ''), name: String(form.get('name') ?? ''),
          currency: 'EUR', priority: Number(form.get('priority') ?? 0),
        }),
      });
      if (locationId) {
        await requestJson(`/api/control-center/merchant/configuration/price-lists/${created.id}/locations`, {
          method: 'PUT', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locationId, priority: created.priority, active: true }),
        });
      }
      event.currentTarget.reset();
      await refresh(created.id);
    }, 'Listino creato e assegnato alla sede selezionata.');
  }

  async function savePriceList(event: FormEvent<HTMLFormElement>, item: PriceList) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/price-lists/${item.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? ''), name: String(form.get('name') ?? ''),
          priority: Number(form.get('priority') ?? 0), status: String(form.get('status') ?? 'ACTIVE'),
        }),
      });
      await refresh(item.id);
    }, 'Listino aggiornato.');
  }

  async function assignCurrentPriceList() {
    if (!priceList || !locationId) return;
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/price-lists/${priceList.id}/locations`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locationId, priority: priceList.priority, active: true }),
      });
      await loadPriceList(priceList.id);
    }, 'Listino assegnato alla sede.');
  }

  const activeCategories = categories.filter((item) => item.status === 'ACTIVE');
  const activeVatRates = vatRates.filter((item) => item.status === 'ACTIVE');

  return (
    <div>
      <ControlCenterNotification message={error} onDismiss={() => setError(null)} title="Operazione non completata" />
      <ControlCenterNotification message={message} onDismiss={() => setMessage(null)} title="Catalogo aggiornato" />

      <div className="filter-bar">
        {(['products', 'categories', 'vat', 'prices'] as const).map((value) => (
          <button className={tab === value ? 'button-primary' : 'button-secondary'} key={value} onClick={() => setTab(value)} type="button">
            {{ products: 'Prodotti', categories: 'Categorie', vat: 'Aliquote IVA', prices: 'Listini' }[value]}
          </button>
        ))}
        <span className="muted">{products.length} prodotti · {categories.length} categorie</span>
      </div>

      {tab === 'products' ? (
        <section className="glass-panel panel-padding mt-5">
          <div className="wizard-actions">
            <div><strong>Prodotti</strong><p className="muted">Il prezzo mostrato appartiene al listino selezionato.</p></div>
            <select disabled={pending} onChange={(event) => void loadPriceList(event.target.value)} value={priceList?.id ?? ''}>
              <option value="">Nessun listino</option>
              {priceLists.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.code}</option>)}
            </select>
          </div>
          {canManage ? (
            <form className="form-grid mt-5" onSubmit={createProduct}>
              <label className="field"><span>Nome</span><input name="name" required /></label>
              <label className="field"><span>Codice</span><input name="code" required /></label>
              <label className="field"><span>SKU</span><input name="sku" /></label>
              <label className="field"><span>Barcode</span><input name="barcode" /></label>
              <label className="field"><span>Categoria</span><select name="categoryId" required>{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="field"><span>IVA</span><select name="vatRateId" required>{activeVatRates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="field"><span>Unità</span><select name="unit"><option value="EACH">Pezzo</option><option value="WEIGHT">Peso</option><option value="VOLUME">Volume</option></select></label>
              <label className="field"><span>Prezzo €</span><input min="0" name="price" required step="0.01" type="number" /></label>
              <label className="field"><span>Disponibilità</span><span><input name="trackAvailability" type="checkbox" /> Traccia disponibilità</span></label>
              <div className="wizard-actions span-2"><span /><button className="button-primary" disabled={pending || !priceList || !activeCategories.length || !activeVatRates.length} type="submit">Aggiungi prodotto</button></div>
            </form>
          ) : null}
          <div className="data-list mt-5">
            {products.map((product) => (
              <form className="data-row" key={`${product.id}:${priceList?.id ?? 'none'}`} onSubmit={(event) => void saveProduct(event, product)}>
                <div><input defaultValue={product.name} disabled={!canManage} name="name" required /><small>{product.categoryName} · IVA {product.vatRateBasisPoints / 100}%</small></div>
                <div><input defaultValue={product.code} disabled={!canManage} name="code" required /><input defaultValue={product.sku ?? ''} disabled={!canManage} name="sku" placeholder="SKU" /></div>
                <div><select defaultValue={product.categoryId} disabled={!canManage} name="categoryId">{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select defaultValue={product.vatRateId} disabled={!canManage} name="vatRateId">{vatRates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                <div><input defaultValue={((prices.get(product.id)?.amountCents ?? 0) / 100).toFixed(2)} disabled={!canManage || !priceList} min="0" name="price" step="0.01" type="number" /><small>{euro(prices.get(product.id)?.amountCents)}</small></div>
                <div><select defaultValue={product.status} disabled={!canManage} name="status"><option value="ACTIVE">Attivo</option><option value="INACTIVE">Inattivo</option></select>{canManage ? <button className="button-secondary" disabled={pending} type="submit">Salva</button> : <StatusBadge status={product.status} />}</div>
              </form>
            ))}
          </div>
        </section>
      ) : null}

      {tab === 'categories' ? (
        <section className="glass-panel panel-padding mt-5">
          <strong>Categorie</strong>
          {canManage ? <form className="form-grid mt-5" onSubmit={createCategory}><label className="field"><span>Codice</span><input name="code" required /></label><label className="field"><span>Nome</span><input name="name" required /></label><label className="field"><span>Colore</span><input name="colorHex" placeholder="#2563EB" /></label><label className="field"><span>Ordine</span><input defaultValue="0" min="0" name="sortOrder" type="number" /></label><div className="wizard-actions span-2"><span /><button className="button-primary" disabled={pending} type="submit">Aggiungi categoria</button></div></form> : null}
          <div className="data-list mt-5">{categories.map((item) => <form className="data-row" key={item.id} onSubmit={(event) => void saveCategory(event, item)}><div><input defaultValue={item.name} disabled={!canManage} name="name" required /><small>{item.code}</small></div><input defaultValue={item.code} disabled={!canManage} name="code" required /><input defaultValue={item.colorHex ?? ''} disabled={!canManage} name="colorHex" /><input defaultValue={item.sortOrder} disabled={!canManage} min="0" name="sortOrder" type="number" /><select defaultValue={item.status} disabled={!canManage} name="status"><option value="ACTIVE">Attiva</option><option value="INACTIVE">Inattiva</option></select>{canManage ? <button className="button-secondary" disabled={pending} type="submit">Salva</button> : <StatusBadge status={item.status} />}</form>)}</div>
        </section>
      ) : null}

      {tab === 'vat' ? (
        <section className="glass-panel panel-padding mt-5">
          <strong>Aliquote IVA</strong>
          {canManage ? <form className="form-grid mt-5" onSubmit={createVat}><label className="field"><span>Codice</span><input name="code" required /></label><label className="field"><span>Nome</span><input name="name" required /></label><label className="field"><span>Aliquota %</span><input max="100" min="0" name="rate" required step="0.01" type="number" /></label><label className="field"><span>Natura (se 0%)</span><input name="natureCode" placeholder="N2.2" /></label><label className="field"><span>Predefinita</span><input name="isDefault" type="checkbox" /></label><div className="wizard-actions span-2"><span /><button className="button-primary" disabled={pending} type="submit">Aggiungi aliquota</button></div></form> : null}
          <div className="data-list mt-5">{vatRates.map((item) => <form className="data-row" key={item.id} onSubmit={(event) => void saveVat(event, item)}><div><input defaultValue={item.name} disabled={!canManage} name="name" required /><small>{item.isDefault ? 'Predefinita' : item.code}</small></div><input defaultValue={item.code} disabled={!canManage} name="code" required /><input defaultValue={item.rateBasisPoints / 100} disabled={!canManage} max="100" min="0" name="rate" step="0.01" type="number" /><input defaultValue={item.natureCode ?? ''} disabled={!canManage} name="natureCode" placeholder="Natura" /><label><input defaultChecked={item.isDefault} disabled={!canManage} name="isDefault" type="checkbox" /> Default</label><select defaultValue={item.status} disabled={!canManage} name="status"><option value="ACTIVE">Attiva</option><option value="INACTIVE">Inattiva</option></select>{canManage ? <button className="button-secondary" disabled={pending} type="submit">Salva</button> : <StatusBadge status={item.status} />}</form>)}</div>
        </section>
      ) : null}

      {tab === 'prices' ? (
        <section className="glass-panel panel-padding mt-5">
          <div className="wizard-actions"><strong>Listini</strong><div className="filter-bar"><select onChange={(event) => setLocationId(event.target.value)} value={locationId}><option value="">Nessuna sede</option>{initialLocations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="button-secondary" disabled={!canManage || !priceList || !locationId || pending} onClick={() => void assignCurrentPriceList()} type="button">Assegna listino selezionato</button></div></div>
          {canManage ? <form className="form-grid mt-5" onSubmit={createPriceList}><label className="field"><span>Codice</span><input name="code" required /></label><label className="field"><span>Nome</span><input name="name" required /></label><label className="field"><span>Priorità</span><input defaultValue="0" min="0" name="priority" type="number" /></label><div className="wizard-actions span-2"><span /><button className="button-primary" disabled={pending} type="submit">Crea listino</button></div></form> : null}
          <div className="data-list mt-5">{priceLists.map((item) => <form className="data-row" key={item.id} onSubmit={(event) => void savePriceList(event, item)}><div><input defaultValue={item.name} disabled={!canManage} name="name" required /><small>{item.currency}</small></div><input defaultValue={item.code} disabled={!canManage} name="code" required /><input defaultValue={item.priority} disabled={!canManage} min="0" name="priority" type="number" /><select defaultValue={item.status} disabled={!canManage} name="status"><option value="ACTIVE">Attivo</option><option value="INACTIVE">Inattivo</option></select>{canManage ? <button className="button-secondary" disabled={pending} type="submit">Salva</button> : <StatusBadge status={item.status} />}</form>)}</div>
        </section>
      ) : null}
    </div>
  );
}
