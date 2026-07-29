// PHASE_8_TRUE_CONTROL_CENTER
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { EventActions } from '@/components/merchant/event-actions';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { EventDetail } from '@/lib/control-center/types';

function date(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(value));
}

function euro(cents: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const event = await authenticatedFluxaFetch<EventDetail>(
    `/events/${eventId}`,
  );
  const cover = event.coverImageUrl
    ? `url("${event.coverImageUrl.replaceAll('"', '%22')}")`
    : 'none';

  return (
    <>
      <div
        className="detail-hero"
        style={{ '--detail-cover': cover } as CSSProperties}
      >
        <div className="detail-hero-content">
          <StatusBadge status={event.status} />
          <h2>{event.title}</h2>
          <p>{event.description}</p>
          <div className="page-actions">
            {event.status === 'DRAFT' ? (
              <Link
                className="button-secondary"
                href={`/merchant/events/${event.id}/edit`}
              >
                Modifica
              </Link>
            ) : null}
            <EventActions eventId={event.id} status={event.status} />
          </div>
        </div>
      </div>

      <div className="detail-meta-grid">
        <article>
          <span>Data evento</span>
          <strong>{date(event.startsAt)}</strong>
        </article>
        <article>
          <span>Deposito</span>
          <strong>{euro(event.bookingAmountCents)}</strong>
        </article>
        <article>
          <span>Capienza</span>
          <strong>{event.capacity} ospiti</strong>
        </article>
        <article>
          <span>Inventario</span>
          <strong>{event.tables.length} tavoli</strong>
        </article>
      </div>

      <div className="dashboard-grid">
        <section className="glass-panel panel-padding">
          <p className="eyebrow">Table inventory</p>
          <h2>Tavoli abilitati</h2>
          <div className="table-selector mt-5">
            {event.tables.map((table) => (
              <div className="selected" key={table.diningTableId}>
                <span>{table.tableCode}</span>
                <strong>{table.tableName}</strong>
                <small>
                  {table.tableCapacity} posti · {table.areaName}
                </small>
              </div>
            ))}
          </div>
        </section>

        <aside className="glass-panel panel-padding">
          <p className="eyebrow">Booking rules</p>
          <h2>Regole attive</h2>
          {event.bookingRules ? (
            <div className="data-list mt-5">
              <div className="data-row single-column">
                <div>
                  <strong>Party size</strong>
                  <small>
                    {event.bookingRules.minPartySize}–
                    {event.bookingRules.maxPartySize} persone
                  </small>
                </div>
              </div>
              <div className="data-row single-column">
                <div>
                  <strong>Hold</strong>
                  <small>{event.bookingRules.holdMinutes} minuti</small>
                </div>
              </div>
              <div className="data-row single-column">
                <div>
                  <strong>Telefono</strong>
                  <small>
                    {event.bookingRules.requirePhone
                      ? 'Obbligatorio'
                      : 'Facoltativo'}
                  </small>
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}
