import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import {
  LocationConsole,
  type DiningArea,
  type DiningTable,
  type MerchantLocation,
} from '@/components/merchant/location-console';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';

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
  const requested = params.locationId
    ? locations.find((location) => location.id === params.locationId)
    : null;
  const defaultLocation = membership?.defaultLocationId
    ? locations.find(
        (location) => location.id === membership.defaultLocationId,
      )
    : null;
  const initialLocationId =
    requested?.id ?? defaultLocation?.id ?? locations[0]?.id ?? null;

  if (!locations.length || !initialLocationId) {
    return (
      <section className="glass-panel">
        <EmptyState
          description="Chiedi a un amministratore Fluxa di assegnarti una location attiva."
          title="Nessuna location assegnata"
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
        <SectionHeading
          eyebrow="Venue operations"
          title="Gestione completa del locale"
        />
        <p className="muted">
          Aggiorna dati della location, sale, tavoli e capienze rispettando i
          permessi assegnati al tuo account.
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
