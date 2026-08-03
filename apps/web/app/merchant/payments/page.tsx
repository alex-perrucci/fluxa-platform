import Link from 'next/link';
import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type {
  PaginatedResponse,
  PaymentRow,
} from '@/lib/control-center/sales-backoffice-types';

function euro(cents: string | number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(cents) / 100);
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['locationId', 'method', 'status', 'q', 'from', 'to']) {
    if (params[key]) query.set(key, params[key]);
  }
  query.set('pageSize', '100');
  const payments = await authenticatedFluxaFetch<
    PaginatedResponse<PaymentRow>
  >(`/control-center/sales/payments?${query}`);

  return (
    <section className="glass-panel panel-padding">
      <SectionHeading
        action={
          <Link className="button-secondary" href="/merchant/reports">
            Report incassi
          </Link>
        }
        eyebrow="POS payments"
        title={`${payments.total} transazioni`}
      />
      <form className="filter-bar">
        <select defaultValue={params.locationId ?? ''} name="locationId">
          <option value="">Tutte le sedi</option>
          {payments.scope.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <input defaultValue={params.q} name="q" placeholder="Ordine o riferimento…" />
        <select defaultValue={params.method ?? ''} name="method">
          <option value="">Tutti i metodi</option>
          <option value="CASH">Contanti</option>
          <option value="CARD">Carta</option>
          <option value="OTHER">Altro</option>
        </select>
        <select defaultValue={params.status ?? ''} name="status">
          <option value="">Tutti gli stati</option>
          <option value="PENDING">In attesa</option>
          <option value="CAPTURED">Incassati</option>
          <option value="FAILED">Falliti</option>
          <option value="CANCELLED">Annullati</option>
        </select>
        <input defaultValue={params.from} name="from" type="date" />
        <input defaultValue={params.to} name="to" type="date" />
        <button className="button-secondary" type="submit">
          Filtra
        </button>
      </form>
      {payments.items.length ? (
        <div className="data-list">
          {payments.items.map((payment) => (
            <Link
              className="data-row"
              href={`/merchant/sales/${payment.orderId}`}
              key={payment.id}
            >
              <div>
                <strong>{payment.orderNumber}</strong>
                <small>
                  {payment.locationName} · {payment.method} · {payment.provider}
                </small>
              </div>
              <div>
                <span>{euro(payment.amountCents)}</span>
                <small>{payment.providerReference ?? 'Nessun riferimento'}</small>
              </div>
              <StatusBadge status={payment.status} />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          description="Nessuna transazione POS corrisponde ai filtri selezionati."
          title="Nessun pagamento"
        />
      )}
    </section>
  );
}
