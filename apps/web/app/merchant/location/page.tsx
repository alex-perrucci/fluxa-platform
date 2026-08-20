import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import {
  LocationConsole,
  type DiningArea,
  type DiningTable,
  type MerchantLocation,
} from '@/components/merchant/location-console';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import { resolveAdministrativeLocation } from '@/lib/control-center/merchant-context';

export default async function MerchantLocationPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const session = await requireMerchantSession();
  const params = await searchParams;
  const locations =
    await authenticatedFluxaFetch<MerchantLocation[]>('/locations');
  const membership = session.availableOrganizations.find(
    (organization) =>
      organization.organizationId === session.session.organizationId,
  );
  const initialLocation = resolveAdministrativeLocation({
    locations,
    requestedLocationId: params.locationId,
    defaultLocationId: membership?.defaultLocationId,
  });
  const initialLocationId = initialLocation?.id ?? null;

  if (!locations.length || !initialLocationId) {
    return (
      <section className="glass-panel">
        <EmptyState
          description="Chiedi a un amministratore Fluxa di assegnarti una sede attiva."
          title="Nessuna sede disponibile"
        />
      </section>
    );
  }

  const [initialAreas, initialTables] = await Promise.all([
    authenticatedFluxaFetch<DiningArea[]>(
      `/dining-areas?locationId=${encodeURIComponent(initialLocationId)}`,
    ),
    authenticatedFluxaFetch<DiningTable[]>(
      `/dining-tables?locationId=${encodeURIComponent(initialLocationId)}`,
    ),
  ]);

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Sedi" title="Gestione del locale" />
        <p className="muted">
          Aggiorna dati della sede, sale, tavoli e capienze in base ai permessi
          del tuo account.
        </p>
      </section>
      <div className="mt-5">
        <LocationConsole
          initialAreas={initialAreas}
          initialLocationId={initialLocationId}
          initialLocations={locations}
          initialTables={initialTables}
        />
      </div>
    </>
  );
}
