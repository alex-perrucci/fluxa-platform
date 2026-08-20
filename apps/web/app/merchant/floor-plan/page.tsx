import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import { FloorPlanEditor } from '@/components/floor-plan/floor-plan-editor';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import { resolveAdministrativeLocation } from '@/lib/control-center/merchant-context';
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
          description="Serve il permesso Piantina su almeno una sede attiva."
          title="Nessuna piantina modificabile"
        />
      </section>
    );
  }

  const membership = session.availableOrganizations.find(
    (organization) =>
      organization.organizationId === session.session.organizationId,
  );
  const location = resolveAdministrativeLocation({
    locations,
    requestedLocationId: params.locationId,
    defaultLocationId: membership?.defaultLocationId,
  });
  const locationId = location?.id ?? '';
  const initialView = await authenticatedFluxaFetch<FloorPlanView>(
    `/floor-plans/${locationId}`,
  );

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Piantina" title="Tavoli e spazi" />
        <p className="muted">
          Disegna gli spazi, posiziona i tavoli e pubblica la piantina usata dal
          locale.
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
