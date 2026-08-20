import Link from 'next/link';
import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import { StatusBadge } from '@/components/control-center/status-badge';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type {
  PaginatedResponse,
  SalesOrderRow,
} from '@/lib/control-center/sales-backoffice-types';

function euro(cents: string | number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(cents) / 100);
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['locationId', 'status', 'q', 'from', 'to']) {
    if (params[key]) query.set(key, params[key]);
  }
  query.set('pageSize', '100');

  const sales = await authenticatedFluxaFetch<
    PaginatedResponse<SalesOrderRow>
  >(`/control-center/sales/orders?${query}`);

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Vendite" title="Ordini e incassi" />
        <p className="muted max-w-3xl">
          Consulta gli ordini POS e passa a pagamenti, documenti fiscali o report quando ti serve un dettaglio specifico.
        </p>
        <nav className="mt-4 flex flex-wrap gap-2">
          <Link className="button-secondary" href="/merchant/payments">Pagamenti e rimborsi</Link>
          <Link className="button-secondary" href="/merchant/fiscal-documents">Documenti fiscali</Link>
          <Link className="button-secondary" href="/merchant/reports">Report</Link>
        </nav>
      </section>

      <section className="glass-panel panel-padding mt-5">
        <SectionHeading eyebrow="Ordini POS" title={`${sales.total} ordini`} />

        <form className="filter-bar">
          <select defaultValue={params.locationId ?? ''} name="locationId">
            <option value="">Tutte le sedi</option>
            {sales.scope.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <input defaultValue={params.q} name="q" placeholder="Numero ordine…" />
          <select defaultValue={params.status ?? ''} name="status">
            <option value="">Tutti gli stati</option>
            <option value="OPEN">Aperti</option>
            <option value="HELD">In attesa</option>
            <option value="AWAITING_PAYMENT">Da pagare</option>
            <option value="PAID">Pagati</option>
            <option value="CANCELLED">Annullati</option>
          </select>
          <input defaultValue={params.from} name="from" type="date" />
          <input defaultValue={params.to} name="to" type="date" />
          <button className="button-secondary" type="submit">Filtra</button>
        </form>

        {sales.items.length ? (
          <div className="data-list">
            {sales.items.map((order) => (
              <Link className="data-row" href={`/merchant/sales/${order.id}`} key={order.id}>
                <div>
                  <strong>{order.number}</strong>
                  <small>{order.locationName} · {order.businessDate} · {order.serviceMode}</small>
                </div>
                <div>
                  <span>{euro(order.totalCents)}</span>
                  <small>{order.paymentMethods || 'Non ancora pagato'}</small>
                </div>
                <div>
                  <StatusBadge status={order.status} />
                  <small>{order.fiscalStatus ? `Documento: ${order.fiscalStatus}` : 'Documento non emesso'}</small>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            description="Prova a cambiare i filtri oppure torna qui dopo la prossima vendita."
            title="Nessun ordine da mostrare"
          />
        )}
      </section>
    </>
  );
}
