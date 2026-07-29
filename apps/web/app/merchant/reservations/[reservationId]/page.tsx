// PHASE_10_RESERVATION_OPERATIONS
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReservationActions } from '@/components/merchant/reservation-actions';
import { ReservationLiveSync } from '@/components/merchant/reservation-live-sync';
import { StatusBadge } from '@/components/control-center/status-badge';
import { FluxaApiError } from '@/lib/api/fluxa-api';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { ReservationDetail } from '@/lib/control-center/types';

function euro(cents: number, currency = 'EUR') {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function date(value: string | null) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default async function ReservationDetailPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;
  let reservation: ReservationDetail;

  try {
    reservation = await authenticatedFluxaFetch<ReservationDetail>(
      `/control-center/reservations/${reservationId}`,
    );
  } catch (error) {
    if (error instanceof FluxaApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  return (
    <div className="reservation-detail-layout">
      <div className="reservation-detail-topbar">
        <Link className="back-link" href="/merchant/reservations">
          ← Torna alle prenotazioni
        </Link>
        <ReservationLiveSync locationId={reservation.locationId} />
      </div>

      <section className="reservation-detail-hero glass-panel">
        <div className="reservation-detail-identity">
          <p className="eyebrow">Dettaglio prenotazione</p>
          <h1>{reservation.customerName}</h1>
          <p className="reservation-detail-summary">
            {reservation.partySize}{' '}
            {reservation.partySize === 1 ? 'persona' : 'persone'} ·{' '}
            {reservation.eventTitle}
          </p>
          <div className="reservation-code-block">
            <span>Codice prenotazione</span>
            <code>{reservation.confirmationCode}</code>
          </div>
        </div>
        <StatusBadge status={reservation.status} />
      </section>

      <section className="reservation-detail-grid">
        <article className="glass-panel panel-padding">
          <p className="eyebrow">Ospite</p>
          <dl className="reservation-facts">
            <div>
              <dt>Nome</dt>
              <dd>{reservation.customerName}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{reservation.customerEmail}</dd>
            </div>
            <div>
              <dt>Telefono</dt>
              <dd>{reservation.customerPhone ?? 'Non indicato'}</dd>
            </div>
            <div>
              <dt>Note</dt>
              <dd>{reservation.customerNote ?? 'Nessuna nota'}</dd>
            </div>
          </dl>
        </article>

        <article className="glass-panel panel-padding">
          <p className="eyebrow">Evento e tavolo</p>
          <dl className="reservation-facts">
            <div>
              <dt>Evento</dt>
              <dd>{reservation.eventTitle}</dd>
            </div>
            <div>
              <dt>Inizio</dt>
              <dd>{date(reservation.eventStartsAt ?? null)}</dd>
            </div>
            <div>
              <dt>Sede</dt>
              <dd>{reservation.locationName}</dd>
            </div>
            <div>
              <dt>Tavolo</dt>
              <dd>
                {reservation.tableName ?? 'Non assegnato'}
                {reservation.areaName ? ` · ${reservation.areaName}` : ''}
              </dd>
            </div>
          </dl>
        </article>

        <article className="glass-panel panel-padding">
          <p className="eyebrow">Sessione POS</p>
          <dl className="reservation-facts">
            <div>
              <dt>Stato sessione</dt>
              <dd>{reservation.tableSessionStatus ?? 'Non aperta'}</dd>
            </div>
            <div>
              <dt>Aperta</dt>
              <dd>{date(reservation.tableSessionOpenedAt)}</dd>
            </div>
            <div>
              <dt>Ordini collegati</dt>
              <dd>{reservation.orderCount}</dd>
            </div>
            <div>
              <dt>Totale ordini</dt>
              <dd>{euro(reservation.orderTotalCents, reservation.currency)}</dd>
            </div>
          </dl>
        </article>

        <article className="glass-panel panel-padding">
          <p className="eyebrow">Deposito</p>
          <dl className="reservation-facts">
            <div>
              <dt>Pagato dal cliente</dt>
              <dd>{euro(reservation.amountCents, reservation.currency)}</dd>
            </div>
            <div>
              <dt>Fee piattaforma</dt>
              <dd>
                {euro(reservation.platformFeeCents ?? 0, reservation.currency)}
              </dd>
            </div>
            <div>
              <dt>Fee provider</dt>
              <dd>
                {euro(reservation.providerFeeCents, reservation.currency)}
              </dd>
            </div>
            <div>
              <dt>Netto merchant</dt>
              <dd>
                {euro(reservation.merchantNetCents ?? 0, reservation.currency)}
              </dd>
            </div>
          </dl>
        </article>
      </section>

      <ReservationActions reservation={reservation} />

      <section className="glass-panel panel-padding">
        <p className="eyebrow">Timeline</p>
        <div className="reservation-timeline">
          {reservation.history.map((item, index) => (
            <div
              className="reservation-timeline-row"
              key={`${item.createdAt}-${index}`}
            >
              <span />
              <div>
                <strong>
                  {item.fromStatus ?? 'CREATED'} → {item.toStatus}
                </strong>
                <small>
                  {date(item.createdAt)} · {item.reason ?? 'Aggiornamento'}
                </small>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
