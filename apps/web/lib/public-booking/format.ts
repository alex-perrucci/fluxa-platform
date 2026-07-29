// PHASE_9_PUBLIC_BOOKING
import type { PublicBookingState, PublicReservationStatus } from './types';

export function formatPublicDate(value: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatPublicMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

export function bookingStateLabel(state: PublicBookingState): string {
  const labels: Record<PublicBookingState, string> = {
    NOT_OPEN: 'Prenotazioni non ancora aperte',
    OPEN: 'Prenotazioni aperte',
    CLOSED: 'Prenotazioni chiuse',
    SOLD_OUT: 'Sold out',
    ENDED: 'Evento concluso',
  };

  return labels[state];
}

export function reservationStatusLabel(
  status: PublicReservationStatus,
): string {
  const labels: Record<PublicReservationStatus, string> = {
    PENDING_PAYMENT: 'In attesa di pagamento',
    CONFIRMED: 'Confermata',
    CHECKED_IN: 'Check-in effettuato',
    SEATED: 'Al tavolo',
    COMPLETED: 'Completata',
    CANCELLED: 'Annullata',
    EXPIRED: 'Scaduta',
    NO_SHOW: 'No-show',
    REFUND_PENDING: 'Rimborso in lavorazione',
    REFUNDED: 'Rimborsata',
  };

  return labels[status];
}
