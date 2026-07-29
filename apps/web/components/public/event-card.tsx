// PHASE_9_PUBLIC_BOOKING
import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  bookingStateLabel,
  formatPublicDate,
  formatPublicMoney,
} from '@/lib/public-booking/format';
import type { PublicEventSummary } from '@/lib/public-booking/types';

export function EventCard({ event }: { event: PublicEventSummary }) {
  const cover = event.coverImageUrl
    ? `url("${event.coverImageUrl.replaceAll('"', '%22')}")`
    : 'none';

  return (
    <article className="public-event-card">
      <Link
        aria-label={`Apri ${event.title}`}
        className="public-event-card-cover"
        href={`/events/${event.slug}`}
        style={{ '--event-cover': cover } as CSSProperties}
      >
        <span className={`booking-state booking-state-${event.bookingState}`}>
          {bookingStateLabel(event.bookingState)}
        </span>
      </Link>
      <div className="public-event-card-body">
        <div>
          <p className="eyebrow">{event.organizer.name}</p>
          <h2>
            <Link href={`/events/${event.slug}`}>{event.title}</Link>
          </h2>
          <p className="public-event-location">
            {event.location.name} · {event.location.city}
            {event.location.province ? ` (${event.location.province})` : ''}
          </p>
        </div>
        <div className="public-event-card-meta">
          <span>{formatPublicDate(event.startsAt)}</span>
          <strong>
            {event.bookingAmountCents > 0
              ? `${formatPublicMoney(
                  event.bookingAmountCents,
                  event.currency,
                )} di deposito`
              : 'Prenotazione gratuita'}
          </strong>
        </div>
        <div className="public-event-card-footer">
          <span>{event.remainingCapacity} posti residui</span>
          <Link className="event-link" href={`/events/${event.slug}`}>
            Scopri e prenota →
          </Link>
        </div>
      </div>
    </article>
  );
}
