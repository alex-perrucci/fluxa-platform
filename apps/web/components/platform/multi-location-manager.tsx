'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import { StatusBadge } from '@/components/control-center/status-badge';

export interface PlatformManagedLocation {
  id: string;
  merchantId: string;
  merchantLegalName: string;
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
  activeFrom: string | null;
  activeUntil: string | null;
  sourceLocationId: string | null;
  archivedAt: string | null;
}

interface MerchantOption {
  id: string;
  legalName: string;
  tradeName: string | null;
  vatNumber: string;
  status: string;
}

interface Props {
  organizationId: string;
  merchants: MerchantOption[];
  initialLocations: PlatformManagedLocation[];
}

function localDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString('it-IT') : '—';
}

export function MultiLocationManager({
  organizationId,
  merchants,
  initialLocations,
}: Props) {
  const [locations, setLocations] = useState(initialLocations);
  const [pending, setPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<'PERMANENT' | 'TEMPORARY'>('PERMANENT');
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const activeSources = useMemo(
    () => locations.filter((location) => location.lifecycleStatus !== 'ARCHIVED'),
    [locations],
  );

  async function refresh() {
    const response = await fetch(
      `/api/control-center/platform/organizations/${organizationId}/locations`,
    );
    if (!response.ok) return;
    setLocations((await response.json()) as PlatformManagedLocation[]);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const copyEnabled = Boolean(sourceLocationId);
    const payload = {
      merchantId: String(form.get('merchantId') ?? ''),
      code: String(form.get('code') ?? '').trim().toUpperCase(),
      name: String(form.get('name') ?? '').trim(),
      addressLine1: String(form.get('addressLine1') ?? '').trim(),
      addressLine2: String(form.get('addressLine2') ?? '').trim() || undefined,
      postalCode: String(form.get('postalCode') ?? '').trim(),
      city: String(form.get('city') ?? '').trim(),
      province: String(form.get('province') ?? '').trim().toUpperCase() || undefined,
      countryCode: 'IT',
      timezone: 'Europe/Rome',
      kind,
      activeFrom:
        kind === 'TEMPORARY'
          ? new Date(String(form.get('activeFrom'))).toISOString()
          : undefined,
      activeUntil:
        kind === 'TEMPORARY'
          ? new Date(String(form.get('activeUntil'))).toISOString()
          : undefined,
      sourceLocationId: sourceLocationId || undefined,
      copy: {
        layout: copyEnabled && form.get('copyLayout') === 'on',
        catalog: copyEnabled && form.get('copyCatalog') === 'on',
        priceLists: copyEnabled && form.get('copyPriceLists') === 'on',
        fiscalProfile: copyEnabled && form.get('copyFiscalProfile') === 'on',
      },
    };

    try {
      const response = await fetch(
        `/api/control-center/platform/organizations/${organizationId}/locations`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json()) as { message?: string; name?: string };
      if (!response.ok) {
        throw new Error(body.message ?? 'Location non creata.');
      }
      await refresh();
      formElement.reset();
      setKind('PERMANENT');
      setSourceLocationId('');
      setShowCreate(false);
      setMessage(`Location ${body.name ?? payload.name} creata.`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Location non creata.',
      );
    } finally {
      setPending(false);
    }
  }

  async function update(
    event: FormEvent<HTMLFormElement>,
    locationId: string,
  ) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(
        `/api/control-center/platform/organizations/${organizationId}/locations/${locationId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            code: String(form.get('code') ?? '').trim().toUpperCase(),
            name: String(form.get('name') ?? '').trim(),
            addressLine1: String(form.get('addressLine1') ?? '').trim(),
            addressLine2: String(form.get('addressLine2') ?? '').trim(),
            postalCode: String(form.get('postalCode') ?? '').trim(),
            city: String(form.get('city') ?? '').trim(),
            province: String(form.get('province') ?? '').trim().toUpperCase(),
          }),
        },
      );
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Modifica non salvata.');
      await refresh();
      setEditingId(null);
      setMessage('Location aggiornata.');
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : 'Modifica non salvata.',
      );
    } finally {
      setPending(false);
    }
  }

  async function lifecycle(
    location: PlatformManagedLocation,
    nextStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED',
  ) {
    if (
      nextStatus === 'ARCHIVED' &&
      !window.confirm(
        `Archiviare ${location.name}? La location resterà nello storico e non potrà essere riattivata.`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const url = `/api/control-center/platform/organizations/${organizationId}/locations/${location.id}`;
      const response = await fetch(
        nextStatus === 'ARCHIVED' ? url : `${url}/lifecycle`,
        nextStatus === 'ARCHIVED'
          ? { method: 'DELETE' }
          : {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ status: nextStatus }),
            },
      );
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Operazione non riuscita.');
      await refresh();
      setMessage(
        nextStatus === 'ARCHIVED'
          ? 'Location archiviata.'
          : nextStatus === 'ACTIVE'
            ? 'Location riattivata.'
            : 'Location disattivata.',
      );
    } catch (lifecycleError) {
      setError(
        lifecycleError instanceof Error
          ? lifecycleError.message
          : 'Operazione non riuscita.',
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
        title="Multi-location aggiornata"
      />

      <div className="wizard-actions">
        <span className="muted">
          {locations.length} location · permanenti e temporanee nello stesso tenant
        </span>
        <button
          className="button-primary"
          onClick={() => setShowCreate((value) => !value)}
          type="button"
        >
          {showCreate ? 'Chiudi' : 'Nuova location'}
        </button>
      </div>

      {showCreate ? (
        <form className="glass-panel panel-padding mt-5" onSubmit={create}>
          <div className="form-grid">
            <label className="field span-2">
              <span>Merchant fiscale</span>
              <select name="merchantId" required>
                {merchants
                  .filter((merchant) => merchant.status === 'ACTIVE')
                  .map((merchant) => (
                    <option key={merchant.id} value={merchant.id}>
                      {merchant.tradeName ?? merchant.legalName} · {merchant.vatNumber}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>Tipo</span>
              <select
                onChange={(event) =>
                  setKind(event.target.value as 'PERMANENT' | 'TEMPORARY')
                }
                value={kind}
              >
                <option value="PERMANENT">Permanente</option>
                <option value="TEMPORARY">Temporanea / evento</option>
              </select>
            </label>
            <label className="field">
              <span>Codice</span>
              <input name="code" placeholder="EVENTO26" required />
            </label>
            <label className="field span-2">
              <span>Nome location</span>
              <input name="name" placeholder="Arena Estate 2026" required />
            </label>
            <label className="field span-2">
              <span>Indirizzo</span>
              <input name="addressLine1" required />
            </label>
            <label className="field span-2">
              <span>Dettagli indirizzo</span>
              <input name="addressLine2" />
            </label>
            <label className="field">
              <span>CAP</span>
              <input name="postalCode" required />
            </label>
            <label className="field">
              <span>Città</span>
              <input name="city" required />
            </label>
            <label className="field">
              <span>Provincia</span>
              <input maxLength={8} name="province" />
            </label>
            {kind === 'TEMPORARY' ? (
              <>
                <label className="field">
                  <span>Attiva dal</span>
                  <input name="activeFrom" required type="datetime-local" />
                </label>
                <label className="field">
                  <span>Attiva fino al</span>
                  <input name="activeUntil" required type="datetime-local" />
                </label>
              </>
            ) : null}
            <label className="field span-2">
              <span>Copia configurazioni da</span>
              <select
                onChange={(event) => setSourceLocationId(event.target.value)}
                value={sourceLocationId}
              >
                <option value="">Nessuna copia</option>
                {activeSources.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} · {location.code}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {sourceLocationId ? (
            <div className="form-grid mt-5">
              <label className="field"><span><input defaultChecked name="copyLayout" type="checkbox" /> Sale e tavoli</span></label>
              <label className="field"><span><input defaultChecked name="copyCatalog" type="checkbox" /> Catalogo abilitato</span></label>
              <label className="field"><span><input defaultChecked name="copyPriceLists" type="checkbox" /> Listini</span></label>
              <label className="field"><span><input name="copyFiscalProfile" type="checkbox" /> Profilo fiscale disabilitato</span></label>
            </div>
          ) : null}
          <div className="wizard-actions">
            <span className="muted">
              Il profilo fiscale copiato resta disabilitato finché non viene verificato.
            </span>
            <button className="button-primary" disabled={pending} type="submit">
              {pending ? 'Creazione…' : 'Crea location'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="data-list mt-5">
        {locations.map((location) => (
          <div className="data-row" key={location.id}>
            {editingId === location.id ? (
              <form
                className="form-grid span-2"
                onSubmit={(event) => void update(event, location.id)}
              >
                <label className="field"><span>Codice</span><input defaultValue={location.code} name="code" required /></label>
                <label className="field"><span>Nome</span><input defaultValue={location.name} name="name" required /></label>
                <label className="field span-2"><span>Indirizzo</span><input defaultValue={location.addressLine1} name="addressLine1" required /></label>
                <label className="field"><span>Dettagli</span><input defaultValue={location.addressLine2 ?? ''} name="addressLine2" /></label>
                <label className="field"><span>CAP</span><input defaultValue={location.postalCode} name="postalCode" required /></label>
                <label className="field"><span>Città</span><input defaultValue={location.city} name="city" required /></label>
                <label className="field"><span>Provincia</span><input defaultValue={location.province ?? ''} name="province" /></label>
                <div className="wizard-actions span-2">
                  <button className="button-secondary" onClick={() => setEditingId(null)} type="button">Annulla</button>
                  <button className="button-primary" disabled={pending} type="submit">Salva</button>
                </div>
              </form>
            ) : (
              <>
                <div>
                  <strong>{location.name}</strong>
                  <small>{location.code} · {location.merchantLegalName}</small>
                  <small>{location.addressLine1}, {location.postalCode} {location.city}</small>
                </div>
                <div>
                  <span>{location.kind === 'TEMPORARY' ? 'Temporanea' : 'Permanente'}</span>
                  <small>
                    {location.kind === 'TEMPORARY'
                      ? `${localDateTime(location.activeFrom)} → ${localDateTime(location.activeUntil)}`
                      : location.timezone}
                  </small>
                  <div className="wizard-actions">
                    {location.lifecycleStatus !== 'ARCHIVED' ? (
                      <button className="button-secondary" onClick={() => setEditingId(location.id)} type="button">Modifica</button>
                    ) : null}
                    {location.lifecycleStatus === 'ACTIVE' ? (
                      <button className="button-secondary" disabled={pending} onClick={() => void lifecycle(location, 'INACTIVE')} type="button">Disattiva</button>
                    ) : location.lifecycleStatus === 'INACTIVE' ? (
                      <button className="button-secondary" disabled={pending} onClick={() => void lifecycle(location, 'ACTIVE')} type="button">Riattiva</button>
                    ) : null}
                    {location.lifecycleStatus !== 'ARCHIVED' ? (
                      <button className="button-secondary" disabled={pending} onClick={() => void lifecycle(location, 'ARCHIVED')} type="button">Archivia</button>
                    ) : null}
                  </div>
                </div>
                <StatusBadge status={location.lifecycleStatus} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
