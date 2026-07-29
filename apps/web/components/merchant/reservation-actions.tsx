// PHASE_10_RESERVATION_OPERATIONS
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import type {
  ReservationDetail,
  ReservationStatus,
} from '@/lib/control-center/types';

type Action = 'check-in' | 'seat' | 'complete' | 'no-show';

interface ErrorPayload {
  message?: string | string[];
}

function messageFromPayload(payload: ErrorPayload): string {
  if (Array.isArray(payload.message)) {
    return payload.message.join(' ');
  }

  return payload.message ?? 'Operazione non riuscita.';
}

function actionsFor(status: ReservationStatus): Array<{
  action: Action;
  label: string;
  tone: 'primary' | 'secondary' | 'danger';
}> {
  if (status === 'CONFIRMED') {
    return [
      {
        action: 'check-in',
        label: 'Effettua check-in',
        tone: 'primary',
      },
      {
        action: 'no-show',
        label: 'Segna no-show',
        tone: 'danger',
      },
    ];
  }

  if (status === 'CHECKED_IN') {
    return [
      {
        action: 'seat',
        label: 'Accompagna al tavolo',
        tone: 'primary',
      },
    ];
  }

  if (status === 'SEATED') {
    return [
      {
        action: 'complete',
        label: 'Completa prenotazione',
        tone: 'primary',
      },
    ];
  }

  return [];
}

export function ReservationActions({
  reservation,
}: {
  reservation: ReservationDetail;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actions = actionsFor(reservation.status);

  async function run(action: Action) {
    if (
      action === 'no-show' &&
      !window.confirm(`Segnare ${reservation.customerName} come no-show?`)
    ) {
      return;
    }

    setPending(action);
    setError(null);

    try {
      const response = await fetch(
        `/api/control-center/reservations/${reservation.id}/actions/${action}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mutationId: crypto.randomUUID(),
            expectedVersion: reservation.version,
          }),
        },
      );
      const payload = (await response.json()) as
        ReservationDetail | ErrorPayload;

      if (!response.ok) {
        setError(messageFromPayload(payload as ErrorPayload));
        return;
      }

      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Operazione non riuscita.',
      );
    } finally {
      setPending(null);
    }
  }

  const completionBlocked =
    reservation.status === 'SEATED' &&
    reservation.tableSessionStatus !== 'CLOSED';

  return (
    <div className="reservation-actions-panel">
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Operazione non completata"
      />

      <div>
        <p className="eyebrow">Azioni operative</p>
        <h2>Avanza l’ospite nel flusso di sala.</h2>
        {completionBlocked ? (
          <p>
            La sessione tavolo è ancora aperta. Chiudila dal POS dopo il
            pagamento, poi completa la prenotazione.
          </p>
        ) : (
          <p>
            Ogni azione è versionata, idempotente e registrata nello storico.
          </p>
        )}
      </div>

      <div className="reservation-action-buttons">
        {actions.map((item) => (
          <button
            className={
              item.tone === 'primary'
                ? 'button-primary'
                : item.tone === 'danger'
                  ? 'button-danger'
                  : 'button-secondary'
            }
            disabled={
              pending !== null ||
              (item.action === 'complete' && completionBlocked)
            }
            key={item.action}
            onClick={() => run(item.action)}
            type="button"
          >
            {pending === item.action ? 'Aggiornamento…' : item.label}
          </button>
        ))}

        {actions.length === 0 ? (
          <span className="reservation-terminal-state">
            Nessuna azione operativa disponibile per questo stato.
          </span>
        ) : null}
      </div>
    </div>
  );
}
