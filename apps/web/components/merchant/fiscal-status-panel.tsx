'use client';

import { useState } from 'react';

export interface MerchantFiscalStatus {
  locationId: string;
  state: 'ACTIVE' | 'INACTIVE' | 'NOT_CONFIGURED';
  mode: string | null;
  autoIssueOnPaid: boolean;
  lastDocument: {
    id: string;
    status: string;
    totalCents: number;
    createdAt: string;
    issuedAt: string | null;
  } | null;
}

interface LocationOption {
  id: string;
  name: string;
}

interface Props {
  locations: LocationOption[];
  initialLocationId: string | null;
  initialStatus: MerchantFiscalStatus | null;
  initialError?: string | null;
}

async function requestStatus(locationId: string) {
  const response = await fetch(
    `/api/control-center/merchant/configuration/fiscal-profiles/${encodeURIComponent(locationId)}`,
    { cache: 'no-store' },
  );
  const payload = (await response.json().catch(() => null)) as
    | MerchantFiscalStatus
    | { message?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      payload && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : 'Impossibile verificare la fiscalizzazione.',
    );
  }
  return payload as MerchantFiscalStatus;
}

function euro(cents: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

function documentCopy(status: string) {
  switch (status) {
    case 'ISSUED':
      return 'Emesso correttamente';
    case 'AUTH_REQUIRED':
      return 'Connessione con Agenzia delle Entrate da ripristinare. Contatta l’assistenza Fluxa.';
    case 'UNKNOWN':
      return 'Verifica necessaria. Non ripetere l’emissione. Contatta l’assistenza Fluxa.';
    case 'REJECTED':
      return 'Emissione non riuscita. Contatta l’assistenza Fluxa.';
    case 'VOIDED':
      return 'Documento stornato';
    case 'CANCELLED':
      return 'Documento annullato';
    default:
      return 'Elaborazione in corso';
  }
}

export function FiscalStatusPanel({
  locations,
  initialLocationId,
  initialStatus,
  initialError = null,
}: Props) {
  const [locationId, setLocationId] = useState(initialLocationId ?? '');
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function load(nextLocationId: string) {
    setLocationId(nextLocationId);
    setError(null);
    if (!nextLocationId) {
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      setStatus(await requestStatus(nextLocationId));
    } catch (loadError) {
      setStatus(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Impossibile verificare la fiscalizzazione.',
      );
    } finally {
      setLoading(false);
    }
  }

  const lastDocument = status?.lastDocument ?? null;
  const lastDocumentDate = lastDocument
    ? new Date(lastDocument.issuedAt ?? lastDocument.createdAt).toLocaleString(
        'it-IT',
      )
    : null;

  return (
    <div className="space-y-5">
      <label className="field max-w-xl">
        <span>Sede</span>
        <select
          disabled={loading}
          onChange={(event) => void load(event.target.value)}
          value={locationId}
        >
          <option value="">Seleziona una sede</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <div className="rounded-2xl border bg-white p-5 text-sm">
          <strong>Verifica non disponibile</strong>
          <p className="muted mt-1">{error}</p>
        </div>
      ) : null}

      {loading ? <p className="muted">Verifica in corso…</p> : null}

      {!loading && status?.state === 'NOT_CONFIGURED' ? (
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-semibold">
            Fiscalizzazione non ancora configurata
          </h2>
          <p className="muted mt-2">
            Contatta Fluxa per completare l’attivazione.
          </p>
        </div>
      ) : null}

      {!loading && status?.state === 'INACTIVE' ? (
        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-lg font-semibold">
            Fiscalizzazione non operativa
          </h2>
          <p className="muted mt-2">
            La configurazione esiste ma non è attiva. Contatta l’assistenza
            Fluxa.
          </p>
        </div>
      ) : null}

      {!loading && status?.state === 'ACTIVE' ? (
        <div className="space-y-4">
          <div className="data-list">
            <div className="data-row">
              <div>
                <strong>Stato</strong>
                <small>Fiscalizzazione della sede</small>
              </div>
              <span>Operativa</span>
            </div>
            <div className="data-row">
              <div>
                <strong>Modalità</strong>
                <small>Servizio utilizzato per l’emissione</small>
              </div>
              <span>{status.mode ?? 'Servizio fiscale Fluxa'}</span>
            </div>
            <div className="data-row">
              <div>
                <strong>Emissione automatica</strong>
                <small>
                  {status.autoIssueOnPaid
                    ? 'Gli scontrini vengono trasmessi automaticamente al pagamento.'
                    : 'L’emissione automatica non è attiva. Contatta Fluxa.'}
                </small>
              </div>
              <span>{status.autoIssueOnPaid ? 'Attiva' : 'Non attiva'}</span>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-lg font-semibold">Ultimo documento</h2>
            {lastDocument ? (
              <div className="mt-3 space-y-1 text-sm">
                <p>{lastDocumentDate}</p>
                <p className="text-lg font-semibold">
                  {euro(lastDocument.totalCents)}
                </p>
                <p className="muted">{documentCopy(lastDocument.status)}</p>
              </div>
            ) : (
              <p className="muted mt-2">
                Nessun documento fiscale emesso per questa sede.
              </p>
            )}
          </div>

          <a
            className="button-secondary inline-flex"
            href={`/merchant/fiscal-documents?locationId=${encodeURIComponent(locationId)}`}
          >
            Visualizza documenti fiscali
          </a>
        </div>
      ) : null}
    </div>
  );
}
