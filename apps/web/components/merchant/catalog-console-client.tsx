'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';

export type CatalogStatus = 'ACTIVE' | 'INACTIVE';
export interface CatalogPage<T> { items: T[]; total: number; page: number; pageSize: number; }
export interface CatalogLocation { id: string; code: string; name: string; status: CatalogStatus; }
export interface CatalogCategory { id: string; code: string; name: string; description: string | null; colorHex: string | null; sortOrder: number; status: CatalogStatus; }
export interface VatRate { id: string; code: string; name: string; rateBasisPoints: number; natureCode: string | null; fiscalDescription: string | null; isDefault: boolean; status: CatalogStatus; }
export interface CatalogProduct { id: string; categoryId: string; categoryName: string; vatRateId: string; vatCode: string; vatRateBasisPoints: number; code: string; sku: string | null; barcode: string | null; name: string; unit: 'EACH' | 'WEIGHT' | 'VOLUME'; quantityScale: number; trackAvailability: boolean; status: CatalogStatus; }
export interface PriceList { id: string; code: string; name: string; currency: string; priority: number; status: CatalogStatus; }
export interface ProductPrice { id: string; productId: string; variantId: string | null; amountCents: number; status: CatalogStatus; }
export interface PriceListDetail extends PriceList { assignments: Array<{ id: string; locationId: string; priority: number; active: boolean }>; prices: ProductPrice[]; }

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

function euro(cents: number | undefined) {
  if (cents === undefined) return '—';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function centsFromInput(value: FormDataEntryValue | null) {
  const amount = Number(String(value ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Inserisci un prezzo valido.');
  return Math.round(amount * 100);
}

function internalCode(name: string, prefix: string, maxLength = 50) {
  const suffix = Date.now().toString(36).slice(-6).toUpperCase();
  const safe = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || prefix;
  return `${safe.slice(0, Math.max(1, maxLength - suffix.length - 1))}_${suffix}`;
}

function vatLabel(vat: VatRate) {
  return `${vat.name} · ${(vat.rateBasisPoints / 100).toLocaleString('it-IT')}%`;
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
  const [categories, setCategories] = useState(initialCategories);
  const [vatRates, setVatRates] = useState(initialVatRates);
  const [products, setProducts] = useState(initialProducts);
  const [priceLists, setPriceLists] = useState(initialPriceLists);
  const [priceList, setPriceList] = useState(initialPriceListDetail);
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showProductComposer, setShowProductComposer] = useState(false);
  const [showCategoryComposer, setShowCategoryComposer] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const prices = useMemo(
    () => new Map((priceList?.prices ?? []).filter((price) => !price.variantId).map((price) => [price.productId, price])),
    [priceList],
  );
  const activeCategories = categories.filter((item) => item.status === 'ACTIVE');
  const activeVatRates = vatRates.filter((item) => item.status === 'ACTIVE');
  const defaultVat = activeVatRates.find((item) => item.isDefault) ?? activeVatRates[0] ?? null;
  const visibleProducts = products.filter((product) => {
    const query = search.trim().toLocaleLowerCase('it-IT');
    return !query || product.name.toLocaleLowerCase('it-IT').includes(query) || product.categoryName.toLocaleLowerCase('it-IT').includes(query);
  });
  const productsByCategory = useMemo(() => {
    const grouped = new Map<string, CatalogProduct[]>();
    for (const category of categories) grouped.set(category.id, []);
    for (const product of visibleProducts) {
      const list = grouped.get(product.categoryId) ?? [];
      list.push(product);
      grouped.set(product.categoryId, list);
    }
    return grouped;
  }, [categories, visibleProducts]);

  async function loadPriceList(priceListId: string) {
    if (!priceListId) {
      setPriceList(null);
      return;
    }
    setPriceList(await requestJson<PriceListDetail>(`/api/control-center/merchant/configuration/price-lists/${priceListId}`));
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
    const target = nextPriceLists.items.find((item) => item.id === preferredPriceListId)
      ?? nextPriceLists.items.find((item) => item.status === 'ACTIVE')
      ?? nextPriceLists.items[0];
    await loadPriceList(target?.id ?? '');
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

  async function ensurePriceList(): Promise<PriceList> {
    if (priceList) return priceList;
    const existing = priceLists.find((item) => item.status === 'ACTIVE') ?? priceLists[0];
    if (existing) return existing;

    const created = await requestJson<PriceList>('/api/control-center/merchant/configuration/price-lists', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: internalCode('MENU', 'MENU', 40), name: 'Menu principale', currency: 'EUR', priority: 0 }),
    });
    if (locationId) {
      await requestJson(`/api/control-center/merchant/configuration/price-lists/${created.id}/locations`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locationId, priority: 0, active: true }),
      });
    }
    return created;
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name') ?? '').trim();
    const categoryId = String(form.get('categoryId') ?? '');
    const vatRateId = String(form.get('vatRateId') ?? '') || defaultVat?.id || '';
    if (!vatRateId) {
      setError('Prima di creare prodotti serve almeno un’aliquota IVA attiva. Apri “Impostazioni avanzate del menu”.');
      return;
    }

    await run(async () => {
      const targetPriceList = await ensurePriceList();
      const unit = String(form.get('unit') ?? 'EACH') as CatalogProduct['unit'];
      const product = await requestJson<CatalogProduct>('/api/control-center/merchant/configuration/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          vatRateId,
          code: String(form.get('code') ?? '').trim() || internalCode(name, 'PRODOTTO'),
          sku: String(form.get('sku') ?? '').trim() || undefined,
          barcode: String(form.get('barcode') ?? '').trim() || undefined,
          name,
          unit,
          quantityScale: unit === 'EACH' ? 0 : 3,
          trackAvailability: form.get('trackAvailability') === 'on',
        }),
      });
      await requestJson(`/api/control-center/merchant/configuration/price-lists/${targetPriceList.id}/prices`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: product.id, amountCents: centsFromInput(form.get('price')) }),
      });
      formElement.reset();
      setShowProductComposer(false);
      await refresh(targetPriceList.id);
    }, 'Prodotto creato. È già pronto per il POS.');
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('name') ?? '').trim();
    await run(async () => {
      await requestJson('/api/control-center/merchant/configuration/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? '').trim() || internalCode(name, 'CATEGORIA', 40),
          name,
          colorHex: String(form.get('colorHex') ?? '').trim() || undefined,
          sortOrder: Number(form.get('sortOrder') ?? 0),
        }),
      });
      formElement.reset();
      setShowCategoryComposer(false);
      await refresh();
    }, 'Categoria creata.');
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>, product: CatalogProduct) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          categoryId: String(form.get('categoryId') ?? ''),
          vatRateId: String(form.get('vatRateId') ?? ''),
          code: String(form.get('code') ?? ''),
          sku: String(form.get('sku') ?? ''),
          barcode: String(form.get('barcode') ?? ''),
          status: String(form.get('status') ?? 'ACTIVE'),
        }),
      });
      await refresh();
    }, 'Prodotto aggiornato.');
  }

  async function quickSavePrice(event: FormEvent<HTMLFormElement>, productId: string) {
    event.preventDefault();
    if (!priceList) {
      setError('Non c’è ancora un listino attivo. Modifica il prodotto dopo aver creato il listino.');
      return;
    }
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/price-lists/${priceList.id}/prices`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, amountCents: centsFromInput(form.get('price')) }),
      });
      await loadPriceList(priceList.id);
    }, 'Prezzo aggiornato.');
  }

  async function toggleProduct(product: CatalogProduct) {
    const next = product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      await refresh();
    }, next === 'ACTIVE' ? 'Prodotto nuovamente disponibile.' : 'Prodotto disattivato dal menu.');
  }

  async function bulkUpdate(action: 'ACTIVE' | 'INACTIVE' | 'CATEGORY', categoryId?: string) {
    const ids = [...selected];
    if (!ids.length) return;
    await run(async () => {
      await Promise.all(ids.map((id) => requestJson(`/api/control-center/merchant/configuration/products/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(action === 'CATEGORY' ? { categoryId } : { status: action }),
      })));
      setSelected(new Set());
      await refresh();
    }, `${ids.length} prodotti aggiornati.`);
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>, category: CatalogCategory) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          code: String(form.get('code') ?? ''),
          colorHex: String(form.get('colorHex') ?? ''),
          sortOrder: Number(form.get('sortOrder') ?? 0),
          status: String(form.get('status') ?? 'ACTIVE'),
        }),
      });
      await refresh();
    }, 'Categoria aggiornata.');
  }

  async function createVat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await run(async () => {
      await requestJson('/api/control-center/merchant/configuration/vat-rates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? ''),
          name: String(form.get('name') ?? ''),
          rateBasisPoints: Math.round(Number(String(form.get('rate') ?? '0').replace(',', '.')) * 100),
          natureCode: String(form.get('natureCode') ?? '') || undefined,
          isDefault: form.get('isDefault') === 'on',
        }),
      });
      formElement.reset();
      await refresh();
    }, 'Aliquota IVA creata.');
  }

  async function saveVat(event: FormEvent<HTMLFormElement>, vat: VatRate) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await requestJson(`/api/control-center/merchant/configuration/vat-rates/${vat.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? ''),
          name: String(form.get('name') ?? ''),
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
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await run(async () => {
      const name = String(form.get('name') ?? '').trim();
      const created = await requestJson<PriceList>('/api/control-center/merchant/configuration/price-lists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: String(form.get('code') ?? '').trim() || internalCode(name, 'LISTINO', 40),
          name,
          currency: 'EUR',
          priority: Number(form.get('priority') ?? 0),
        }),
      });
      if (locationId) {
        await requestJson(`/api/control-center/merchant/configuration/price-lists/${created.id}/locations`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ locationId, priority: created.priority, active: true }),
        });
      }
      formElement.reset();
      await refresh(created.id);
    }, 'Listino creato.');
  }

  function toggleSelected(productId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <ControlCenterNotification message={error} onDismiss={() => setError(null)} title="Operazione non completata" />
      <ControlCenterNotification message={message} onDismiss={() => setMessage(null)} title="Menu aggiornato" />

      <section className="glass-panel panel-padding">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <strong className="text-lg">Il tuo menu</strong>
            <p className="muted">{products.length} prodotti · {categories.length} categorie</p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button className="button-primary" onClick={() => setShowProductComposer((value) => !value)} type="button">+ Nuovo prodotto</button>
              <button className="button-secondary" onClick={() => setShowCategoryComposer((value) => !value)} type="button">+ Nuova categoria</button>
            </div>
          ) : null}
        </div>

        {showProductComposer ? (
          <form className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5" onSubmit={createProduct}>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="field"><span>Nome</span><input autoFocus name="name" placeholder="Caffè" required /></label>
              <label className="field"><span>Prezzo</span><input inputMode="decimal" name="price" placeholder="1,30" required /></label>
              <label className="field"><span>Categoria</span><select defaultValue="" name="categoryId" required><option disabled value="">Scegli categoria</option>{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            </div>
            <details className="mt-4 rounded-xl border border-neutral-200 p-4">
              <summary className="cursor-pointer font-medium">Altre impostazioni</summary>
              <div className="form-grid mt-4">
                <label className="field"><span>IVA</span><select defaultValue="" name="vatRateId"><option value="">Usa IVA predefinita{defaultVat ? ` (${vatLabel(defaultVat)})` : ''}</option>{activeVatRates.map((item) => <option key={item.id} value={item.id}>{vatLabel(item)}</option>)}</select></label>
                <label className="field"><span>Codice interno</span><input name="code" placeholder="Automatico" /></label>
                <label className="field"><span>SKU</span><input name="sku" /></label>
                <label className="field"><span>Barcode</span><input name="barcode" /></label>
                <label className="field"><span>Unità</span><select name="unit"><option value="EACH">Pezzo</option><option value="WEIGHT">Peso</option><option value="VOLUME">Volume</option></select></label>
                <label className="field"><span>Disponibilità</span><span className="flex items-center gap-2"><input className="h-4 w-4" name="trackAvailability" type="checkbox" /> Traccia disponibilità</span></label>
              </div>
            </details>
            <div className="mt-4 flex justify-end gap-2">
              <button className="button-secondary" onClick={() => setShowProductComposer(false)} type="button">Annulla</button>
              <button className="button-primary" disabled={pending || !activeCategories.length} type="submit">Salva prodotto</button>
            </div>
            {!activeCategories.length ? <p className="mt-3 text-sm text-amber-700">Crea prima una categoria: serve solo il nome.</p> : null}
          </form>
        ) : null}

        {showCategoryComposer ? (
          <form className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5" onSubmit={createCategory}>
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <label className="field"><span>Nome categoria</span><input autoFocus name="name" placeholder="Caffetteria" required /></label>
              <button className="button-primary" disabled={pending} type="submit">Salva categoria</button>
            </div>
            <details className="mt-4 rounded-xl border border-neutral-200 p-4">
              <summary className="cursor-pointer font-medium">Altre impostazioni</summary>
              <div className="form-grid mt-4">
                <label className="field"><span>Codice interno</span><input name="code" placeholder="Automatico" /></label>
                <label className="field"><span>Colore</span><input name="colorHex" placeholder="#8B5CF6" /></label>
                <label className="field"><span>Ordine</span><input defaultValue="0" min="0" name="sortOrder" type="number" /></label>
              </div>
            </details>
          </form>
        ) : null}
      </section>

      <section className="glass-panel panel-padding">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="field min-w-[260px]"><span>Cerca</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Cerca prodotto o categoria…" value={search} /></label>
          <label className="field min-w-[220px]"><span>Prezzi mostrati</span><select disabled={pending} onChange={(event) => void loadPriceList(event.target.value)} value={priceList?.id ?? ''}><option value="">Menu principale</option>{priceLists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>

        {selected.size ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <strong>{selected.size} selezionati</strong>
            <button className="button-secondary" disabled={pending} onClick={() => void bulkUpdate('ACTIVE')} type="button">Attiva</button>
            <button className="button-secondary" disabled={pending} onClick={() => void bulkUpdate('INACTIVE')} type="button">Disattiva</button>
            <select className="rounded-lg border px-3 py-2 text-sm" defaultValue="" disabled={pending} onChange={(event) => { if (event.target.value) void bulkUpdate('CATEGORY', event.target.value); }}><option value="">Sposta in categoria…</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <button className="button-secondary" onClick={() => setSelected(new Set())} type="button">Deseleziona</button>
          </div>
        ) : null}

        <div className="mt-5 space-y-5">
          {categories.filter((category) => productsByCategory.get(category.id)?.length || (!search && category.status === 'ACTIVE')).map((category) => {
            const categoryProducts = productsByCategory.get(category.id) ?? [];
            return (
              <section className="rounded-2xl border border-neutral-200 bg-white" key={category.id}>
                <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
                  <div className="flex items-center gap-3">
                    {category.colorHex ? <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.colorHex }} /> : null}
                    <strong>{category.name}</strong>
                    <span className="muted">{categoryProducts.length} prodotti</span>
                  </div>
                  <span className="text-xs font-medium text-neutral-500">{category.status === 'ACTIVE' ? 'Attiva' : 'Nascosta'}</span>
                </div>
                {categoryProducts.length ? (
                  <div className="divide-y divide-neutral-100">
                    {categoryProducts.map((product) => {
                      const price = prices.get(product.id);
                      return (
                        <div className="p-4" key={product.id}>
                          <div className="grid items-center gap-3 md:grid-cols-[auto_minmax(180px,1fr)_170px_auto_auto]">
                            {canManage ? <input aria-label={`Seleziona ${product.name}`} checked={selected.has(product.id)} className="h-4 w-4" onChange={() => toggleSelected(product.id)} type="checkbox" /> : <span />}
                            <div><strong>{product.name}</strong><p className="muted">{product.vatCode} · {product.unit === 'EACH' ? 'pezzo' : product.unit === 'WEIGHT' ? 'peso' : 'volume'}</p></div>
                            {canManage ? (
                              <form className="flex items-end gap-2" onSubmit={(event) => void quickSavePrice(event, product.id)}>
                                <label className="field"><span>Prezzo</span><input defaultValue={price ? (price.amountCents / 100).toFixed(2).replace('.', ',') : ''} inputMode="decimal" name="price" placeholder="0,00" /></label>
                                <button className="button-secondary" disabled={pending || !priceList} type="submit">Salva</button>
                              </form>
                            ) : <strong>{euro(price?.amountCents)}</strong>}
                            <button className={product.status === 'ACTIVE' ? 'button-secondary' : 'button-primary'} disabled={!canManage || pending} onClick={() => void toggleProduct(product)} type="button">{product.status === 'ACTIVE' ? 'Disponibile' : 'Non disponibile'}</button>
                            <details className="relative">
                              <summary className="button-secondary cursor-pointer list-none">Modifica</summary>
                              <div className="mt-3 md:absolute md:right-0 md:z-20 md:w-[620px]">
                                <form className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl" onSubmit={(event) => void saveProduct(event, product)}>
                                  <div className="form-grid">
                                    <label className="field"><span>Nome</span><input defaultValue={product.name} disabled={!canManage} name="name" required /></label>
                                    <label className="field"><span>Categoria</span><select defaultValue={product.categoryId} disabled={!canManage} name="categoryId">{activeCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                                    <label className="field"><span>IVA</span><select defaultValue={product.vatRateId} disabled={!canManage} name="vatRateId">{activeVatRates.map((item) => <option key={item.id} value={item.id}>{vatLabel(item)}</option>)}</select></label>
                                    <label className="field"><span>Stato</span><select defaultValue={product.status} disabled={!canManage} name="status"><option value="ACTIVE">Disponibile</option><option value="INACTIVE">Non disponibile</option></select></label>
                                    <label className="field"><span>Codice interno</span><input defaultValue={product.code} disabled={!canManage} name="code" required /></label>
                                    <label className="field"><span>SKU</span><input defaultValue={product.sku ?? ''} disabled={!canManage} name="sku" /></label>
                                    <label className="field"><span>Barcode</span><input defaultValue={product.barcode ?? ''} disabled={!canManage} name="barcode" /></label>
                                  </div>
                                  {canManage ? <div className="mt-4 flex justify-end"><button className="button-primary" disabled={pending} type="submit">Salva modifiche</button></div> : null}
                                </form>
                              </div>
                            </details>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-5 text-sm text-neutral-600">Questa categoria è vuota. Aggiungi un prodotto quando ti serve.</div>
                )}
              </section>
            );
          })}
          {!visibleProducts.length && search ? <div className="rounded-2xl border border-dashed p-8 text-center"><strong>Nessun prodotto trovato</strong><p className="muted mt-1">Prova con un altro nome o categoria.</p></div> : null}
          {!products.length && !search ? <div className="rounded-2xl border border-dashed p-8 text-center"><strong>Non hai ancora creato prodotti.</strong><p className="muted mt-1">Aggiungi il primo prodotto per iniziare a vendere.</p>{canManage ? <button className="button-primary mt-4" onClick={() => setShowProductComposer(true)} type="button">Crea prodotto</button> : null}</div> : null}
        </div>
      </section>

      <details className="glass-panel panel-padding">
        <summary className="cursor-pointer text-base font-semibold">Impostazioni avanzate del menu</summary>
        <p className="muted mt-2">IVA, codici interni, listini e configurazioni usate meno spesso.</p>

        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4">
            <h3 className="font-semibold">Categorie</h3>
            <div className="mt-3 space-y-3">
              {categories.map((category) => (
                <form className="rounded-xl border p-3" key={category.id} onSubmit={(event) => void saveCategory(event, category)}>
                  <div className="grid gap-2">
                    <input defaultValue={category.name} disabled={!canManage} name="name" aria-label="Nome categoria" />
                    <input defaultValue={category.code} disabled={!canManage} name="code" aria-label="Codice categoria" />
                    <div className="grid grid-cols-3 gap-2"><input defaultValue={category.colorHex ?? ''} disabled={!canManage} name="colorHex" placeholder="#000000" /><input defaultValue={category.sortOrder} disabled={!canManage} min="0" name="sortOrder" type="number" /><select defaultValue={category.status} disabled={!canManage} name="status"><option value="ACTIVE">Attiva</option><option value="INACTIVE">Nascosta</option></select></div>
                    {canManage ? <button className="button-secondary" disabled={pending} type="submit">Salva</button> : null}
                  </div>
                </form>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4">
            <h3 className="font-semibold">IVA</h3>
            <p className="muted mt-1">Il percorso standard usa automaticamente l’aliquota predefinita.</p>
            {canManage ? <form className="mt-3 grid gap-2" onSubmit={createVat}><input name="name" placeholder="IVA 10%" required /><input name="code" placeholder="Codice" required /><input inputMode="decimal" name="rate" placeholder="10" required /><input name="natureCode" placeholder="Natura (se serve)" /><label className="flex items-center gap-2 text-sm"><input name="isDefault" type="checkbox" /> Usa come predefinita</label><button className="button-secondary" disabled={pending} type="submit">Aggiungi aliquota</button></form> : null}
            <div className="mt-4 space-y-3">
              {vatRates.map((vat) => (
                <form className="rounded-xl border p-3" key={vat.id} onSubmit={(event) => void saveVat(event, vat)}>
                  <div className="grid gap-2"><input defaultValue={vat.name} disabled={!canManage} name="name" /><input defaultValue={vat.code} disabled={!canManage} name="code" /><div className="grid grid-cols-2 gap-2"><input defaultValue={(vat.rateBasisPoints / 100).toString().replace('.', ',')} disabled={!canManage} inputMode="decimal" name="rate" /><input defaultValue={vat.natureCode ?? ''} disabled={!canManage} name="natureCode" /></div><div className="flex items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input defaultChecked={vat.isDefault} disabled={!canManage} name="isDefault" type="checkbox" /> Predefinita</label><select defaultValue={vat.status} disabled={!canManage} name="status"><option value="ACTIVE">Attiva</option><option value="INACTIVE">Inattiva</option></select></div>{canManage ? <button className="button-secondary" disabled={pending} type="submit">Salva</button> : null}</div>
                </form>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4">
            <h3 className="font-semibold">Listini</h3>
            <label className="field mt-3"><span>Sede</span><select onChange={(event) => setLocationId(event.target.value)} value={locationId}><option value="">Nessuna sede specifica</option>{initialLocations.filter((item) => item.status === 'ACTIVE').map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
            {canManage ? <form className="mt-3 grid gap-2" onSubmit={createPriceList}><input name="name" placeholder="Menu principale" required /><input name="code" placeholder="Codice automatico" /><input defaultValue="0" min="0" name="priority" type="number" /><button className="button-secondary" disabled={pending} type="submit">Aggiungi listino</button></form> : null}
            <div className="mt-4 space-y-2">{priceLists.map((item) => <button className={`w-full rounded-xl border p-3 text-left ${priceList?.id === item.id ? 'border-neutral-950' : 'border-neutral-200'}`} key={item.id} onClick={() => void loadPriceList(item.id)} type="button"><strong>{item.name}</strong><span className="muted block">{item.status === 'ACTIVE' ? 'Attivo' : 'Inattivo'} · priorità {item.priority}</span></button>)}</div>
          </section>
        </div>
      </details>
    </div>
  );
}
