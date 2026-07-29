// PHASE_9_PUBLIC_BOOKING
import Link from 'next/link';
import { PublicHeader } from '@/components/public/public-header';
import { ReservationCard } from '@/components/public/reservation-card';
import { ReservationPaymentButton } from '@/components/public/reservation-payment-button';
import { fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { PublicReservation } from '@/lib/public-booking/types';

function tokenValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

export default async function BookingCancelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const reservationToken = tokenValue(query.reservationToken);

  if (!reservationToken) {
    return (
      <main className="booking-result-page">
        <PublicHeader />
        <section className="booking-result shell">
          <div className="public-empty-state">
            <strong>Token prenotazione mancante</strong>
            <Link href="/events">Torna agli eventi</Link>
          </div>
        </section>
      </main>
    );
  }

  const reservation = await fluxaServerFetch<PublicReservation>(
    `/public/reservations/${encodeURIComponent(reservationToken)}`,
  );

  return (
    <main className="booking-result-page">
      <PublicHeader />
      <section className="booking-result shell">
        <div className="booking-result-heading">
          <span className="cancel-orb">×</span>
          <p className="eyebrow">Pagamento interrotto</p>
          <h1>La prenotazione non è ancora confermata.</h1>
          <p>
            Il tavolo resta associato alla prenotazione fino alla scadenza
            indicata. Puoi riaprire Stripe senza inserire di nuovo i dati.
          </p>
        </div>
        <ReservationCard reservation={reservation} />
        <div className="booking-result-actions">
          {reservation.status === 'PENDING_PAYMENT' ? (
            <ReservationPaymentButton reservationToken={reservationToken} />
          ) : null}
          <Link
            className="button-secondary"
            href={`/events/${reservation.event.slug}`}
          >
            Torna all’evento
          </Link>
        </div>
      </section>
    </main>
  );
}
