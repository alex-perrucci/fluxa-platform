import Link from 'next/link';
import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import { FloorPlanEditor } from '@/components/floor-plan/floor-plan-editor';
import type { DiningArea, DiningTable, MerchantLocation } from '@/components/merchant/location-console';
import { VenueConsole } from '@/components/merchant/venue-console';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import { resolveAdministrativeLocation } from '@/lib/control-center/merchant-context';
import type { FloorPlanLocation, FloorPlanView } from '@/lib/floor-plan/types';

export default async function MerchantVenuePage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string; view?: string; new?: string }>;
}) {
  const session = await requireMerchantSession();
  const params = await searchParams;
  const view = params.view === 'map' ? 'map' : 'spaces';
  const membership = session.availableOrganizations.find(
    (organization) => organization.organizationId === session.session.organizationId,
  );

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Locale" title="Spazi e tavoli" />
        <p className="muted max-w-3xl">
          Qui gestisci la parte fisica del locale: sede, sale, tavoli e piantina. Non devi passare tra sezioni diverse per configurare lo stesso spazio.
        </p>
        <nav className="mt-5 flex flex-wrap gap-2" aria-label="Sezioni del locale">
          <Link
            className={view === 'spaces' ? 'button-primary' : 'button-secondary'}
            href={`/merchant/venue${params.locationId ? `?locationId=${encodeURIComponent(params.locationId)}` : ''}`}
          >
            Sale e tavoli
          </Link>
          <Link
            className={view === 'map' ? 'button-primary' : 'button-secondary'}
            href={`/merchant/venue?view=map${params.locationId ? `&locationId=${encodeURIComponent(params.locationId)}` : ''}`}
          >
            Piantina
          </Link>
        </nav>
      </section>

      <div className="mt-5">
        {view === 'map' ? (
          <FloorPlanViewSection
            defaultLocationId={membership?.defaultLocationId}
            requestedLocationId={params.locationId}
          />
        ) : (
          <SpacesView
            defaultLocationId={membership?.defaultLocationId}
            initialAction={params.new === 'table' ? 'table' : params.new === 'area' ? 'area' : null}
            requestedLocationId={params.locationId}
          />
        )}
      </div>
    </>
  );
}

async function SpacesView({
  defaultLocationId,
  initialAction,
  requestedLocationId,
}: {
  defaultLocationId?: string | null;
  initialAction: 'table' | 'area' | null;
  requestedLocationId?: string;
}) {
  const locations = await authenticatedFluxaFetch<MerchantLocation[]>('/locations');
  const initialLocation = resolveAdministrativeLocation({
    locations,
    requestedLocationId,
    defaultLocationId,
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
    <VenueConsole
      initialAction={initialAction}
      initialAreas={initialAreas}
      initialLocationId={initialLocationId}
      initialLocations={locations}
      initialTables={initialTables}
    />
  );
}

async function FloorPlanViewSection({
  defaultLocationId,
  requestedLocationId,
}: {
  defaultLocationId?: string | null;
  requestedLocationId?: string;
}) {
  const locations = await authenticatedFluxaFetch<FloorPlanLocation[]>('/floor-plans');
  if (!locations.length) {
    return (
      <section className="glass-panel">
        <EmptyState
          description="Serve il permesso Piantina su almeno una sede attiva."
          title="Nessuna piantina modificabile"
        />
      </section>
    );
  }

  const location = resolveAdministrativeLocation({
    locations,
    requestedLocationId,
    defaultLocationId,
  });
  const locationId = location?.id ?? locations[0].id;
  const initialView = await authenticatedFluxaFetch<FloorPlanView>(`/floor-plans/${locationId}`);

  return <FloorPlanEditor initialView={initialView} locations={locations} mode="merchant" />;
}
