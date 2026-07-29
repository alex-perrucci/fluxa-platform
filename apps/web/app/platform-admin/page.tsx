// PHASE_8_TRUE_CONTROL_CENTER
import Link from 'next/link';
import { Icon } from '@/components/control-center/icons';
import { MetricCard, SectionHeading } from '@/components/control-center/shell';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { PlatformOverview } from '@/lib/control-center/types';

function euro(cents: string) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(cents) / 100);
}

export default async function PlatformAdminPage() {
  const overview =
    await authenticatedFluxaFetch<PlatformOverview>('/platform/overview');

  return (
    <>
      <div className="metrics-grid">
        <MetricCard
          accent="blue"
          hint={`${overview.metrics.activeOrganizations} attive`}
          icon="building"
          label="Organizzazioni"
          value={overview.metrics.organizations}
        />
        <MetricCard
          accent="violet"
          hint="Account globali"
          icon="users"
          label="Utenti"
          value={overview.metrics.users}
        />
        <MetricCard
          accent="cyan"
          hint={`${overview.metrics.reservations} prenotazioni`}
          icon="calendar"
          label="Eventi"
          value={overview.metrics.events}
        />
        <MetricCard
          accent={overview.metrics.refundPending ? 'rose' : 'blue'}
          hint={`${overview.metrics.refundPending} refund pending`}
          icon="money"
          label="Volume pagato"
          value={euro(overview.metrics.paidVolumeCents)}
        />
      </div>

      <div className="dashboard-grid">
        <section className="glass-panel panel-padding">
          <SectionHeading
            action={
              <Link
                className="button-secondary"
                href="/platform-admin/organizations"
              >
                Tutti i tenant
              </Link>
            }
            eyebrow="Tenant network"
            title="Ultime organizzazioni"
          />
          <div className="data-list">
            {overview.recentOrganizations.map((organization) => (
              <Link
                className="data-row"
                href={`/platform-admin/organizations/${organization.id}`}
                key={organization.id}
              >
                <div className="event-title-cell">
                  <div className="cc-avatar">
                    {organization.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <strong>{organization.name}</strong>
                    <small>{organization.slug}</small>
                  </div>
                </div>
                <div>
                  <span>{organization.createdByEmail ?? 'Fluxa Platform'}</span>
                  <small>
                    {new Intl.DateTimeFormat('it-IT').format(
                      new Date(organization.createdAt),
                    )}
                  </small>
                </div>
                <StatusBadge status={organization.status} />
              </Link>
            ))}
          </div>
        </section>

        <aside className="glass-panel panel-padding">
          <SectionHeading eyebrow="Launchpad" title="Azioni piattaforma" />
          <div className="quick-action-grid">
            <Link
              className="quick-action"
              href="/platform-admin/organizations/new"
            >
              <div>
                <Icon name="sparkles" />
              </div>
              <div>
                <strong>Onboarding atomico</strong>
                <span>Tenant, owner, sede e tavoli</span>
              </div>
            </Link>
            <Link className="quick-action" href="/platform-admin/organizations">
              <div>
                <Icon name="building" />
              </div>
              <div>
                <strong>Tenant directory</strong>
                <span>Stato e dettaglio organizzazioni</span>
              </div>
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
