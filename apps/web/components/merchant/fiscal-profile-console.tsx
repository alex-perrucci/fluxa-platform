'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';

type FiscalProvider =
  | 'OPENAPI_SMART_RECEIPTS'
  | 'ACUBE_SMART_RECEIPTS'
  | 'MOCK';
type FiscalEnvironment = 'SANDBOX' | 'PRODUCTION';

export interface FiscalProfileLocation {
  id: string;
  name: string;
}

interface FiscalProfile {
  id: string;
  locationId: string;
  provider: FiscalProvider;
  environment: FiscalEnvironment;
  fiscalId: string;
  enabled: boolean;
  autoIssueOnPaid: boolean;
  receiptEmail: string | null;
  displayName: string | null;
  version: number;
}

interface EditableProfile {
  provider: FiscalProvider;
  environment: FiscalEnvironment;
  fiscalId: string;
  enabled: boolean;
  autoIssueOnPaid: boolean;
  receiptEmail: string;
  displayName: string;
}

const EMPTY_PROFILE: EditableProfile = {
  provider: 'OPENAPI_SMART_RECEIPTS',
  environment: 'SANDBOX',
  fiscalId: '',
  enabled: false,
  autoIssueOnPaid: false,
  receiptEmail: '',
  displayName: '',
};

const providerLabels: Record<FiscalProvider, string> = {
  OPENAPI_SMART_RECEIPTS: 'OpenAPI Smart Receipts',
  ACUBE_SMART_RECEIPTS: 'A-Cube Smart Receipts',
  MOCK: 'Mock / test locale',
};

async function responseJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as
    | T
    | { message?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      body &&
        typeof body === 'object' &&
        'message' in body &&
        typeof body.message === 'string'
        ? body.message
        : 'Profilo fiscale non disponibile.',
    );
  }
  return body as T;
}

function editable(profile: FiscalProfile | null): EditableProfile {
  if (!profile) return { ...EMPTY_PROFILE };
  return {
    provider: profile.provider,
    environment: profile.environment,
    fiscalId: profile.fiscalId,
    enabled: profile.enabled,
    autoIssueOnPaid: profile.autoIssueOnPaid,
    receiptEmail: profile.receiptEmail ?? '',
    displayName: profile.displayName ?? '',
  };
}

export function FiscalProfileConsole({
  locations,
  initialLocationId,
  canManage,
}: {
  locations: FiscalProfileLocation[];
  initialLocationId: string | null;
  canManage: boolean;
}) {
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [profile, setProfile] = useState<EditableProfile>({ ...EMPTY_PROFILE });
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(Boolean(initialLocationId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!locationId) {
      setProfile({ ...EMPTY_PROFILE });
      setExists(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);

    void responseJson<FiscalProfile | null>(
      `/api/control-center/merchant/configuration/fiscal-profiles/${locationId}`,
    )
      .then((loaded) => {
        if (cancelled) return;
        setExists(Boolean(loaded));
        setProfile(editable(loaded));
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Profilo fiscale non disponibile.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [locationId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locationId || !canManage) return;

    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const saved = await responseJson<FiscalProfile>(
        `/api/control-center/merchant/configuration/fiscal-profiles/${locationId}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            provider: String(form.get('provider')),
            environment: String(form.get('environment')),
            fiscalId: String(form.get('fiscalId') ?? '').trim(),
            enabled: form.get('enabled') === 'on',
            autoIssueOnPaid: form.get('autoIssueOnPaid') === 'on',
            receiptEmail: String(form.get('receiptEmail') ?? '').trim() || undefined,
            displayName: String(form.get('displayName') ?? '').trim() || undefined,
          }),
        },
      );
      setExists(true);
      setProfile(editable(saved));
      setMessage('Profilo fiscale salvato. Il POS userà questa configurazione per la sede.');
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Profilo fiscale non salvato.',
      );
    } finally {
      setSaving(false);
    }
  }

  const openApiProduction =
    profile.provider === 'OPENAPI_SMART_RECEIPTS' &&
    profile.environment === 'PRODUCTION';

  return (
    <section className="glass-panel panel-padding">
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

      <div className="section-heading">
        <div>
          <p className="eyebrow">Fiscal configuration</p>
          <h2>Provider fiscale</h2>
        </div>
        <select
          disabled={loading || saving || locations.length === 0}
          onChange={(event) => setLocationId(event.target.value)}
          value={locationId}
        >
          {locations.length === 0 ? (
            <option value="">Nessuna sede disponibile</option>
          ) : null}
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>

      <p className="muted">
        Configura per ogni sede quale servizio emette i documenti fiscali. Token e
        credenziali dei provider restano esclusivamente sul server e non sono mai
        salvati nel browser o nel profilo del locale.
      </p>

      {!locationId ? (
        <p className="muted mt-5">Crea una sede prima di configurare il fiscale.</p>
      ) : loading ? (
        <p className="muted mt-5">Caricamento profilo fiscale…</p>
      ) : (
        <form className="form-grid mt-5" onSubmit={save}>
          <label className="field">
            <span>Provider</span>
            <select
              disabled={!canManage || saving}
              name="provider"
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  provider: event.target.value as FiscalProvider,
                }))
              }
              value={profile.provider}
            >
              {(Object.keys(providerLabels) as FiscalProvider[]).map((provider) => (
                <option key={provider} value={provider}>
                  {providerLabels[provider]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Ambiente</span>
            <select
              disabled={!canManage || saving}
              name="environment"
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  environment: event.target.value as FiscalEnvironment,
                }))
              }
              value={profile.environment}
            >
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Produzione</option>
            </select>
          </label>

          <label className="field">
            <span>P. IVA fiscale</span>
            <input
              autoComplete="off"
              disabled={!canManage || saving}
              inputMode="numeric"
              maxLength={11}
              minLength={11}
              name="fiscalId"
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  fiscalId: event.target.value.replace(/\D/g, '').slice(0, 11),
                }))
              }
              pattern="[0-9]{11}"
              required
              value={profile.fiscalId}
            />
          </label>

          <label className="field">
            <span>Nome visualizzato</span>
            <input
              disabled={!canManage || saving}
              maxLength={120}
              name="displayName"
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              placeholder="Punta Cana"
              value={profile.displayName}
            />
          </label>

          <label className="field span-2">
            <span>Email ricevute / riferimento</span>
            <input
              disabled={!canManage || saving}
              maxLength={320}
              name="receiptEmail"
              onChange={(event) =>
                setProfile((current) => ({
                  ...current,
                  receiptEmail: event.target.value,
                }))
              }
              placeholder="amministrazione@locale.it"
              type="email"
              value={profile.receiptEmail}
            />
          </label>

          <label className="field">
            <span>Provider abilitato</span>
            <span>
              <input
                checked={profile.enabled}
                disabled={!canManage || saving}
                name="enabled"
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
                type="checkbox"
              />{' '}
              Consenti emissione fiscale
            </span>
          </label>

          <label className="field">
            <span>Emissione automatica</span>
            <span>
              <input
                checked={profile.autoIssueOnPaid}
                disabled={!canManage || saving}
                name="autoIssueOnPaid"
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    autoIssueOnPaid: event.target.checked,
                  }))
                }
                type="checkbox"
              />{' '}
              Emetti quando l’ordine è pagato
            </span>
          </label>

          {openApiProduction ? (
            <div className="span-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
              OpenAPI è impostato in produzione. Prima di abilitare il profilo verifica
              sul server il token di produzione e che l’esercente abbia completato
              l’incarico necessario per la trasmissione.
            </div>
          ) : null}

          <div className="wizard-actions span-2">
            <span className="muted">
              {exists ? 'Profilo esistente' : 'Nuovo profilo'} · le modifiche sono
              specifiche per la sede selezionata.
            </span>
            {canManage ? (
              <button className="button-primary" disabled={saving} type="submit">
                {saving ? 'Salvataggio…' : 'Salva profilo fiscale'}
              </button>
            ) : (
              <span className="muted">Solo Owner e Admin possono modificarlo.</span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
