// PHASE_8_TRUE_CONTROL_CENTER
import { cookies } from 'next/headers';
import Link from 'next/link';
import {
  EmptyState,
  MetricCard,
  SectionHeading,
} from '@/components/control-center/shell';
import { Icon } from '@/components/control-center/icons';
import { StatusBadge } from '@/components/control-center/status-badge';
import { DashboardLocationSelector } from '@/components/merchant/dashboard-location-selector';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import type { LocationSummary } from '@/lib/control-center/types';
import type { MerchantDashboardOverview } from '@/lib/control-center/merchant-dashboard-types';

type HealthStatus = 'OK' | 'DEGRADED' | 'DOWN' | 'NOT_CONFIGURED' | 'UNKNOWN';
type MerchantHealth = {
  overallStatus: HealthStatus;
  printers: { status: HealthStatus; items: Array<{ name: string; status: HealthStatus }> };
  fiscal: { status: HealthStatus };
  paymentTerminal: { status: HealthStatus };
  suggestions: string[];
};

function euro(cents: string | number) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(cents) / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function healthCopy(health: MerchantHealth | null, aggregate: boolean) {
  if (aggregate) {
    return {
      title: 'Seleziona una sede',
      description: 'Per verificare stampanti e fiscalizzazione scegli una sede dal selettore.',
      attention: false,
    };
  }
  if (!health) {
    return {
      title: 'Stato non disponibile',
      description: 'Le vendite sono accessibili, ma non siamo riusciti a verificare i servizi del locale.',
      attention: true,
    };
  }
  if (health.overallStatus === 'OK') {
    return {
      title: 'Tutto operativo',
      description: 'POS, servizi e configurazioni principali non richiedono attenzione.',
      attention: false,
    };
  }
  const printerIssue = health.printers.status === 'DOWN' || health.printers.status === 'DEGRADED';
  const fiscalIssue = health.fiscal.status === 'DOWN' || health.fiscal.status === 'DEGRADED' || health.fiscal.status === 'NOT_CONFIGURED';
  return {
    title: 'Serve attenzione',
    description: printerIssue
      ? 'Una stampante o il servizio di stampa richiede verifica.'
      : fiscalIssue
        ? 'La fiscalizzazione richiede verifica o assistenza.'
        : health.suggestions[0] ?? 'Uno dei servizi del locale richiede verifica.',
    attention: true,
  };
}

export default async function MerchantDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const session = await requireMerchantSession();
  const params = await searchParams;
  const organizationId = session.session.organizationId;
  const cookieName = `fluxa-dashboard-location-${organizationId}`;
  const cookieStore = await cookies();
  const savedSelection = cookieStore.get(cookieName)?.value;
  const locations = await authenticatedFluxaFetch<LocationSummary[]>('/locations');
  const accessibleIds = new Set(locations.map((location) => location.id));

  const fallbackSelection = locations.length === 1 ? locations[0].id : 'all';
  const requestedSelection = params.locationId ?? savedSelection ?? fallbackSelection;
  const selected = accessibleIds.has(requestedSelection) ? requestedSelection : 'all';
  const overviewPath = selected === 'all'
    ? '/control-center/merchant-overview'
    : `/control-center/merchant-overview?locationId=${selected}`;
  const overview = await authenticatedFluxaFetch<MerchantDashboardOverview>(overviewPath);
  const aggregate = overview.scope.kind === 'ALL';

  let health: MerchantHealth | null = null;
  if (!aggregate) {
    try {
      health = await authenticatedFluxaFetch<MerchantHealth>(
        `/control-center/merchant/health?locationId=${encodeURIComponent(selected)}`,
      );
    } catch {
      health = null;
    }
  }
  const readiness = healthCopy(health, aggregate);

  if (overview.scope.locations.length === 0) {
    return (
      <div className="glass-panel">
        <EmptyState
          description="Assegna almeno una sede attiva al tuo account per iniziare a configurare e vendere."
          title="Non hai ancora una sede operativa"
        />
      </div>
    );
  }

  return (
    <>
      <section className="glass-panel panel-padding dashboard-scope-panel">
        <div>
          <span className="eyebrow">Home</span>
          <h2>{aggregate ? 'La tua attività' : overview.scope.location?.name}</h2>
          <p>{aggregate ? 'Panoramica delle sedi che puoi gestire.' : `${overview.scope.location?.city} · ${overview.scope.location?.timezone}`}</p>
        </div>
        <DashboardLocationSelector
          cookieName={cookieName}
          locations={overview.scope.locations}
          selected={selected}
        />
      </section>

      <section className={`glass-panel panel-padding mt-5 ${readiness.attention ? 'border-amber-200' : 'border-emerald-200'}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="eyebrow">Posso lavorare?</span>
            <h2 className="mt-1 text-2xl font-semibold">{readiness.title}</h2>
            <p className="muted mt-1">{readiness.description}</p>
          </div>
          {!aggregate ? (
            <Link className="button-secondary" href="/merchant/health">
              {readiness.attention ? 'Come risolvere' : 'Controlla stato'}
            </Link>
          ) : null}
        </div>
      </section>

      <div className="metrics-grid">
        <MetricCard
          accent="cyan"
          hint="Pagamenti POS acquisiti"
          icon="money"
          label="Vendite"
          value={euro(overview.metrics.posSalesCents)}
        />
        <MetricCard
          accent="blue"
          hint="Ordini POS pagati"
          icon="ticket"
          label="Ordini"
          value={overview.metrics.posOrders}
        />
        <MetricCard
          accent="violet"
          hint={`${overview.metrics.confirmedGuests} ospiti confermati`}
          icon="users"
          label="Prenotazioni"
          value={overview.metrics.reservations}
        />
        <MetricCard
          accent={readiness.attention ? 'rose' : 'blue'}
          hint={readiness.attention ? 'Apri lo stato del sistema' : 'Nessun intervento richiesto'}
          icon="activity"
          label="Problemi"
          value={readiness.attention ? 1 : 0}
        />
      </div>

      <div className="dashboard-grid">
        <section className="glass-panel panel-padding">
          <SectionHeading eyebrow="Azioni rapide" title="Cosa vuoi fare?" />
          <div className="quick-action-grid">
            <Link className="quick-action" href="/merchant/catalog">
              <div><Icon name="plus" /></div>
              <div><strong>Nuovo prodotto</strong><span>Aggiungi qualcosa al menu</span></div>
            </Link>
            <Link className="quick-action" href="/merchant/floor-plan">
              <div><Icon name="location" /></div>
              <div><strong>Nuovo tavolo</strong><span>Gestisci sale e tavoli</span></div>
            </Link>
            <Link className="quick-action" href="/merchant/sales">
              <div><Icon name="money" /></div>
              <div><strong>Apri vendite</strong><span>Ordini e incassi POS</span></div>
            </Link>
            <Link className="quick-action" href="/merchant/catalog">
              <div><Icon name="dashboard" /></div>
              <div><strong>Gestisci menu</strong><span>Prezzi e disponibilità</span></div>
            </Link>
          </div>
        </section>

        <aside className="glass-panel panel-padding">
          <SectionHeading
            action={<Link className="button-secondary" href="/merchant/reservations">Vedi tutte</Link>}
            eyebrow="Oggi e prossimi servizi"
            title="Prenotazioni recenti"
          />
          {overview.recentReservations.length ? (
            <div className="data-list">
              {overview.recentReservations.slice(0, 5).map((reservation) => (
                <div className="data-row" key={reservation.id}>
                  <div>
                    <strong>{reservation.customerName}</strong>
                    <small>{aggregate ? `${reservation.locationName} · ` : ''}{reservation.eventTitle}</small>
                  </div>
                  <div><span>{reservation.partySize} persone</span><small>{reservation.tableName ?? 'Tavolo da assegnare'}</small></div>
                  <StatusBadge status={reservation.status} />
                </div>
              ))}
            </div>
          ) : <p className="muted">Nessuna prenotazione recente.</p>}
        </aside>
      </div>

      {overview.recentEvents.length ? (
        <section className="glass-panel panel-padding mt-5">
          <SectionHeading
            action={<Link className="button-secondary" href="/merchant/events">Tutti gli eventi</Link>}
            eyebrow="Secondario"
            title="Eventi recenti"
          />
          <div className="data-list">
            {overview.recentEvents.slice(0, 4).map((event) => (
              <Link className="data-row" href={`/merchant/events/${event.id}`} key={event.id}>
                <div><strong>{event.title}</strong><small>{aggregate ? `${event.locationName} · ` : ''}{date(event.startsAt)}</small></div>
                <div><span>{event.capacity} posti</span><small>{euro(event.bookingAmountCents)}</small></div>
                <StatusBadge status={event.status} />
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
