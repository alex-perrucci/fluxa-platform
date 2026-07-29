// PHASE_9_PUBLIC_BOOKING
'use client';

import { useState } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import type { PublicCheckoutSession } from '@/lib/public-booking/types';

interface ErrorPayload {
  message?: string | string[];
}

function messageFromPayload(payload: ErrorPayload, fallback: string): string {
  if (Array.isArray(payload.message)) {
    return payload.message.join(' ');
  }

  return payload.message ?? fallback;
}

export function ReservationPaymentButton({
  reservationToken,
}: {
  reservationToken: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startPayment() {
    setPending(true);
    setError(null);

    try {
      const storageKey = `fluxa-checkout-${reservationToken}`;
      let idempotencyKey = sessionStorage.getItem(storageKey);

      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        sessionStorage.setItem(storageKey, idempotencyKey);
      }

      const response = await fetch(
        `/api/public/reservations/${reservationToken}/checkout-sessions`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idempotencyKey }),
        },
      );
      const payload = (await response.json()) as
        PublicCheckoutSession | ErrorPayload;

      if (!response.ok || !('checkoutUrl' in payload)) {
        setError(
          messageFromPayload(
            payload as ErrorPayload,
            'Avvio del pagamento non riuscito.',
          ),
        );
        return;
      }

      window.location.assign(payload.checkoutUrl);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Avvio del pagamento non riuscito.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Pagamento non avviato"
      />
      <button
        className="button-primary"
        disabled={pending}
        onClick={startPayment}
        type="button"
      >
        {pending ? 'Apertura Stripe…' : 'Continua con Stripe'}
      </button>
    </>
  );
}
