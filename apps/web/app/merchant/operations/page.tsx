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
import { FluxaApiError } from '@/lib/api/fluxa-api';
import { requireMerchantSession } from '@/lib/auth/session';
import { resolveAdministrativeLocation } from '@/lib/control-center/merchant-context';
import { getMerchantEntitlements } from '@/lib/subscriptions/entitlements';
import { merchantUiCapabilities } from '@/lib/subscriptions/merchant-ui-policy';

type OptionalLoad<T> = {
  data: T;
  error: string | null;
};

async function loadOptional<T>(path: string, fallback: T): Promise<OptionalLoad<T>> {
  try {
    return {
      data: await authenticatedFluxaFetch<T>(path),
      error: null,
    };
  } catch (error) {
    if (error instanceof FluxaApiError) {
      return {
        data: fallback,
        error: error.message,
      };
    }
    throw error;
  }
}

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
            href="/merchant/operations?view=devices"
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
  const [locationsResult, categoriesResult] = await Promise.all([
    loadOptional<CatalogLocation[]>('/locations', []),
    loadOptional<CatalogPage<CatalogCategory>>(
      '/categories?page=1&pageSize=100',
      { items: [], total: 0, page: 1, pageSize: 100 },
    ),
  ]);
  const locations = locationsResult.data;

  if (locationsResult.error) {
    return (
      <EmptyState
        description="Non siamo riusciti a caricare le sedi. Riprova tra poco: il resto della dashboard rimane disponibile."
        title="Sedi non disponibili"
      />
    );
  }

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

  const encodedLocationId = encodeURIComponent(initialLocationId);
  const [stationsResult, routesResult, printersResult, printRoutesResult] =
    await Promise.all([
      loadOptional<KitchenStation[]>(
        `/kitchen-stations?locationId=${encodedLocationId}`,
        [],
      ),
      loadOptional<CategoryRoute[]>(
        `/kitchen-station-routes?locationId=${encodedLocationId}`,
        [],
      ),
      loadOptional<CatalogPage<LogicalPrinter>>(
        `/printers?locationId=${encodedLocationId}&page=1&pageSize=100`,
        { items: [], total: 0, page: 1, pageSize: 100 },
      ),
      loadOptional<PrintRoute[]>(
        `/print-routes?locationId=${encodedLocationId}`,
        [],
      ),
    ]);
  const loadErrors = [
    categoriesResult.error,
    stationsResult.error,
    routesResult.error,
    printersResult.error,
    printRoutesResult.error,
  ].filter((message): message is string => Boolean(message));
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
      {loadErrors.length ? (
        <div
          className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          role="status"
        >
          <strong>Configurazione caricata parzialmente</strong>
          <p className="mt-1">
            Una o più sezioni operative non hanno risposto. Puoi continuare con
            quelle disponibili e riprovare senza uscire dalla dashboard.
          </p>
        </div>
      ) : null}
      <KitchenConfigurationConsole
        canManage={canManage}
        categories={categoriesResult.data.items}
        initialCategoryRoutes={routesResult.data}
        initialLocationId={initialLocationId}
        initialLocations={locations}
        initialPrintRoutes={printRoutesResult.data}
        initialPrinters={printersResult.data.items}
        initialStations={stationsResult.data}
      />
    </>
  );
}
