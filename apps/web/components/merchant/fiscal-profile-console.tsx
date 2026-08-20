'use client';

import { useState, type FormEvent } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import { StatusBadge } from '@/components/control-center/status-badge';

export type FiscalProvider =
  | 'MOCK'
  | 'ACUBE_SMART_RECEIPTS'
  | 'OPENAPI_SMART_RECEIPTS'
  | 'ADE_WEB';

export const FISCAL_PROVIDERS: readonly FiscalProvider[] = [
  'MOCK',
  'ACUBE_SMART_RECEIPTS',
  'OPENAPI_SMART_RECEIPTS',
  'ADE_WEB',
];

export type FiscalEnvironment = 'SANDBOX' | 'PRODUCTION';

export interface FiscalProfileLocation {
  id: string;
  name: string;
}

export interface FiscalProfile {
  id: string;
  organizationId: string;
  locationId: string;
  provider: FiscalProvider;
  environment: FiscalEnvironment;
  fiscalId: string;
  enabled: boolean;
  autoIssueOnPaid: boolean;
  receiptEmail: string | null;
  displayName: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  canManage: boolean;
  initialLocationId: string | null;
  initialLocations: FiscalProfileLocation[];
  initialProfile: FiscalProfile | null;
  apiBasePath?: string;
  lockedProvider?: FiscalProvider;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as
    | { message?: string }
    | T
    | null;

  if (!response.ok) {
    throw new Error(
      body &&
        typeof body === 'object' &&
        'message' in body &&
        typeof body.message === 'string'
        ? body.message
        : 'Operazione non riuscita.',
    );
  }

  return body as T;
}

export function providerLabel(provider: FiscalProvider) {
  switch (provider) {
    case 'ACUBE_SMART_RECEIPTS':
      return 'A-Cube Smart Receipts';
    case 'OPENAPI_SMART_RECEIPTS':
      return 'OpenAPI Smart Receipts';
    case 'ADE_WEB':
      return 'Agenzia delle Entrate';
    default:
      return 'Mock (solo test)';
  }
}

export function FiscalProfileConsole({
  canManage,
  initialLocationId,
  initialLocations,
  initialProfile,
  apiBasePath = '/api/control-center/merchant/configuration/fiscal-profiles',
  lockedProvider,
}: Props) {
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [profile, setProfile] = useState(initialProfile);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function profileUrl(nextLocationId: string) {
    return `${apiBasePath}/${encodeURIComponent(nextLocationId)}`;
  }

  async function loadProfile(nextLocationId: string) {
    setLocationId(nextLocationId);
    setError(null);
    setMessage(null);

    if (!nextLocationId) {
      setProfile(null);
      return;
    }

    setPending(true);
    setProfile(null);
    try {
      setProfile(
        await requestJson<FiscalProfile | null>(profileUrl(nextLocationId)),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Impossibile caricare il profilo fiscale.',
      );
    } finally {
      setPending(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locationId) {
      setError('Seleziona prima una sede.');
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const saved = await requestJson<FiscalProfile>(profileUrl(locationId), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          provider: lockedProvider ?? String(form.get('provider') ?? 'MOCK'),
          environment: String(form.get('environment') ?? 'SANDBOX'),
          fiscalId: String(form.get('fiscalId') ?? '').trim(),
          enabled: form.get('enabled') === 'on',
          autoIssueOnPaid: form.get('autoIssueOnPaid') === 'on',
          receiptEmail: String(form.get('receiptEmail') ?? '').trim() || undefined,
          displayName: String(form.get('displayName') ?? '').trim() || undefined,
        }),
      });
      setProfile(saved);
      setMessage('Profilo fiscale aggiornato.');
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Impossibile salvare il profilo fiscale.',
      );
    } finally {
      setPending(false);
    }
  }

  const formKey = `${locationId}:${profile?.version ?? 'new'}`;
  const provider = lockedProvider ?? profile?.provider ?? 'MOCK';

  return (
    <div>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Configurazione fiscale non completata"
      />
      <ControlCenterNotification
        message={message}
        onDismiss={() => setMessage(null)}
        title="Configurazione fiscale aggiornata"
      />

      <div className="wizard-actions">
        <div>
          <strong>Provider fiscale per sede</strong>
          <p className="muted">
            Seleziona il provider usato dal POS per l&apos;emissione fiscale. Le credenziali restano lato server e non vengono esposte nel VenueOS.
          </p>
        </div>
        <select
          disabled={pending}
          onChange={(event) => void loadProfile(event.target.value)}
          value={locationId}
        >
          <option value="">Seleziona sede</option>
          {initialLocations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>

      {locationId ? (
        <form className="form-grid mt-5" key={formKey} onSubmit={saveProfile}>
          <label className="field">
            <span>Provider</span>
            {lockedProvider ? (
              <input disabled value={providerLabel(lockedProvider)} />
            ) : (
              <select
                defaultValue={provider}
                disabled={!canManage || pending}
                name="provider"
              >
                {FISCAL_PROVIDERS.map((item) => (
                  <option key={item} value={item}>
                    {providerLabel(item)}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label className="field">
            <span>Ambiente</span>
            <select
              defaultValue={profile?.environment ?? 'SANDBOX'}
              disabled={!canManage || pending}
              name="environment"
            >
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Produzione</option>
            </select>
          </label>
          <label className="field">
            <span>ID fiscale / P. IVA</span>
            <input
              defaultValue={profile?.fiscalId ?? ''}
              disabled={!canManage || pending}
              inputMode="numeric"
              maxLength={11}
              minLength={11}
              name="fiscalId"
              pattern="[0-9]{11}"
              placeholder="12345678901"
              required
            />
          </label>
          <label className="field">
            <span>Nome visualizzato</span>
            <input
              defaultValue={profile?.displayName ?? ''}
              disabled={!canManage || pending}
              maxLength={120}
              name="displayName"
            />
          </label>
          <label className="field">
            <span>Email ricevute</span>
            <input
              defaultValue={profile?.receiptEmail ?? ''}
              disabled={!canManage || pending}
              name="receiptEmail"
              type="email"
            />
          </label>
          <label className="field">
            <span>Automazione</span>
            <span>
              <input
                defaultChecked={profile?.autoIssueOnPaid ?? true}
                disabled={!canManage || pending}
                name="autoIssueOnPaid"
                type="checkbox"
              />{' '}
              Emetti automaticamente al pagamento
            </span>
          </label>
          <label className="field">
            <span>Stato</span>
            <span>
              <input
                defaultChecked={profile?.enabled ?? false}
                disabled={!canManage || pending}
                name="enabled"
                type="checkbox"
              />{' '}
              Provider abilitato
            </span>
          </label>
          <div className="wizard-actions span-2">
            <div>
              {profile ? (
                <StatusBadge status={profile.enabled ? 'ACTIVE' : 'INACTIVE'} />
              ) : (
                <span className="muted">Nessun profilo configurato per questa sede.</span>
              )}
            </div>
            {canManage ? (
              <button className="button-primary" disabled={pending} type="submit">
                {profile ? 'Salva configurazione' : 'Crea configurazione'}
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="muted mt-5">Seleziona una sede per visualizzare il profilo fiscale.</p>
      )}
    </div>
  );
}
