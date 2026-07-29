// PHASE_9_PUBLIC_BOOKING
'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ControlCenterNotification } from '@/components/control-center/notification';
import { ReservationPaymentButton } from '@/components/public/reservation-payment-button';
import { formatPublicMoney } from '@/lib/public-booking/format';
import type {
  PublicAvailability,
  PublicEventDetail,
  PublicHold,
  PublicReservation,
} from '@/lib/public-booking/types';

interface ErrorPayload {
  message?: string | string[];
}

function errorMessage(payload: ErrorPayload, fallback: string): string {
  if (Array.isArray(payload.message)) {
    return payload.message.join(' ');
  }

  return payload.message ?? fallback;
}

export function BookingWidget({ event }: { event: PublicEventDetail }) {
  const router = useRouter();
  const [partySize, setPartySize] = useState(event.bookingRules.minPartySize);
  const [hold, setHold] = useState<PublicHold | null>(null);
  const [reservation, setReservation] = useState<PublicReservation | null>(
    null,
  );
  const [reservationToken, setReservationToken] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hold || hold.status !== 'ACTIVE') {
      return;
    }

    const timer = window.setInterval(() => {
      setClock(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [hold]);

  const secondsLeft = useMemo(() => {
    if (!hold) return 0;

    return Math.max(
      0,
      Math.ceil((new Date(hold.expiresAt).getTime() - clock) / 1000),
    );
  }, [clock, hold]);

  const holdExpired = Boolean(hold && secondsLeft <= 0);

  async function reserveTable() {
    setPending(true);
    setError(null);

    try {
      const availabilityResponse = await fetch(
        `/api/public/events/${event.slug}/availability?partySize=${partySize}`,
        { cache: 'no-store' },
      );
      const availabilityPayload = (await availabilityResponse.json()) as
        PublicAvailability | ErrorPayload;

      if (!availabilityResponse.ok || !('available' in availabilityPayload)) {
        setError(
          errorMessage(
            availabilityPayload as ErrorPayload,
            'Verifica disponibilità non riuscita.',
          ),
        );
        return;
      }

      if (!availabilityPayload.available) {
        setError(
          'Non c’è un tavolo disponibile per il numero di persone indicato.',
        );
        return;
      }

      const holdToken = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();
      const holdResponse = await fetch(
        `/api/public/events/${event.slug}/holds`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            partySize,
            holdToken,
            idempotencyKey,
          }),
        },
      );
      const holdPayload = (await holdResponse.json()) as
        PublicHold | ErrorPayload;

      if (!holdResponse.ok || !('id' in holdPayload)) {
        setError(
          errorMessage(
            holdPayload as ErrorPayload,
            'Blocco temporaneo del tavolo non riuscito.',
          ),
        );
        return;
      }

      setClock(Date.now());
      setHold({ ...holdPayload, holdToken });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Prenotazione non riuscita.',
      );
    } finally {
      setPending(false);
    }
  }

  async function cancelHold() {
    if (!hold?.holdToken) return;

    setPending(true);
    setError(null);

    try {
      await fetch(`/api/public/reservation-holds/${hold.holdToken}`, {
        method: 'DELETE',
      });
      setHold(null);
    } finally {
      setPending(false);
    }
  }

  async function createReservation(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();

    if (!hold?.holdToken || holdExpired) {
      setError('Il blocco del tavolo è scaduto. Verifica di nuovo.');
      return;
    }

    const form = new FormData(submitEvent.currentTarget);
    const customerName = String(form.get('customerName') ?? '').trim();
    const customerEmail = String(form.get('customerEmail') ?? '')
      .trim()
      .toLowerCase();
    const customerPhone = String(form.get('customerPhone') ?? '').trim();
    const customerNote = String(form.get('customerNote') ?? '').trim();

    if (customerName.length < 2) {
      setError('Inserisci nome e cognome.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      setError('Inserisci un indirizzo email valido.');
      return;
    }

    if (event.bookingRules.requirePhone && customerPhone.length < 6) {
      setError('Inserisci un numero di telefono valido.');
      return;
    }

    setPending(true);
    setError(null);

    try {
      const nextReservationToken = crypto.randomUUID();
      const response = await fetch(
        `/api/public/reservation-holds/${hold.holdToken}/reservations`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            reservationToken: nextReservationToken,
            customerName,
            customerEmail,
            customerPhone: customerPhone || undefined,
            customerNote: customerNote || undefined,
          }),
        },
      );
      const payload = (await response.json()) as
        PublicReservation | ErrorPayload;

      if (!response.ok || !('confirmationCode' in payload)) {
        setError(
          errorMessage(
            payload as ErrorPayload,
            'Creazione della prenotazione non riuscita.',
          ),
        );
        return;
      }

      setReservation(payload);
      setReservationToken(nextReservationToken);

      if (!payload.payment.required) {
        router.push(`/booking/${nextReservationToken}`);
        router.refresh();
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Creazione della prenotazione non riuscita.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="booking-widget">
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Prenotazione non completata"
      />

      <div className="booking-widget-heading">
        <p className="eyebrow">Prenota il tuo tavolo</p>
        <h2>
          {event.bookingAmountCents > 0
            ? `${formatPublicMoney(
                event.bookingAmountCents,
                event.currency,
              )} di deposito`
            : 'Nessun deposito richiesto'}
        </h2>
        <p>
          Il tavolo viene assegnato automaticamente in base al numero di
          persone. Nessun overbooking, nessuna attesa.
        </p>
      </div>

      {!hold ? (
        <div className="booking-step">
          <label className="field">
            <span>Quante persone?</span>
            <input
              max={event.bookingRules.maxPartySize}
              min={event.bookingRules.minPartySize}
              onChange={(changeEvent) =>
                setPartySize(
                  Math.min(
                    event.bookingRules.maxPartySize,
                    Math.max(
                      event.bookingRules.minPartySize,
                      Number(changeEvent.target.value) ||
                        event.bookingRules.minPartySize,
                    ),
                  ),
                )
              }
              type="number"
              value={partySize}
            />
          </label>
          <button
            className="button-primary button-wide"
            disabled={pending || event.bookingState !== 'OPEN'}
            onClick={reserveTable}
            type="button"
          >
            {pending ? 'Ricerca tavolo…' : 'Verifica e blocca il tavolo'}
          </button>
          <small>
            Disponibilità residua dichiarata: {event.remainingCapacity} posti.
          </small>
        </div>
      ) : null}

      {hold && !reservation ? (
        <form
          className="booking-step customer-step"
          noValidate
          onSubmit={createReservation}
        >
          <div className="hold-banner">
            <div>
              <span>Tavolo riservato temporaneamente</span>
              <strong>
                {hold.table?.name ?? 'Assegnazione automatica'} ·{' '}
                {hold.partySize} persone
              </strong>
            </div>
            <div className={holdExpired ? 'hold-clock expired' : 'hold-clock'}>
              {holdExpired
                ? 'Scaduto'
                : `${Math.floor(secondsLeft / 60)
                    .toString()
                    .padStart(2, '0')}:${(secondsLeft % 60)
                    .toString()
                    .padStart(2, '0')}`}
            </div>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Nome e cognome</span>
              <input autoComplete="name" name="customerName" />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                autoComplete="email"
                inputMode="email"
                name="customerEmail"
                type="email"
              />
            </label>
            <label className="field">
              <span>
                Telefono
                {event.bookingRules.requirePhone ? ' · obbligatorio' : ''}
              </span>
              <input autoComplete="tel" inputMode="tel" name="customerPhone" />
            </label>
            <label className="field field-span">
              <span>Note per il locale</span>
              <textarea
                maxLength={1000}
                name="customerNote"
                placeholder="Allergie, accessibilità o richieste utili"
                rows={3}
              />
            </label>
          </div>

          <div className="booking-actions">
            <button
              className="button-secondary"
              disabled={pending}
              onClick={cancelHold}
              type="button"
            >
              Cambia tavolo
            </button>
            <button
              className="button-primary"
              disabled={pending || holdExpired}
              type="submit"
            >
              {pending ? 'Creazione…' : 'Conferma i dati'}
            </button>
          </div>
        </form>
      ) : null}

      {reservation && reservationToken && reservation.payment.required ? (
        <div className="booking-step payment-step">
          <span className="success-orb">✓</span>
          <h3>Dati salvati. Completa il deposito.</h3>
          <p>
            La prenotazione resta in attesa finché Stripe non conferma il
            pagamento.
          </p>
          <ReservationPaymentButton reservationToken={reservationToken} />
        </div>
      ) : null}
    </section>
  );
}
