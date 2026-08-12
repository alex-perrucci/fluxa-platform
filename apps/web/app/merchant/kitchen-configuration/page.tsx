import { SectionHeading } from '@/components/control-center/shell';
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

export default async function KitchenConfigurationPage() {
  const session = await requireMerchantSession();
  const [locations, categories] = await Promise.all([
    authenticatedFluxaFetch<CatalogLocation[]>('/locations'),
    authenticatedFluxaFetch<CatalogPage<CatalogCategory>>('/categories?page=1&pageSize=100'),
  ]);
  const membership = session.availableOrganizations.find(
    (organization) => organization.organizationId === session.session.organizationId,
  );
  const initialLocationId =
    membership?.defaultLocationId ?? locations.find((item) => item.status === 'ACTIVE')?.id ?? locations[0]?.id ?? null;

  let stations: KitchenStation[] = [];
  let routes: CategoryRoute[] = [];
  let printers: LogicalPrinter[] = [];
  let printRoutes: PrintRoute[] = [];
  if (initialLocationId) {
    const [stationRows, routeRows, printerPage, printRouteRows] = await Promise.all([
      authenticatedFluxaFetch<KitchenStation[]>(`/kitchen-stations?locationId=${encodeURIComponent(initialLocationId)}`),
      authenticatedFluxaFetch<CategoryRoute[]>(`/kitchen-station-routes?locationId=${encodeURIComponent(initialLocationId)}`),
      authenticatedFluxaFetch<CatalogPage<LogicalPrinter>>(`/printers?locationId=${encodeURIComponent(initialLocationId)}&page=1&pageSize=100`),
      authenticatedFluxaFetch<PrintRoute[]>(`/print-routes?locationId=${encodeURIComponent(initialLocationId)}`),
    ]);
    stations = stationRows;
    routes = routeRows;
    printers = printerPage.items;
    printRoutes = printRouteRows;
  }
  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(session.session.role ?? '');

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Venue configuration" title="Cucina e routing" />
        <p className="muted">
          Configura postazioni e instradamento logico. La connessione fisica Wi-Fi/Bluetooth delle stampanti resta sul POS.
        </p>
      </section>
      <div className="mt-5">
        <KitchenConfigurationConsole
          canManage={canManage}
          categories={categories.items}
          initialCategoryRoutes={routes}
          initialLocationId={initialLocationId}
          initialLocations={locations}
          initialPrintRoutes={printRoutes}
          initialPrinters={printers}
          initialStations={stations}
        />
      </div>
    </>
  );
}
