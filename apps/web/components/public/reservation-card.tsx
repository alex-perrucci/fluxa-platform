// PHASE_9_PUBLIC_BOOKING
import {
  formatPublicDate,
  formatPublicMoney,
  reservationStatusLabel,
} from '@/lib/public-booking/format';
import type { PublicReservation } from '@/lib/public-booking/types';

export function ReservationCard({
  reservation,
}: {
  reservation: PublicReservation;
}) {
  return (
    <article className="reservation-ticket">
      <div className="reservation-ticket-top">
        <div>
          <p className="eyebrow">Codice prenotazione</p>
          <h1>{reservation.confirmationCode}</h1>
        </div>
        <span
          className={`reservation-status reservation-status-${reservation.status}`}
        >
          {reservationStatusLabel(reservation.status)}
        </span>
      </div>

      <div className="reservation-ticket-event">
        <span>Evento</span>
        <strong>{reservation.event.title}</strong>
        <small>{formatPublicDate(reservation.event.startsAt)}</small>
      </div>

      <div className="reservation-ticket-grid">
        <div>
          <span>Ospite</span>
          <strong>{reservation.customer.name}</strong>
          <small>{reservation.customer.email}</small>
        </div>
        <div>
          <span>Coperti</span>
          <strong>{reservation.partySize}</strong>
          <small>
            {reservation.table?.name ?? 'Tavolo assegnato automaticamente'}
          </small>
        </div>
        <div>
          <span>Deposito</span>
          <strong>
            {formatPublicMoney(
              reservation.payment.amountCents,
              reservation.payment.currency,
            )}
          </strong>
          <small>
            {reservation.payment.required
              ? reservationStatusLabel(reservation.status)
              : 'Nessun pagamento richiesto'}
          </small>
        </div>
      </div>
    </article>
  );
}
