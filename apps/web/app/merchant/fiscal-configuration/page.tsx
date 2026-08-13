import { SectionHeading } from '@/components/control-center/shell';
import {
  FiscalProfileConsole,
  type FiscalProfile,
  type FiscalProfileLocation,
} from '@/components/merchant/fiscal-profile-console';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';

interface LocationRow extends FiscalProfileLocation {
  status: 'ACTIVE' | 'INACTIVE';
}

export default async function FiscalConfigurationPage() {
  const session = await requireMerchantSession();
  const locations = await authenticatedFluxaFetch<LocationRow[]>('/locations');
  const role = session.session.role ?? '';
  const canView = [
    'OWNER',
    'ADMIN',
    'MANAGER',
    'ACCOUNTANT',
    'SUPPORT_READONLY',
  ].includes(role);
  const canManage = ['OWNER', 'ADMIN'].includes(role);
  const membership = session.availableOrganizations.find(
    (organization) =>
      organization.organizationId === session.session.organizationId,
  );
  const initialLocationId =
    membership?.defaultLocationId ??
    locations.find((location) => location.status === 'ACTIVE')?.id ??
    locations[0]?.id ??
    null;
  const initialProfile =
    canView && initialLocationId
      ? await authenticatedFluxaFetch<FiscalProfile | null>(
          `/fiscal-profiles/${initialLocationId}`,
        )
      : null;

  return (
    <section className="glass-panel panel-padding">
      <SectionHeading eyebrow="Venue configuration" title="Configurazione fiscale" />
      {canView ? (
        <FiscalProfileConsole
          canManage={canManage}
          initialLocationId={initialLocationId}
          initialLocations={locations}
          initialProfile={initialProfile}
        />
      ) : (
        <p className="muted">
          Il tuo ruolo non può visualizzare i profili fiscali. OWNER e ADMIN possono modificarli.
        </p>
      )}
    </section>
  );
}
