import Link from 'next/link';
import { MetricCard, SectionHeading } from '@/components/control-center/shell';
import { StatusBadge } from '@/components/control-center/status-badge';
import { PaymentRefundAction } from '@/components/merchant/payment-refund-action';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { SalesOrderDetail } from '@/lib/control-center/sales-backoffice-types';

function euro(cents: string | number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(cents) / 100);
}

function quantity(amount: number, scale: number) {
  return amount / 10 ** scale;
}

export default async function SalesOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await authenticatedFluxaFetch<SalesOrderDetail>(
    `/control-center/sales/orders/${orderId}`,
  );

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading
          action={
            <Link className="button-secondary" href="/merchant/sales">
              Torna alle vendite
            </Link>
          }
          eyebrow={`${order.locationName} · ${order.businessDate}`}
          title={`Ordine ${order.number}`}
        />
        <div className="metrics-grid">
          <MetricCard
            accent="blue"
            hint={order.serviceMode}
            icon="ticket"
            label="Totale ordine"
            value={euro(order.totalCents)}
          />
          <MetricCard
            accent="cyan"
            hint={`${order.payments.length} transazioni`}
            icon="money"
            label="Pagamenti POS"
            value={euro(
              order.payments
                .filter((payment) =>
                  ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(
                    payment.status,
                  ),
                )
                .reduce((sum, payment) => sum + payment.amountCents, 0),
            )}
          />
          <MetricCard
            accent="violet"
            hint={`IVA ${euro(order.taxTotalCents)}`}
            icon="dashboard"
            label="Netto"
            value={euro(order.netTotalCents)}
          />
          <MetricCard
            accent="blue"
            hint={order.fiscalDocuments[0]?.documentNumber ?? 'Nessun documento'}
            icon="building"
            label="Stato fiscale"
            value={order.fiscalDocuments[0]?.status ?? 'NON EMESSO'}
          />
        </div>
        <div style={{ marginTop: '1rem' }}>
          <StatusBadge status={order.status} />
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="glass-panel panel-padding">
          <SectionHeading eyebrow="Righe" title="Prodotti venduti" />
          <div className="data-list">
            {order.items.map((item) => (
              <div className="data-row" key={item.id}>
                <div>
                  <strong>
                    {item.productName}
                    {item.variantName ? ` · ${item.variantName}` : ''}
                  </strong>
                  <small>
                    {quantity(item.quantityAmount, item.quantityScale)} ×{' '}
                    {euro(item.unitPriceCents)} · IVA{' '}
                    {item.vatRateBasisPoints / 100}%
                  </small>
                </div>
                <div>
                  <span>{euro(item.finalGrossCents)}</span>
                  <small>Sconto {euro(item.discountCents)}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="glass-panel panel-padding">
          <SectionHeading eyebrow="Incasso" title="Pagamenti e rimborsi" />
          <div className="data-list">
            {order.payments.map((payment) => (
              <div className="data-row" key={payment.id}>
                <div>
                  <strong>{payment.method}</strong>
                  <small>{payment.provider}</small>
                </div>
                <div>
                  <span>{euro(payment.amountCents)}</span>
                  <StatusBadge status={payment.status} />
                  {['CAPTURED', 'PARTIALLY_REFUNDED'].includes(
                    payment.status,
                  ) && ['CASH', 'CARD'].includes(payment.method) ? (
                    <PaymentRefundAction paymentId={payment.id} />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <SectionHeading eyebrow="Fiscalità" title="Documenti" />
          <div className="data-list">
            {order.fiscalDocuments.map((document) => (
              <div className="data-row" key={document.id}>
                <div>
                  <strong>{document.documentNumber ?? document.type}</strong>
                  <small>{document.provider}</small>
                </div>
                <StatusBadge status={document.status} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
