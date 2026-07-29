// PHASE_10_RESERVATION_OPERATIONS
import Link from 'next/link';
import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import { Icon } from '@/components/control-center/icons';
import { ReservationLiveSync } from '@/components/merchant/reservation-live-sync';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import type {
  LocationSummary,
  ReservationListResponse,
} from '@/lib/control-center/types';

function euro(cents: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function ReservationsPage({
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
          description="Serve una sede attiva per visualizzare le prenotazioni."
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

  const reservations = await authenticatedFluxaFetch<ReservationListResponse>(
    `/control-center/reservations?${query}`,
  );

  return (
    <section className="glass-panel panel-padding">
      <div className="reservation-board-heading">
        <SectionHeading
          eyebrow="Guest operations"
          title={`${reservations.total} prenotazioni`}
        />
        <ReservationLiveSync locationId={locationId} />
      </div>

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
          placeholder="Nome, email, codice o evento…"
        />
        <select defaultValue={params.status ?? ''} name="status">
          <option value="">Tutti gli stati</option>
          <option value="PENDING_PAYMENT">Pagamento pendente</option>
          <option value="CONFIRMED">In arrivo</option>
          <option value="CHECKED_IN">Check-in effettuato</option>
          <option value="SEATED">Al tavolo</option>
          <option value="COMPLETED">Completate</option>
          <option value="NO_SHOW">No-show</option>
          <option value="REFUND_PENDING">Rimborso pendente</option>
          <option value="REFUNDED">Rimborsate</option>
          <option value="CANCELLED">Annullate</option>
        </select>
        <button className="button-secondary" type="submit">
          <Icon name="search" />
          Filtra
        </button>
      </form>

      {reservations.items.length ? (
        <div className="data-list reservation-live-list">
          {reservations.items.map((reservation) => (
            <Link
              className="data-row reservation-live-row"
              href={`/merchant/reservations/${reservation.id}`}
              key={reservation.id}
            >
              <div>
                <strong>{reservation.customerName}</strong>
                <small>
                  {reservation.confirmationCode} · {reservation.eventTitle}
                </small>
              </div>
              <div>
                <span>
                  {reservation.partySize} persone ·{' '}
                  {reservation.tableName ?? 'Auto-assign'}
                </span>
                <small>
                  {euro(reservation.amountCents)} ·{' '}
                  {date(reservation.createdAt)}
                </small>
              </div>
              <div className="reservation-row-status">
                <StatusBadge status={reservation.status} />
                <span aria-hidden="true">→</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          description="Le nuove prenotazioni compariranno automaticamente nel board operativo."
          title="Nessuna prenotazione"
        />
      )}
    </section>
  );
}
