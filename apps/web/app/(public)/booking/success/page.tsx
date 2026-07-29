// PHASE_9_PUBLIC_BOOKING
import Link from 'next/link';
import { PublicHeader } from '@/components/public/public-header';
import { ReservationStatusWatcher } from '@/components/public/reservation-status-watcher';
import { fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { PublicReservation } from '@/lib/public-booking/types';

function tokenValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

export default async function BookingSuccessPage({
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
          <span className="success-orb">✓</span>
          <p className="eyebrow">Rientro da Stripe</p>
          <h1>Pagamento ricevuto.</h1>
          <p>
            Fluxa sta sincronizzando la conferma firmata del pagamento con la
            prenotazione.
          </p>
        </div>
        <ReservationStatusWatcher
          initialReservation={reservation}
          reservationToken={reservationToken}
        />
      </section>
    </main>
  );
}
