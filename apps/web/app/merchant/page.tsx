// PHASE_8_TRUE_CONTROL_CENTER
import Link from 'next/link';
import {
  EmptyState,
  MetricCard,
  SectionHeading,
} from '@/components/control-center/shell';
import { Icon } from '@/components/control-center/icons';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import type { MerchantOverview } from '@/lib/control-center/types';

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

export default async function MerchantDashboardPage() {
  const session = await requireMerchantSession();
  const membership = session.availableOrganizations.find(
    (organization) =>
      organization.organizationId === session.session.organizationId,
  );
  const locationId = membership?.defaultLocationId;

  if (!locationId) {
    return (
      <div className="glass-panel">
        <EmptyState
          description="Assegna una sede predefinita al tuo account per aprire il Control Center."
          title="Nessuna sede operativa"
        />
      </div>
    );
  }

  const overview = await authenticatedFluxaFetch<MerchantOverview>(
    `/control-center/merchant-overview?locationId=${locationId}`,
  );

  return (
    <>
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
          label="Volume incassato"
          value={euro(overview.metrics.paidVolumeCents)}
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
                      <small>{date(event.startsAt)}</small>
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
                  <small>{reservation.eventTitle}</small>
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
