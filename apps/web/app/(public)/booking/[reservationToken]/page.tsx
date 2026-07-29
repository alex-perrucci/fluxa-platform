// PHASE_9_PUBLIC_BOOKING
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicHeader } from '@/components/public/public-header';
import { ReservationCard } from '@/components/public/reservation-card';
import { ReservationPaymentButton } from '@/components/public/reservation-payment-button';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import type { PublicReservation } from '@/lib/public-booking/types';

async function loadReservation(token: string) {
  try {
    return await fluxaServerFetch<PublicReservation>(
      `/public/reservations/${encodeURIComponent(token)}`,
    );
  } catch (error) {
    if (error instanceof FluxaApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ reservationToken: string }>;
}) {
  const { reservationToken } = await params;
  const reservation = await loadReservation(reservationToken);

  return (
    <main className="booking-result-page">
      <PublicHeader />
      <section className="booking-result shell">
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
