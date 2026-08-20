// PHASE_8_TRUE_CONTROL_CENTER
import { cookies } from 'next/headers';
import Link from 'next/link';
import {
  EmptyState,
  MetricCard,
  SectionHeading,
} from '@/components/control-center/shell';
import { Icon } from '@/components/control-center/icons';
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

function healthCopy(health: MerchantHealth | null, aggregate: boolean) {
  if (aggregate) {
    return {
      title: 'Seleziona una sede',
      description: 'Scegli una sede per controllare che stampanti e fiscalizzazione siano operative.',
      attention: false,
    };
  }
  if (!health) {
    return {
      title: 'Stato non disponibile',
      description: 'Puoi continuare a lavorare, ma al momento Fluxa non riesce a verificare tutti i servizi del locale.',
      attention: true,
    };
  }
  if (health.overallStatus === 'OK') {
    return {
      title: 'Tutto operativo',
      description: 'Non risultano problemi che richiedono il tuo intervento.',
      attention: false,
    };
  }
  const printerIssue = health.printers.status === 'DOWN' || health.printers.status === 'DEGRADED';
  const fiscalIssue = health.fiscal.status === 'DOWN' || health.fiscal.status === 'DEGRADED' || health.fiscal.status === 'NOT_CONFIGURED';
  return {
    title: 'Serve attenzione',
    description: printerIssue
      ? 'Una stampante richiede una verifica.'
      : fiscalIssue
        ? 'La fiscalizzazione richiede verifica o assistenza.'
        : health.suggestions[0] ?? 'Uno dei servizi del locale richiede una verifica.',
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
          <p>{aggregate ? 'Quello che serve sapere adesso.' : overview.scope.location?.city}</p>
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
            <span className="eyebrow">Stato del locale</span>
            <h2 className="mt-1 text-2xl font-semibold">{readiness.title}</h2>
            <p className="muted mt-1">{readiness.description}</p>
          </div>
          {!aggregate && readiness.attention ? (
            <Link className="button-primary" href="/merchant/health">
              Risolvi
            </Link>
          ) : null}
        </div>
      </section>

      <div className="metrics-grid">
        <MetricCard
          accent="cyan"
          hint="Incassato dal POS"
          icon="money"
          label="Vendite oggi"
          value={euro(overview.metrics.posSalesCents)}
        />
        <MetricCard
          accent="blue"
          hint="Ordini pagati"
          icon="ticket"
          label="Ordini"
          value={overview.metrics.posOrders}
        />
        <MetricCard
          accent={readiness.attention ? 'rose' : 'blue'}
          hint={readiness.attention ? 'Apri assistenza per risolvere' : 'Nessun intervento richiesto'}
          icon="activity"
          label="Problemi"
          value={readiness.attention ? 1 : 0}
        />
      </div>

      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Azioni rapide" title="Cosa vuoi fare?" />
        <div className="quick-action-grid">
          <Link className="quick-action" href="/merchant/catalog">
            <div><Icon name="plus" /></div>
            <div><strong>Nuovo prodotto</strong><span>Nome, prezzo e categoria</span></div>
          </Link>
          <Link className="quick-action" href="/merchant/venue?new=table">
            <div><Icon name="location" /></div>
            <div><strong>Nuovo tavolo</strong><span>Aggiungilo al locale</span></div>
          </Link>
          <Link className="quick-action" href="/merchant/sales">
            <div><Icon name="money" /></div>
            <div><strong>Apri vendite</strong><span>Ordini, incassi e documenti</span></div>
          </Link>
        </div>
      </section>
    </>
  );
}
