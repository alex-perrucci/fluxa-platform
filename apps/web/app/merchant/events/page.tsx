// PHASE_8_TRUE_CONTROL_CENTER
import Link from 'next/link';
import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import { Icon } from '@/components/control-center/icons';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import type {
  EventListResponse,
  LocationSummary,
} from '@/lib/control-center/types';

function date(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function euro(cents: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    locationId?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const session = await requireMerchantSession();
  const params = await searchParams;
  const locations =
    await authenticatedFluxaFetch<LocationSummary[]>('/locations');
  const membership = session.availableOrganizations.find(
    (organization) =>
      organization.organizationId === session.session.organizationId,
  );
  const locationId =
    params.locationId ?? membership?.defaultLocationId ?? locations[0]?.id;

  if (!locationId) {
    return (
      <div className="glass-panel">
        <EmptyState
          description="Crea o assegna una sede prima di configurare gli eventi."
          title="Nessuna sede disponibile"
        />
      </div>
    );
  }

  const query = new URLSearchParams({
    locationId,
    pageSize: '100',
  });

  if (params.status) query.set('status', params.status);
  if (params.q) query.set('q', params.q);

  const events = await authenticatedFluxaFetch<EventListResponse>(
    `/events?${query}`,
  );

  return (
    <section className="glass-panel panel-padding">
      <SectionHeading
        action={
          <Link className="button-primary" href="/merchant/events/new">
            <Icon name="plus" />
            Nuovo evento
          </Link>
        }
        eyebrow="Event portfolio"
        title={`${events.total} eventi`}
      />

      <form className="filter-bar">
        <select defaultValue={locationId} name="locationId">
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <input
          defaultValue={params.q}
          name="q"
          placeholder="Cerca titolo o slug…"
        />
        <select defaultValue={params.status ?? ''} name="status">
          <option value="">Tutti gli stati</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Pubblicati</option>
          <option value="SOLD_OUT">Sold out</option>
          <option value="CANCELLED">Annullati</option>
          <option value="COMPLETED">Completati</option>
          <option value="ARCHIVED">Archiviati</option>
        </select>
        <button className="button-secondary" type="submit">
          <Icon name="search" />
          Filtra
        </button>
      </form>

      {events.items.length ? (
        <div className="data-list">
          {events.items.map((event) => (
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
                    {event.slug} · {date(event.startsAt)}
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
              Crea un evento
            </Link>
          }
          description="Nessun evento corrisponde ai filtri selezionati."
          title="Nessun risultato"
        />
      )}
    </section>
  );
}
