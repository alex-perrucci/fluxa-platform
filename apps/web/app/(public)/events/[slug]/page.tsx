// PHASE_9_PUBLIC_BOOKING
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingWidget } from '@/components/public/booking-widget';
import { PublicHeader } from '@/components/public/public-header';
import { FluxaApiError, fluxaServerFetch } from '@/lib/api/fluxa-api';
import {
  bookingStateLabel,
  formatPublicDate,
  formatPublicMoney,
} from '@/lib/public-booking/format';
import type { PublicEventDetail } from '@/lib/public-booking/types';

async function loadEvent(slug: string) {
  try {
    return await fluxaServerFetch<PublicEventDetail>(
      `/public/events/${encodeURIComponent(slug)}`,
    );
  } catch (error) {
    if (error instanceof FluxaApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await loadEvent(slug);

  return {
    title: event.title,
    description: event.description,
  };
}

export default async function PublicEventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await loadEvent(slug);
  const cover = event.coverImageUrl
    ? `url("${event.coverImageUrl.replaceAll('"', '%22')}")`
    : 'none';

  return (
    <main className="public-event-detail-page">
      <PublicHeader />

      <section
        className="public-event-hero"
        style={{ '--public-cover': cover } as CSSProperties}
      >
        <div className="public-event-hero-overlay" />
        <div className="public-event-hero-content shell">
          <Link className="back-link" href="/events">
            ← Tutti gli eventi
          </Link>
          <span className={`booking-state booking-state-${event.bookingState}`}>
            {bookingStateLabel(event.bookingState)}
          </span>
          <p className="eyebrow">{event.organizer.name}</p>
          <h1>{event.title}</h1>
          <p>{event.description}</p>
        </div>
      </section>

      <section className="public-event-body shell">
        <div className="public-event-information">
          <div className="public-event-meta-grid">
            <article>
              <span>Quando</span>
              <strong>{formatPublicDate(event.startsAt)}</strong>
            </article>
            <article>
              <span>Dove</span>
              <strong>
                {event.location.name}, {event.location.city}
              </strong>
            </article>
            <article>
              <span>Deposito</span>
              <strong>
                {event.bookingAmountCents > 0
                  ? formatPublicMoney(event.bookingAmountCents, event.currency)
                  : 'Gratuito'}
              </strong>
            </article>
            <article>
              <span>Disponibilità</span>
              <strong>{event.remainingCapacity} posti residui</strong>
            </article>
          </div>

          <div className="public-copy-panel">
            <p className="eyebrow">Informazioni</p>
            <h2>Una serata, un unico flusso di prenotazione.</h2>
            <p>{event.description}</p>
            <div className="public-facts">
              <span>
                Gruppi da {event.bookingRules.minPartySize} a{' '}
                {event.bookingRules.maxPartySize} persone
              </span>
              <span>
                Tavolo bloccato per {event.bookingRules.holdMinutes} minuti
              </span>
              <span>{event.inventory.tableCount} tavoli nel sistema Fluxa</span>
            </div>
          </div>

          {event.cancellationPolicy ? (
            <div className="public-copy-panel">
              <p className="eyebrow">Cancellazione</p>
              <p>{event.cancellationPolicy}</p>
            </div>
          ) : null}
        </div>

        <aside>
          <BookingWidget event={event} />
        </aside>
      </section>
    </main>
  );
}
