// PHASE_9_PUBLIC_BOOKING
'use client';

import { useEffect, useState } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import { ReservationCard } from '@/components/public/reservation-card';
import type { PublicReservation } from '@/lib/public-booking/types';

export function ReservationStatusWatcher({
  initialReservation,
  reservationToken,
}: {
  initialReservation: PublicReservation;
  reservationToken: string;
}) {
  const [reservation, setReservation] =
    useState<PublicReservation>(initialReservation);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (reservation.status !== 'PENDING_PAYMENT') {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/public/reservations/${reservationToken}`,
          { cache: 'no-store' },
        );

        if (!response.ok) {
          return;
        }

        const nextReservation = (await response.json()) as PublicReservation;
        setReservation(nextReservation);
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Aggiornamento dello stato non riuscito.',
        );
      }
    }, 2000);

    return () => window.clearInterval(interval);
  }, [reservation.status, reservationToken]);

  return (
    <>
      <ControlCenterNotification
        message={
          reservation.status === 'CONFIRMED'
            ? 'Pagamento ricevuto. La prenotazione è confermata.'
            : error
        }
        onDismiss={() => setError(null)}
        title={
          reservation.status === 'CONFIRMED'
            ? 'Prenotazione confermata'
            : 'Aggiornamento non riuscito'
        }
        tone={reservation.status === 'CONFIRMED' ? 'success' : 'error'}
      />
      <ReservationCard reservation={reservation} />
      {reservation.status === 'PENDING_PAYMENT' ? (
        <p className="payment-sync-note">
          Pagamento ricevuto da Stripe. Stiamo attendendo la conferma firmata
          del webhook…
        </p>
      ) : null}
    </>
  );
}
