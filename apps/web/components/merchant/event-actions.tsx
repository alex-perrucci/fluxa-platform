// PHASE_8_TRUE_CONTROL_CENTER
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/control-center/icons';
import { ControlCenterNotification } from '@/components/control-center/notification';
import type { EventStatus } from '@/lib/control-center/types';

export function EventActions({
  eventId,
  status,
}: {
  eventId: string;
  status: EventStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function action(actionName: 'publish' | 'cancel' | 'archive') {
    setPending(actionName);
    setError(null);

    const response = await fetch(
      `/api/control-center/merchant/events/${eventId}/action`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: actionName,
          ...(actionName === 'cancel'
            ? { reason: 'Annullato dal Control Center Fluxa' }
            : {}),
        }),
      },
    );
    const payload = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(payload.message ?? 'Operazione non riuscita.');
      setPending(null);
      return;
    }

    if (actionName === 'archive') {
      router.push('/merchant/events');
    } else {
      router.refresh();
    }

    setPending(null);
  }

  return (
    <div className="event-actions">
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Operazione non riuscita"
      />
      {status === 'DRAFT' ? (
        <button
          className="button-primary"
          disabled={Boolean(pending)}
          onClick={() => void action('publish')}
          type="button"
        >
          {pending === 'publish' ? 'Pubblicazione…' : 'Pubblica evento'}
          <Icon name="sparkles" />
        </button>
      ) : null}
      {status === 'PUBLISHED' || status === 'SOLD_OUT' ? (
        <button
          className="button-danger"
          disabled={Boolean(pending)}
          onClick={() => void action('cancel')}
          type="button"
        >
          {pending === 'cancel' ? 'Annullamento…' : 'Annulla evento'}
        </button>
      ) : null}
      {status === 'DRAFT' || status === 'CANCELLED' ? (
        <button
          className="button-secondary"
          disabled={Boolean(pending)}
          onClick={() => void action('archive')}
          type="button"
        >
          Archivia
        </button>
      ) : null}
    </div>
  );
}
