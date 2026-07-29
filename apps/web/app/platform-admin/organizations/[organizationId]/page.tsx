// PHASE_8_TRUE_CONTROL_CENTER
import { MetricCard, SectionHeading } from '@/components/control-center/shell';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { PlatformOrganizationDetail } from '@/lib/control-center/types';

function euro(cents: string) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(cents) / 100);
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const detail = await authenticatedFluxaFetch<PlatformOrganizationDetail>(
    `/platform/organizations/${organizationId}`,
  );

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading
          action={<StatusBadge status={detail.organization.status} />}
          eyebrow={detail.organization.slug}
          title={detail.organization.name}
        />
        <p className="muted">
          Tenant ID {detail.organization.id} · creato da{' '}
          {detail.organization.createdByEmail ?? 'Fluxa Platform'}
        </p>
      </section>

      <div className="metrics-grid mt-5">
        <MetricCard
          hint={`${detail.metrics.locations} sedi`}
          icon="building"
          label="Merchant"
          value={detail.metrics.merchants}
        />
        <MetricCard
          accent="violet"
          hint="Account collegati"
          icon="users"
          label="Membri"
          value={detail.metrics.members}
        />
        <MetricCard
          accent="cyan"
          hint={`${detail.metrics.reservations} prenotazioni`}
          icon="calendar"
          label="Eventi"
          value={detail.metrics.events}
        />
        <MetricCard
          accent="blue"
          hint="Pagamenti Stripe"
          icon="money"
          label="Volume"
          value={euro(detail.metrics.paidVolumeCents)}
        />
      </div>

      <div className="dashboard-grid">
        <section className="glass-panel panel-padding">
          <SectionHeading eyebrow="Locations" title="Sedi operative" />
          <div className="data-list">
            {detail.locations.map((location) => (
              <div className="data-row" key={location.id}>
                <div>
                  <strong>{location.name}</strong>
                  <small>
                    {location.code} · {location.city}
                  </small>
                </div>
                <div>
                  <span>{location.timezone}</span>
                  <small>{location.province ?? '—'}</small>
                </div>
                <StatusBadge status={location.status} />
              </div>
            ))}
          </div>
        </section>

        <aside className="glass-panel panel-padding">
          <SectionHeading eyebrow="People" title="Membri" />
          <div className="data-list">
            {detail.members.map((member) => (
              <div className="data-row" key={member.membershipId}>
                <div>
                  <strong>{member.displayName}</strong>
                  <small>{member.email}</small>
                </div>
                <div>
                  <span>{member.role}</span>
                  <small>{member.defaultLocationName ?? 'Nessuna sede'}</small>
                </div>
                <StatusBadge status={member.status} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
