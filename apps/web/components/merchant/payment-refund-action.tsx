'use client';

import { useState } from 'react';

interface RefundQuote {
  paymentId: string;
  method: string;
  provider: string;
  currency: string;
  capturedCents: number;
  refundedCents: number;
  pendingRefundCents: number;
  refundableCents: number;
  fullyRefunded: boolean;
}

function euro(cents: number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

function uuidV4() {
  return crypto.randomUUID();
}

export function PaymentRefundAction({ paymentId }: { paymentId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refund() {
    setBusy(true);
    setMessage(null);
    try {
      const quoteResponse = await fetch(
        `/api/control-center/merchant/payments/${paymentId}/refunds`,
        { cache: 'no-store' },
      );
      const quote = (await quoteResponse.json()) as RefundQuote & {
        message?: string;
      };
      if (!quoteResponse.ok) {
        throw new Error(quote.message ?? 'Quota rimborso non disponibile.');
      }
      if (quote.refundableCents <= 0) {
        setMessage('Pagamento già completamente rimborsato.');
        return;
      }

      const amount = window.prompt(
        `Importo da rimborsare in euro. Disponibile: ${euro(quote.refundableCents)}`,
        (quote.refundableCents / 100).toFixed(2).replace('.', ','),
      );
      if (amount === null) return;
      const normalized = amount.trim().replace(',', '.');
      const amountCents = Math.round(Number(normalized) * 100);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
        throw new Error('Importo rimborso non valido.');
      }

      const reason = window.prompt('Motivo del rimborso');
      if (!reason?.trim()) return;
      const providerReference =
        quote.method === 'CARD'
          ? window.prompt(
              'Riferimento rimborso terminale/provider (facoltativo)',
            )
          : null;

      const response = await fetch(
        `/api/control-center/merchant/payments/${paymentId}/refunds`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            clientRefundId: uuidV4(),
            amountCents,
            reason: reason.trim(),
            ...(providerReference?.trim()
              ? { providerReference: providerReference.trim() }
              : {}),
          }),
        },
      );
      const payload = (await response.json()) as {
        refund?: { status?: string };
        quote?: { refundableCents?: number };
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Rimborso non riuscito.');
      }
      setMessage(
        `Rimborso ${payload.refund?.status ?? 'registrato'}. Residuo ${euro(
          payload.quote?.refundableCents ?? 0,
        )}.`,
      );
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Rimborso non riuscito.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        className="button-secondary"
        disabled={busy}
        onClick={refund}
        type="button"
      >
        {busy ? 'Rimborso…' : 'Rimborsa'}
      </button>
      {message ? <small style={{ display: 'block' }}>{message}</small> : null}
    </div>
  );
}
