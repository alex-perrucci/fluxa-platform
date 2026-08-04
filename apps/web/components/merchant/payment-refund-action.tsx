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
        refund?: { id?: string; status?: string };
        quote?: { refundableCents?: number; fullyRefunded?: boolean };
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message ?? 'Rimborso non riuscito.');
      }

      let notice = `Rimborso ${payload.refund?.status ?? 'registrato'}. Residuo ${euro(
        payload.quote?.refundableCents ?? 0,
      )}.`;
      const refundId = payload.refund?.id;
      if (
        refundId &&
        payload.refund?.status === 'SUCCEEDED' &&
        payload.quote?.fullyRefunded === true &&
        window.confirm(
          'L’ordine risulta integralmente rimborsato. Accodare anche lo storno fiscale?',
        )
      ) {
        const fiscalResponse = await fetch(
          `/api/control-center/merchant/refunds/${refundId}/fiscal-void`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              mutationId: uuidV4(),
              reason: reason.trim(),
            }),
          },
        );
        const fiscalPayload = (await fiscalResponse.json()) as {
          status?: string;
          message?: string;
        };
        if (!fiscalResponse.ok) {
          throw new Error(
            fiscalPayload.message ??
              'Rimborso riuscito, ma storno fiscale non accodato.',
          );
        }
        notice += ` Storno fiscale ${fiscalPayload.status ?? 'accodato'}.`;
      }
      setMessage(notice);
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
