'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';

interface LocationOption {
  id: string;
  name: string;
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

type Provider =
  | 'ADE_WEB'
  | 'ACUBE_SMART_RECEIPTS'
  | 'OPENAPI_SMART_RECEIPTS'
  | 'MOCK';

interface FiscalProfile {
  id: string;
  provider: Provider;
  environment: 'SANDBOX' | 'PRODUCTION';
  fiscalId: string;
  enabled: boolean;
  autoIssueOnPaid: boolean;
  receiptEmail: string | null;
  displayName: string | null;
  version: number;
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

function fiscalEndpoint(organizationId: string, locationId: string) {
  return `/api/control-center/platform/organizations/${organizationId}/locations/${encodeURIComponent(locationId)}?resource=fiscal-profile`;
}

export function PlatformFiscalProfileManager({
  organizationId,
  locations,
  initialLocationId,
}: Props) {
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [profile, setProfile] = useState<FiscalProfile | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(nextLocationId: string) {
    setLocationId(nextLocationId);
    setError(null);
    setMessage(null);
    if (!nextLocationId) {
      setProfile(null);
      return;
    }
    setPending(true);
    try {
      setProfile(
        await requestJson<FiscalProfile | null>(
          fiscalEndpoint(organizationId, nextLocationId),
        ),
      );
    } catch (loadError) {
      setProfile(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Caricamento non riuscito.',
      );
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!initialLocationId) return;
    let active = true;
    void requestJson<FiscalProfile | null>(
      fiscalEndpoint(organizationId, initialLocationId),
    )
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Caricamento non riuscito.',
          );
        }
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
      const saved = await requestJson<FiscalProfile>(
        fiscalEndpoint(organizationId, locationId),
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: String(form.get('provider') ?? 'ADE_WEB'),
            environment: String(form.get('environment') ?? 'PRODUCTION'),
            fiscalId: String(form.get('fiscalId') ?? '').trim(),
            enabled: form.get('enabled') === 'on',
            autoIssueOnPaid: form.get('autoIssueOnPaid') === 'on',
            receiptEmail:
              String(form.get('receiptEmail') ?? '').trim() || undefined,
            displayName:
              String(form.get('displayName') ?? '').trim() || undefined,
          }),
        },
      );
      setProfile(saved);
      setMessage('Configurazione fiscale aggiornata.');
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Salvataggio non riuscito.',
      );
    } finally {
      setPending(false);
    }
  }

  const formKey = `${locationId}:${profile?.version ?? 'new'}`;

  return (
    <div>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Configurazione fiscale non aggiornata"
      />
      <ControlCenterNotification
        message={message}
        onDismiss={() => setMessage(null)}
        title="Configurazione fiscale aggiornata"
      />

      <div className="wizard-actions">
        <div>
          <strong>Policy fiscale della sede</strong>
          <p className="muted">
            Solo gli amministratori Fluxa possono modificare questi parametri.
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
        <form className="form-grid mt-5" key={formKey} onSubmit={save}>
          <label className="field">
            <span>Provider</span>
            <select
              defaultValue={profile?.provider ?? 'ADE_WEB'}
              disabled={pending}
              name="provider"
            >
              <option value="ADE_WEB">ADE Web</option>
              <option value="ACUBE_SMART_RECEIPTS">
                A-Cube Smart Receipts
              </option>
              <option value="MOCK">Mock / test</option>
              <option disabled value="OPENAPI_SMART_RECEIPTS">
                OpenAPI — usa provisioning dedicato
              </option>
            </select>
          </label>
          <label className="field">
            <span>Ambiente</span>
            <select
              defaultValue={profile?.environment ?? 'PRODUCTION'}
              disabled={pending}
              name="environment"
            >
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Produzione</option>
            </select>
          </label>
          <label className="field">
            <span>Fiscal ID / P. IVA</span>
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
            <span>Nome visualizzato</span>
            <input
              defaultValue={profile?.displayName ?? ''}
              disabled={pending}
              maxLength={120}
              name="displayName"
            />
          </label>
          <label className="field">
            <span>Email ricevute</span>
            <input
              defaultValue={profile?.receiptEmail ?? ''}
              disabled={pending}
              name="receiptEmail"
              type="email"
            />
          </label>
          <label className="field">
            <span>Emissione automatica</span>
            <span>
              <input
                defaultChecked={profile?.autoIssueOnPaid ?? true}
                disabled={pending}
                name="autoIssueOnPaid"
                type="checkbox"
              />{' '}
              Emetti al pagamento
            </span>
          </label>
          <label className="field">
            <span>Stato</span>
            <span>
              <input
                defaultChecked={profile?.enabled ?? false}
                disabled={pending}
                name="enabled"
                type="checkbox"
              />{' '}
              Profilo attivo
            </span>
          </label>
          <div className="wizard-actions span-2">
            <span className="muted">
              OpenAPI mantiene il proprio provisioning nella sezione dedicata
              qui sotto.
            </span>
            <button
              className="button-primary"
              disabled={pending}
              type="submit"
            >
              {pending ? 'Salvataggio…' : 'Salva configurazione'}
            </button>
          </div>
        </form>
      ) : (
        <p className="muted mt-5">Seleziona una location del tenant.</p>
      )}
    </div>
  );
}
