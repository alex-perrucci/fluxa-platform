import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import { FloorPlanEditor } from '@/components/floor-plan/floor-plan-editor';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import type {
  FloorPlanLocation,
  FloorPlanView,
} from '@/lib/floor-plan/types';

export default async function MerchantFloorPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const session = await requireMerchantSession();
  const params = await searchParams;
  const locations =
    await authenticatedFluxaFetch<FloorPlanLocation[]>('/floor-plans');

  if (!locations.length) {
    return (
      <section className="glass-panel">
        <EmptyState
          description="Serve il permesso Piantina su almeno una location attiva."
          title="Nessuna piantina modificabile"
        />
      </section>
    );
  }

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
  const locationId =
    requested?.id ?? defaultLocation?.id ?? locations[0]?.id ?? '';
  const initialView = await authenticatedFluxaFetch<FloorPlanView>(
    `/floor-plans/${locationId}`,
  );

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading
          eyebrow="Visual venue builder"
          title="Floor-plan editor"
        />
        <p className="muted">
          Disegna pareti e forme, posiziona i tavoli operativi e pubblica
          versioni immutabili della piantina.
        </p>
      </section>
      <div className="mt-5">
        <FloorPlanEditor
          initialView={initialView}
          locations={locations}
          mode="merchant"
        />
      </div>
    </>
  );
}
