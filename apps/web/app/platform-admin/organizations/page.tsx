// PHASE_8_TRUE_CONTROL_CENTER
import Link from 'next/link';
import { Icon } from '@/components/control-center/icons';
import { SectionHeading } from '@/components/control-center/shell';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { OrganizationListItem } from '@/lib/control-center/types';

export default async function OrganizationsPage() {
  const organizations =
    await authenticatedFluxaFetch<OrganizationListItem[]>('/organizations');

  return (
    <section className="glass-panel panel-padding">
      <SectionHeading
        action={
          <Link
            className="button-primary"
            href="/platform-admin/organizations/new"
          >
            <Icon name="plus" />
            Nuova organizzazione
          </Link>
        }
        eyebrow="Tenant directory"
        title={`${organizations.length} organizzazioni`}
      />

      <div className="data-list">
        {organizations.map((organization) => (
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
              <span>{organization.id}</span>
            </div>
            <StatusBadge status={organization.status} />
          </Link>
        ))}
      </div>
    </section>
  );
}
