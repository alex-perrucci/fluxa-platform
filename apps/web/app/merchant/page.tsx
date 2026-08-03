// PHASE_8_TRUE_CONTROL_CENTER
import { cookies } from 'next/headers';
import Link from 'next/link';
import {
  EmptyState,
  MetricCard,
  SectionHeading,
} from '@/components/control-center/shell';
import { Icon } from '@/components/control-center/icons';
import { StatusBadge } from '@/components/control-center/status-badge';
import { DashboardLocationSelector } from '@/components/merchant/dashboard-location-selector';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import type { LocationSummary } from '@/lib/control-center/types';
import type { MerchantDashboardOverview } from '@/lib/control-center/merchant-dashboard-types';

function euro(cents: string | number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(cents) / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function MerchantDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const session = await requireMerchantSession();
  const params = await searchParams;
  const organizationId = session.session.organizationId;
  const cookieName = `fluxa-dashboard-location-${organizationId}`;
  const cookieStore = await cookies();
  const savedSelection = cookieStore.get(cookieName)?.value;
  const locations =
    await authenticatedFluxaFetch<LocationSummary[]>('/locations');
  const accessibleIds = new Set(locations.map((location) => location.id));

  const requestedSelection = params.locationId ?? savedSelection ?? 'all';
  const selected = accessibleIds.has(requestedSelection)
    ? requestedSelection
    : 'all';
  const overviewPath =
    selected === 'all'
      ? '/control-center/merchant-overview'
      : `/control-center/merchant-overview?locationId=${selected}`;
  const overview =
    await authenticatedFluxaFetch<MerchantDashboardOverview>(overviewPath);
  const aggregate = overview.scope.kind === 'ALL';

  if (overview.scope.locations.length === 0) {
    return (
      <div className="glass-panel">
        <EmptyState
          description="Assegna almeno una sede attiva al tuo account per aprire il Control Center."
          title="Nessuna sede operativa"
        />
      </div>
    );
  }

  return (
    <>
      <section className="glass-panel panel-padding dashboard-scope-panel">
        <div>
          <span className="eyebrow">Perimetro operativo</span>
          <h2>
            {aggregate
              ? 'Tutte le sedi accessibili'
              : overview.scope.location?.name}
          </h2>
          <p>
            {aggregate
              ? 'Metriche aggregate esclusivamente sulle sedi assegnate al tuo account.'
              : `${overview.scope.location?.city} · ${overview.scope.location?.timezone}`}
          </p>
        </div>
        <DashboardLocationSelector
          cookieName={cookieName}
          locations={overview.scope.locations}
          selected={selected}
        />
      </section>

      <div className="metrics-grid">
        <MetricCard
          accent="blue"
          hint={`${overview.metrics.upcomingEvents} in programma`}
          icon="calendar"
          label="Eventi"
          value={overview.metrics.events}
        />
        <MetricCard
          accent="violet"
          hint={`${overview.metrics.publishedEvents} pubblicati`}
          icon="ticket"
          label="Prenotazioni"
          value={overview.metrics.reservations}
        />
        <MetricCard
          accent="cyan"
          hint="Confermati e serviti"
          icon="users"
          label="Ospiti"
          value={overview.metrics.confirmedGuests}
        />
        <MetricCard
          accent={overview.metrics.refundPending > 0 ? 'rose' : 'blue'}
          hint={`${overview.metrics.refundPending} rimborsi da gestire`}
          icon="money"
          label="Depositi prenotazioni"
          value={euro(overview.metrics.bookingDepositsCents)}
        />
        <MetricCard
          accent="blue"
          hint="Ordini POS pagati"
          icon="money"
          label="Vendite POS"
          value={overview.metrics.posOrders}
        />
        <MetricCard
          accent="cyan"
          hint="Pagamenti POS acquisiti"
          icon="money"
          label="Incasso POS"
          value={euro(overview.metrics.posSalesCents)}
        />
      </div>

      <div className="dashboard-grid">
        <section className="glass-panel panel-padding">
          <SectionHeading
            action={
              <Link className="button-secondary" href="/merchant/events">
                Tutti gli eventi
              </Link>
            }
            eyebrow="Live portfolio"
            title="Eventi recenti"
          />

          {overview.recentEvents.length ? (
            <div className="data-list">
              {overview.recentEvents.map((event) => (
                <Link
                  className="data-row"
                  href={`/merchant/events/${event.id}`}
                  key={event.id}
                >
                  <div className="event-title-cell">
                    <div className="event-thumb">
                      {event.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt="" src={event.coverImageUrl} />
                      ) : null}
                    </div>
                    <div>
                      <strong>{event.title}</strong>
                      <small>
                        {aggregate ? `${event.locationName} · ` : ''}
                        {date(event.startsAt)}
                      </small>
                    </div>
                  </div>
                  <div>
                    <span>{event.capacity} posti</span>
                    <small>{euro(event.bookingAmountCents)}</small>
                  </div>
                  <StatusBadge status={event.status} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              action={
                <Link className="button-primary" href="/merchant/events/new">
                  Crea il primo evento
                </Link>
              }
              description="Configura tavoli, regole e deposito in un unico flusso."
              title="Il calendario è ancora vuoto"
            />
          )}
        </section>

        <aside className="glass-panel panel-padding">
          <SectionHeading eyebrow="Next move" title="Azioni rapide" />
          <div className="quick-action-grid">
            <Link className="quick-action" href="/merchant/events/new">
              <div>
                <Icon name="plus" />
              </div>
              <div>
                <strong>Nuovo evento</strong>
                <span>Apri l’Event Studio</span>
              </div>
            </Link>
            <Link className="quick-action" href="/merchant/reservations">
              <div>
                <Icon name="ticket" />
              </div>
              <div>
                <strong>Prenotazioni</strong>
                <span>Clienti, tavoli e stati</span>
              </div>
            </Link>
          </div>

          <SectionHeading eyebrow="Latest" title="Ultime prenotazioni" />
          <div className="data-list">
            {overview.recentReservations.slice(0, 5).map((reservation) => (
              <div className="data-row" key={reservation.id}>
                <div>
                  <strong>{reservation.customerName}</strong>
                  <small>
                    {aggregate ? `${reservation.locationName} · ` : ''}
                    {reservation.eventTitle}
                  </small>
                </div>
                <div>
                  <span>{reservation.partySize} persone</span>
                  <small>{reservation.tableName ?? 'Auto-assign'}</small>
                </div>
                <StatusBadge status={reservation.status} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
