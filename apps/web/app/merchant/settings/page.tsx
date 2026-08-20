import Link from 'next/link';
import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import { FiscalStatusPanel, type MerchantFiscalStatus } from '@/components/merchant/fiscal-status-panel';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { FluxaApiError } from '@/lib/api/fluxa-api';
import { requireMerchantSession } from '@/lib/auth/session';
import { controlCenterErrorView } from '@/lib/control-center/error-policy';
import { resolveAdministrativeLocation } from '@/lib/control-center/merchant-context';

interface LocationRow {
  id: string;
  name: string;
  status: string;
}

const fiscalRoles = new Set(['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'SUPPORT_READONLY']);

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const session = await requireMerchantSession();
  const params = await searchParams;
  const locations = await authenticatedFluxaFetch<LocationRow[]>('/locations');
  const membership = session.availableOrganizations.find(
    (organization) => organization.organizationId === session.session.organizationId,
  );
  const initialLocation = resolveAdministrativeLocation({
    locations,
    requestedLocationId: params.locationId,
    defaultLocationId: membership?.defaultLocationId,
  });

  let fiscalStatus: MerchantFiscalStatus | null = null;
  let fiscalError: string | null = null;
  if (initialLocation && fiscalRoles.has(session.session.role ?? '')) {
    try {
      fiscalStatus = await authenticatedFluxaFetch<MerchantFiscalStatus>(`/fiscal-profiles/${initialLocation.id}`);
    } catch (error) {
      fiscalError = error instanceof FluxaApiError
        ? controlCenterErrorView(error.code, error.status).message
        : 'Impossibile verificare la fiscalizzazione. Riprova tra poco.';
    }
  }

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Impostazioni" title="Il minimo indispensabile" />
        <p className="muted max-w-3xl">
          Qui controlli solo ciò che serve al locale. Provider, ambienti, credenziali e configurazioni tecniche sono responsabilità di Fluxa.
        </p>
      </section>

      <section className="glass-panel panel-padding mt-5">
        <div className="mb-5">
          <strong className="text-lg">Fiscalizzazione</strong>
          <p className="muted">Puoi verificarne lo stato, ma non devi configurare provider o credenziali.</p>
        </div>
        {!fiscalRoles.has(session.session.role ?? '') ? (
          <EmptyState description="Il tuo ruolo non consente di visualizzare lo stato fiscale." title="Accesso non disponibile" />
        ) : locations.length ? (
          <FiscalStatusPanel
            initialError={fiscalError}
            initialLocationId={initialLocation?.id ?? null}
            initialStatus={fiscalStatus}
            locations={locations}
          />
        ) : (
          <EmptyState description="Configura prima una sede per poter attivare la fiscalizzazione." title="Nessuna sede disponibile" />
        )}
      </section>

      <section className="glass-panel panel-padding mt-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <strong className="text-lg">Assistenza</strong>
            <p className="muted mt-1">Se qualcosa non funziona, Fluxa ti mostra solo il problema e come intervenire.</p>
          </div>
          <Link className="button-secondary" href="/merchant/health">Controlla stato del locale</Link>
        </div>
      </section>
    </>
  );
}
