// PHASE_8_TRUE_CONTROL_CENTER
import Link from 'next/link';
import { MetricCard, SectionHeading } from '@/components/control-center/shell';
import { StatusBadge } from '@/components/control-center/status-badge';
import { LocationAccessManager } from '@/components/platform/location-access-manager';
import {
  MultiLocationManager,
  type PlatformManagedLocation,
} from '@/components/platform/multi-location-manager';
import { PlatformTableLayoutEditor } from '@/components/platform/table-layout-editor';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type {
  PlatformOrganizationDetail,
  PlatformTableLayout,
} from '@/lib/control-center/types';

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
  const [detail, managedLocations] = await Promise.all([
    authenticatedFluxaFetch<PlatformOrganizationDetail>(
      `/platform/organizations/${organizationId}`,
    ),
    authenticatedFluxaFetch<PlatformManagedLocation[]>(
      `/platform/organizations/${organizationId}/locations`,
    ),
  ]);
  const firstActiveLocation = managedLocations.find(
    (location) => location.lifecycleStatus === 'ACTIVE',
  );
  const initialLayout = firstActiveLocation
    ? await authenticatedFluxaFetch<PlatformTableLayout>(
        `/platform/organizations/${organizationId}/table-layout?locationId=${encodeURIComponent(firstActiveLocation.id)}`,
      )
    : null;
  const layoutLocations = managedLocations
    .filter((location) => location.lifecycleStatus !== 'ARCHIVED')
    .map((location) => ({
      id: location.id,
      merchantId: location.merchantId,
      code: location.code,
      name: location.name,
      city: location.city,
      province: location.province,
      timezone: location.timezone,
      status: location.status,
    }));

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
          hint={`${managedLocations.length} location`}
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

      <section className="glass-panel panel-padding mt-5">
        <SectionHeading
          eyebrow="Multi-location"
          title="Location permanenti e temporanee"
        />
        <p className="muted">
          Crea nuove sedi sotto lo stesso merchant fiscale, copia le
          configurazioni operative e gestisci disattivazione o archiviazione.
        </p>
        <div className="mt-5">
          <MultiLocationManager
            initialLocations={managedLocations}
            merchants={detail.merchants}
            organizationId={organizationId}
          />
        </div>
      </section>

      <section className="glass-panel panel-padding mt-5">
        <SectionHeading
          eyebrow="Accesso per location"
          title="Assegnazioni e permessi"
        />
        <p className="muted">
          Limita manager e operatori a una o più location. OWNER e ADMIN
          mantengono accesso globale al tenant.
        </p>
        <div className="mt-5">
          <LocationAccessManager
            members={detail.members}
            organizationId={organizationId}
          />
        </div>
      </section>

      <section className="glass-panel panel-padding mt-5">
        <SectionHeading
          action={
            <Link
              className="button-primary"
              href={`/platform-admin/organizations/${organizationId}/floor-plan`}
            >
              Apri editor SVG
            </Link>
          }
          eyebrow="Floor plan"
          title="Piantine versionate"
        />
        <p className="muted">
          Disegna pareti, forme, testi e tavoli, quindi pubblica snapshot
          immutabili per ciascuna location attiva.
        </p>
      </section>

      <section className="glass-panel panel-padding mt-5">
        <SectionHeading
          eyebrow="Layout operativo"
          title="Sale, tavoli e capienza"
        />
        <p className="muted">
          Modifica il numero dei tavoli e i posti disponibili per ciascuna
          location non archiviata.
        </p>
        <div className="mt-5">
          <PlatformTableLayoutEditor
            initialLayout={initialLayout}
            locations={layoutLocations}
            organizationId={organizationId}
          />
        </div>
      </section>

      <section className="glass-panel panel-padding mt-5">
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
      </section>
    </>
  );
}
