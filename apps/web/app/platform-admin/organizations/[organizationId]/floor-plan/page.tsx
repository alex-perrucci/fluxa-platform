import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import { FloorPlanEditor } from '@/components/floor-plan/floor-plan-editor';
import type { PlatformManagedLocation } from '@/components/platform/multi-location-manager';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type {
  FloorPlanLocation,
  FloorPlanView,
} from '@/lib/floor-plan/types';

export default async function PlatformFloorPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ locationId?: string }>;
}) {
  const { organizationId } = await params;
  const query = await searchParams;
  const managedLocations = await authenticatedFluxaFetch<
    PlatformManagedLocation[]
  >(`/platform/organizations/${organizationId}/locations`);
  const locations: FloorPlanLocation[] = managedLocations
    .filter((location) => location.lifecycleStatus === 'ACTIVE')
    .map((location) => ({
      id: location.id,
      code: location.code,
      name: location.name,
      city: location.city,
      timezone: location.timezone,
    }));

  if (!locations.length) {
    return (
      <section className="glass-panel">
        <EmptyState
          description="Crea o riattiva una location prima di disegnare la piantina."
          title="Nessuna location attiva"
        />
      </section>
    );
  }

  const requested = query.locationId
    ? locations.find((location) => location.id === query.locationId)
    : null;
  const locationId = requested?.id ?? locations[0]?.id ?? '';
  const initialView = await authenticatedFluxaFetch<FloorPlanView>(
    `/platform/organizations/${organizationId}/locations/${locationId}/floor-plan`,
  );

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading
          eyebrow="Platform venue builder"
          title="Floor-plan editor"
        />
        <p className="muted">
          Configura e pubblica le piantine delle location del tenant con lo
          stesso sistema versionato disponibile ai manager.
        </p>
      </section>
      <div className="mt-5">
        <FloorPlanEditor
          initialView={initialView}
          locations={locations}
          mode="platform"
          organizationId={organizationId}
        />
      </div>
    </>
  );
}
