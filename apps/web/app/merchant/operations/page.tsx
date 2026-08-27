import Link from 'next/link';
import { EmptyState, SectionHeading } from '@/components/control-center/shell';
import {
  KitchenConfigurationConsole,
  type CategoryRoute,
  type KitchenStation,
  type LogicalPrinter,
  type PrintRoute,
} from '@/components/merchant/kitchen-configuration-console';
import type {
  CatalogCategory,
  CatalogLocation,
  CatalogPage,
} from '@/components/merchant/catalog-console';
import { PosDevicesConsole } from '@/components/merchant/pos-devices-console';
import { PlanFeatureGate } from '@/components/subscriptions/plan-feature-gate';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import { resolveAdministrativeLocation } from '@/lib/control-center/merchant-context';
import { getMerchantEntitlements } from '@/lib/subscriptions/entitlements';
import { merchantUiCapabilities } from '@/lib/subscriptions/merchant-ui-policy';

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const subscription = await getMerchantEntitlements();
  const capabilities = merchantUiCapabilities(subscription.entitlements);
  const view = params.view === 'printing' ? 'printing' : 'devices';

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Operatività" title="Casse, cucina e stampa" />
        <p className="muted max-w-3xl">
          Gestisci gli strumenti usati durante il servizio con nomi reali: casse,
          postazioni di preparazione e stampanti.
        </p>
        <nav
          className="mt-5 flex flex-wrap gap-2"
          aria-label="Sezioni operative"
        >
          <Link
            className={view === 'devices' ? 'button-primary' : 'button-secondary'}
            href="/merchant/operations"
          >
            Dispositivi
          </Link>
          {capabilities.kitchenPrinting ? (
            <Link
              className={
                view === 'printing' ? 'button-primary' : 'button-secondary'
              }
              href="/merchant/operations?view=printing"
            >
              Cucina e stampa
            </Link>
          ) : null}
        </nav>
      </section>

      <section className="glass-panel panel-padding mt-5">
        {view === 'devices' ? (
          <>
            <div className="mb-5">
              <strong className="text-lg">Dispositivi</strong>
              <p className="muted">
                Scegli in quale sede si trova ogni POS e come viene usato.
              </p>
            </div>
            <PosDevicesConsole />
          </>
        ) : capabilities.kitchenPrinting ? (
          <PrintingSection />
        ) : (
          <PlanFeatureGate
            description="Postazioni cucina, routing comande, stampa cucina e KDS sono disponibili con Fluxa Pro. Le ricevute standard del POS restano operative nel piano corrente."
            planName={subscription.planName}
            title="Workflow cucina non incluso"
            upgradePlanName={subscription.upgrade?.planName}
          />
        )}
      </section>

      <section className="glass-panel panel-padding mt-5">
        <strong>Altre attività del servizio</strong>
        <p className="muted mt-1">
          Aprile solo quando servono: non fanno parte della configurazione
          quotidiana di casse e stampanti.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="button-secondary" href="/merchant/reservations">
            Prenotazioni
          </Link>
          <Link className="button-secondary" href="/merchant/events">
            Eventi
          </Link>
        </div>
      </section>
    </>
  );
}

async function PrintingSection() {
  const session = await requireMerchantSession();
  const [locations, categories] = await Promise.all([
    authenticatedFluxaFetch<CatalogLocation[]>('/locations'),
    authenticatedFluxaFetch<CatalogPage<CatalogCategory>>(
      '/categories?page=1&pageSize=100',
    ),
  ]);
  const membership = session.availableOrganizations.find(
    (organization) =>
      organization.organizationId === session.session.organizationId,
  );
  const initialLocation = resolveAdministrativeLocation({
    locations,
    defaultLocationId: membership?.defaultLocationId,
  });
  const initialLocationId = initialLocation?.id ?? null;

  if (!initialLocationId) {
    return (
      <EmptyState
        description="Configura prima una sede attiva per gestire cucina e stampanti."
        title="Nessuna sede disponibile"
      />
    );
  }

  const [stationRows, routeRows, printerPage, printRouteRows] =
    await Promise.all([
      authenticatedFluxaFetch<KitchenStation[]>(
        `/kitchen-stations?locationId=${encodeURIComponent(initialLocationId)}`,
      ),
      authenticatedFluxaFetch<CategoryRoute[]>(
        `/kitchen-station-routes?locationId=${encodeURIComponent(initialLocationId)}`,
      ),
      authenticatedFluxaFetch<CatalogPage<LogicalPrinter>>(
        `/printers?locationId=${encodeURIComponent(initialLocationId)}&page=1&pageSize=100`,
      ),
      authenticatedFluxaFetch<PrintRoute[]>(
        `/print-routes?locationId=${encodeURIComponent(initialLocationId)}`,
      ),
    ]);
  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(
    session.session.role ?? '',
  );

  return (
    <>
      <div className="mb-5">
        <strong className="text-lg">Cucina e stampa</strong>
        <p className="muted">
          Indica dove vengono preparate le categorie e cosa deve uscire da ogni
          stampante.
        </p>
      </div>
      <KitchenConfigurationConsole
        canManage={canManage}
        categories={categories.items}
        initialCategoryRoutes={routeRows}
        initialLocationId={initialLocationId}
        initialLocations={locations}
        initialPrintRoutes={printRouteRows}
        initialPrinters={printerPage.items}
        initialStations={stationRows}
      />
    </>
  );
}
