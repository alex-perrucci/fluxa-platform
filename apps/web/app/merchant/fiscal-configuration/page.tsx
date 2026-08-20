import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import {
  FiscalStatusPanel,
  type MerchantFiscalStatus,
} from '@/components/merchant/fiscal-status-panel';
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

const allowedRoles = new Set([
  'OWNER',
  'ADMIN',
  'MANAGER',
  'ACCOUNTANT',
  'SUPPORT_READONLY',
]);

export default async function FiscalConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const session = await requireMerchantSession();
  const params = await searchParams;
  const role = session.session.role ?? '';

  if (!allowedRoles.has(role)) {
    return (
      <section className="glass-panel panel-padding">
        <EmptyState
          description="Il tuo ruolo non consente di visualizzare lo stato fiscale."
          title="Accesso non disponibile"
        />
      </section>
    );
  }

  const locations = await authenticatedFluxaFetch<LocationRow[]>('/locations');
  const membership = session.availableOrganizations.find(
    (organization) =>
      organization.organizationId === session.session.organizationId,
  );
  const initialLocation = resolveAdministrativeLocation({
    locations,
    requestedLocationId: params.locationId,
    defaultLocationId: membership?.defaultLocationId,
  });

  let initialStatus: MerchantFiscalStatus | null = null;
  let initialError: string | null = null;
  if (initialLocation) {
    try {
      initialStatus = await authenticatedFluxaFetch<MerchantFiscalStatus>(
        `/fiscal-profiles/${initialLocation.id}`,
      );
    } catch (error) {
      initialError =
        error instanceof FluxaApiError
          ? controlCenterErrorView(error.code, error.status).message
          : 'Impossibile verificare la fiscalizzazione. Riprova tra poco.';
    }
  }

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Fiscalizzazione" title="Stato fiscale" />
        <p className="muted">
          Qui puoi verificare se la fiscalizzazione è operativa. Le impostazioni
          tecniche e le credenziali sono gestite esclusivamente da Fluxa.
        </p>
      </section>

      <section className="glass-panel panel-padding mt-5">
        {locations.length ? (
          <FiscalStatusPanel
            initialError={initialError}
            initialLocationId={initialLocation?.id ?? null}
            initialStatus={initialStatus}
            locations={locations}
          />
        ) : (
          <EmptyState
            description="Configura prima una sede per poter attivare la fiscalizzazione."
            title="Nessuna sede disponibile"
          />
        )}
      </section>
    </>
  );
}
