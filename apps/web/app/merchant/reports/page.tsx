import { MetricCard, SectionHeading } from '@/components/control-center/shell';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import type { SalesReport } from '@/lib/control-center/sales-backoffice-types';

function euro(cents: string | number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(cents) / 100);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['locationId', 'method', 'from', 'to']) {
    if (params[key]) query.set(key, params[key]);
  }
  const report = await authenticatedFluxaFetch<SalesReport>(
    `/control-center/sales/reports?${query}`,
  );

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading
          action={
            <a
              className="button-primary"
              href={`/api/control-center/merchant/reports/export?${query}`}
            >
              Esporta CSV
            </a>
          }
          eyebrow="Sales intelligence"
          title="Report vendite POS"
        />
        <form className="filter-bar">
          <select defaultValue={params.locationId ?? ''} name="locationId">
            <option value="">Tutte le sedi</option>
            {report.scope.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <select defaultValue={params.method ?? ''} name="method">
            <option value="">Tutti i metodi</option>
            <option value="CASH">Contanti</option>
            <option value="CARD">Carta</option>
            <option value="OTHER">Altro</option>
          </select>
          <input defaultValue={params.from} name="from" type="date" />
          <input defaultValue={params.to} name="to" type="date" />
          <button className="button-secondary" type="submit">
            Aggiorna
          </button>
        </form>
        <div className="metrics-grid">
          <MetricCard
            accent="blue"
            hint="Transazioni POS catturate oggi"
            icon="money"
            label="Totale giornaliero"
            value={euro(report.totals.todayCents)}
          />
          <MetricCard
            accent="cyan"
            hint="Settimana corrente"
            icon="dashboard"
            label="Totale settimanale"
            value={euro(report.totals.weekCents)}
          />
          <MetricCard
            accent="violet"
            hint="Mese corrente"
            icon="calendar"
            label="Totale mensile"
            value={euro(report.totals.monthCents)}
          />
          <MetricCard
            accent="blue"
            hint="Separati dai ricavi POS"
            icon="ticket"
            label="Depositi prenotazioni"
            value={euro(report.totals.bookingDepositsCents)}
          />
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="glass-panel panel-padding">
          <SectionHeading eyebrow="Location" title="Vendite per sede" />
          <div className="data-list">
            {report.byLocation.map((row) => (
              <div className="data-row" key={row.locationId}>
                <div>
                  <strong>{row.locationName}</strong>
                  <small>{row.orders} ordini pagati</small>
                </div>
                <span>{euro(row.posRevenueCents)}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="glass-panel panel-padding">
          <SectionHeading eyebrow="Tender" title="Metodi di pagamento" />
          <div className="data-list">
            {report.byMethod.map((row) => (
              <div className="data-row" key={row.method}>
                <div>
                  <strong>{row.method}</strong>
                  <small>
                    {row.payments} transazioni · {row.orders} ordini
                  </small>
                </div>
                <span>{euro(row.posRevenueCents)}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Timeline" title="Andamento giornaliero" />
        <div className="data-list">
          {report.daily.map((row) => (
            <div className="data-row" key={row.date}>
              <div>
                <strong>{row.date}</strong>
                <small>{row.orders} ordini</small>
              </div>
              <span>{euro(row.posRevenueCents)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
