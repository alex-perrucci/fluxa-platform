'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import { StatusBadge } from '@/components/control-center/status-badge';

interface LocationOption {
  id: string;
  name: string;
  merchantLegalName: string;
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

interface FiscalProfile {
  id: string;
  provider: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  fiscalId: string;
  enabled: boolean;
  autoIssueOnPaid: boolean;
  receiptEmail: string | null;
  displayName: string | null;
  version: number;
}

interface ProviderConfiguration {
  reachable: boolean;
  configured: boolean;
  receipts: boolean;
  fiscalId: string;
  name: string | null;
  email: string | null;
  taxCode: string | null;
  reason: string | null;
}

interface ProfileResponse {
  location: {
    id: string;
    name: string;
    merchantLegalName: string;
  };
  profile: FiscalProfile | null;
  providerConfiguration: ProviderConfiguration | null;
}

interface Props {
  organizationId: string;
  locations: LocationOption[];
  initialLocationId: string | null;
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

export function OpenApiFiscalProfileManager({
  organizationId,
  locations,
  initialLocationId,
}: Props) {
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === locationId) ?? null,
    [locationId, locations],
  );

  function endpoint(nextLocationId: string) {
    return `/api/control-center/platform/organizations/${organizationId}/locations/${encodeURIComponent(nextLocationId)}?resource=openapi-fiscal-profile`;
  }

  async function load(nextLocationId: string) {
    setLocationId(nextLocationId);
    setError(null);
    setMessage(null);
    if (!nextLocationId) {
      setData(null);
      return;
    }
    setPending(true);
    try {
      setData(await requestJson<ProfileResponse>(endpoint(nextLocationId)));
    } catch (loadError) {
      setData(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Impossibile caricare la configurazione OpenAPI.',
      );
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!initialLocationId) return;
    let active = true;
    const url = `/api/control-center/platform/organizations/${organizationId}/locations/${encodeURIComponent(initialLocationId)}?resource=openapi-fiscal-profile`;
    void requestJson<ProfileResponse>(url)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Impossibile caricare la configurazione OpenAPI.',
        );
      });
    return () => {
      active = false;
    };
  }, [initialLocationId, organizationId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locationId) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await requestJson<ProfileResponse>(endpoint(locationId), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          environment: String(form.get('environment') ?? 'SANDBOX'),
          fiscalId: String(form.get('fiscalId') ?? '').trim(),
          companyName: String(form.get('companyName') ?? '').trim(),
          companyEmail: String(form.get('companyEmail') ?? '').trim(),
          displayName:
            String(form.get('displayName') ?? '').trim() || undefined,
          receiptEmail:
            String(form.get('receiptEmail') ?? '').trim() || undefined,
          autoIssueOnPaid: form.get('autoIssueOnPaid') === 'on',
          enabled: form.get('enabled') === 'on',
        }),
      });
      setData(saved);
      setMessage(
        saved.profile?.enabled
          ? 'OpenAPI configurato e profilo fiscale attivato.'
          : 'OpenAPI configurato. Il profilo fiscale resta disattivato.',
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Configurazione OpenAPI non completata.',
      );
    } finally {
      setPending(false);
    }
  }

  const profile = data?.profile ?? null;
  const provider = data?.providerConfiguration ?? null;
  const formKey = `${locationId}:${profile?.version ?? 'new'}:${provider?.configured ?? false}`;
  const defaultCompanyName =
    provider?.name ?? selectedLocation?.merchantLegalName ?? '';
  const defaultEmail = provider?.email ?? profile?.receiptEmail ?? '';

  return (
    <div>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="OpenAPI non configurato"
      />
      <ControlCenterNotification
        message={message}
        onDismiss={() => setMessage(null)}
        title="Configurazione OpenAPI aggiornata"
      />

      <div className="wizard-actions">
        <div>
          <strong>OpenAPI Smart Receipts per tenant</strong>
          <p className="muted">
            Crea o verifica la configurazione OpenAPI della singola location e
            collega il profilo fiscale Fluxa.
          </p>
        </div>
        <select
          disabled={pending}
          onChange={(event) => void load(event.target.value)}
          value={locationId}
        >
          <option value="">Seleziona location</option>
          {locations
            .filter((location) => location.lifecycleStatus !== 'ARCHIVED')
            .map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
        </select>
      </div>

      {locationId ? (
        <>
          <div className="data-list mt-5">
            <div className="data-row">
              <div>
                <strong>Configurazione provider</strong>
                <small>
                  {provider?.configured
                    ? `OpenAPI ${provider.fiscalId || ''}`
                    : 'Non ancora verificata su OpenAPI'}
                </small>
              </div>
              <StatusBadge
                status={provider?.configured ? 'ACTIVE' : 'INACTIVE'}
              />
            </div>
            <div className="data-row">
              <div>
                <strong>Scontrini</strong>
                <small>
                  {provider?.taxCode
                    ? 'Autenticazione fiscale presente sul provider'
                    : 'Autenticazione fiscale non rilevata'}
                </small>
              </div>
              <StatusBadge
                status={
                  provider?.receipts && provider?.taxCode ? 'ACTIVE' : 'INACTIVE'
                }
              />
            </div>
            <div className="data-row">
              <div>
                <strong>Profilo Fluxa</strong>
                <small>
                  {profile?.provider ?? 'Nessun provider fiscale configurato'}
                </small>
              </div>
              <StatusBadge status={profile?.enabled ? 'ACTIVE' : 'INACTIVE'} />
            </div>
          </div>

          <form className="form-grid mt-5" key={formKey} onSubmit={save}>
            <label className="field">
              <span>Ambiente</span>
              <select
                defaultValue={profile?.environment ?? 'SANDBOX'}
                disabled={pending}
                name="environment"
              >
                <option value="SANDBOX">Sandbox</option>
                <option value="PRODUCTION">Produzione</option>
              </select>
            </label>
            <label className="field">
              <span>P. IVA / fiscal ID</span>
              <input
                defaultValue={profile?.fiscalId ?? ''}
                disabled={pending}
                inputMode="numeric"
                maxLength={11}
                minLength={11}
                name="fiscalId"
                pattern="[0-9]{11}"
                required
              />
            </label>
            <label className="field">
              <span>Ragione sociale OpenAPI</span>
              <input
                defaultValue={defaultCompanyName}
                disabled={pending || Boolean(provider?.configured)}
                maxLength={220}
                name="companyName"
                required
              />
            </label>
            <label className="field">
              <span>Email azienda OpenAPI</span>
              <input
                defaultValue={defaultEmail}
                disabled={pending || Boolean(provider?.configured)}
                maxLength={320}
                name="companyEmail"
                required
                type="email"
              />
              <small className="muted">
                Dopo la creazione OpenAPI l&apos;email azienda non è modificabile.
              </small>
            </label>
            <label className="field">
              <span>Nome visualizzato in Fluxa</span>
              <input
                defaultValue={
                  profile?.displayName ?? selectedLocation?.name ?? ''
                }
                disabled={pending}
                maxLength={120}
                name="displayName"
              />
            </label>
            <label className="field">
              <span>Email ricevute Fluxa</span>
              <input
                defaultValue={profile?.receiptEmail ?? defaultEmail}
                disabled={pending}
                name="receiptEmail"
                type="email"
              />
            </label>
            <label className="field">
              <span>Automazione</span>
              <span>
                <input
                  defaultChecked={profile?.autoIssueOnPaid ?? true}
                  disabled={pending}
                  name="autoIssueOnPaid"
                  type="checkbox"
                />{' '}
                Emetti automaticamente al pagamento
              </span>
            </label>
            <label className="field">
              <span>Attivazione</span>
              <span>
                <input
                  defaultChecked={profile?.enabled ?? false}
                  disabled={pending}
                  name="enabled"
                  type="checkbox"
                />{' '}
                Abilita OpenAPI per questa location
              </span>
              <small className="muted">
                In produzione il backend rifiuta l&apos;attivazione finché OpenAPI
                non risulta pronto per gli scontrini.
              </small>
            </label>
            <div className="wizard-actions span-2">
              <span className="muted">
                Le credenziali del provider Fluxa restano esclusivamente lato
                server.
              </span>
              <button
                className="button-primary"
                disabled={pending}
                type="submit"
              >
                {provider?.configured
                  ? 'Verifica e aggiorna OpenAPI'
                  : 'Configura OpenAPI'}
              </button>
            </div>
          </form>
        </>
      ) : (
        <p className="muted mt-5">Seleziona una location del tenant.</p>
      )}
    </div>
  );
}
