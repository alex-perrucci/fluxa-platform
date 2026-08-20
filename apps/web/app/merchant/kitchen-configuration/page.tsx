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
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';
import { resolveAdministrativeLocation } from '@/lib/control-center/merchant-context';

export default async function KitchenConfigurationPage() {
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
      <section className="glass-panel panel-padding">
        <EmptyState
          description="Configura prima una sede attiva per gestire cucina e stampanti."
          title="Nessuna sede disponibile"
        />
      </section>
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
      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Locale" title="Stampanti e cucina" />
        <p className="muted">
          Configura le postazioni di cucina e dove devono essere stampate le
          comande. La connessione fisica della stampante resta sul dispositivo
          POS associato.
        </p>
      </section>
      <div className="mt-5">
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
      </div>
    </>
  );
}
