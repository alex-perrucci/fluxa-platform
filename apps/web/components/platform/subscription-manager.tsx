'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ControlCenterNotification } from '@/components/control-center/notification';
import type {
  OrganizationEntitlements,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@/lib/subscriptions/entitlements';

const plans: Array<{ value: SubscriptionPlan; label: string; description: string }> = [
  {
    value: 'START',
    label: 'Fluxa Start',
    description: 'Cassa, ordini, pagamenti, ricevute e fiscalizzazione.',
  },
  {
    value: 'SALA',
    label: 'Fluxa Sala',
    description: 'Start + tavoli, piantina e servizio al tavolo.',
  },
  {
    value: 'PRO',
    label: 'Fluxa Pro',
    description: 'Sala + cucina, routing, stampa cucina e KDS.',
  },
];

export function SubscriptionManager({
  organizationId,
  initialSubscription,
}: {
  organizationId: string;
  initialSubscription: OrganizationEntitlements;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<SubscriptionPlan>(initialSubscription.plan);
  const [status, setStatus] = useState<SubscriptionStatus>(
    initialSubscription.status,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/control-center/platform/organizations/${organizationId}/subscription`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ plan, status }),
        },
      );
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? 'Aggiornamento piano non riuscito.');
        return;
      }
      setMessage('Piano aggiornato. Gli entitlement saranno riletti al refresh.');
      router.refresh();
    } catch {
      setError('Control Center non raggiungibile.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Piano non aggiornato"
      />
      {message ? <p className="mb-4 muted">{message}</p> : null}
      <div className="form-grid">
        <label className="field span-2">
          <span>Piano commerciale</span>
          <select
            onChange={(event) => setPlan(event.target.value as SubscriptionPlan)}
            value={plan}
          >
            {plans.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <small>{plans.find((item) => item.value === plan)?.description}</small>
        </label>
        <label className="field">
          <span>Stato subscription</span>
          <select
            onChange={(event) =>
              setStatus(event.target.value as SubscriptionStatus)
            }
            value={status}
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="TRIAL">TRIAL</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          className="button-primary"
          disabled={pending}
          onClick={save}
          type="button"
        >
          {pending ? 'Salvataggio…' : 'Aggiorna piano'}
        </button>
        <span className="muted text-sm">
          Attuale: {initialSubscription.planName} · {initialSubscription.status}
        </span>
      </div>
    </div>
  );
}
