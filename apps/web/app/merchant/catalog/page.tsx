import { SectionHeading } from '@/components/control-center/shell';
import {
  CatalogConsole,
  type CatalogLocation,
  type CatalogPage,
  type CatalogCategory,
  type CatalogProduct,
  type PriceList,
  type PriceListDetail,
  type VatRate,
} from '@/components/merchant/catalog-console';
import { authenticatedFluxaFetch } from '@/lib/api/authenticated';
import { requireMerchantSession } from '@/lib/auth/session';

export default async function MerchantCatalogPage() {
  const session = await requireMerchantSession();
  const [categories, vatRates, products, priceLists, locations] = await Promise.all([
    authenticatedFluxaFetch<CatalogPage<CatalogCategory>>('/categories?page=1&pageSize=100'),
    authenticatedFluxaFetch<CatalogPage<VatRate>>('/vat-rates?page=1&pageSize=100'),
    authenticatedFluxaFetch<CatalogPage<CatalogProduct>>('/products?page=1&pageSize=100'),
    authenticatedFluxaFetch<CatalogPage<PriceList>>('/price-lists?page=1&pageSize=100'),
    authenticatedFluxaFetch<CatalogLocation[]>('/locations'),
  ]);

  const membership = session.availableOrganizations.find(
    (organization) => organization.organizationId === session.session.organizationId,
  );
  const initialLocationId =
    membership?.defaultLocationId ?? locations.find((item) => item.status === 'ACTIVE')?.id ?? locations[0]?.id ?? null;
  const initialPriceList =
    priceLists.items.find((item) => item.status === 'ACTIVE') ?? priceLists.items[0] ?? null;
  const initialPriceListDetail = initialPriceList
    ? await authenticatedFluxaFetch<PriceListDetail>(`/price-lists/${initialPriceList.id}`)
    : null;
  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(session.session.role ?? '');

  return (
    <>
      <section className="glass-panel panel-padding">
        <SectionHeading eyebrow="Venue configuration" title="Catalogo e prezzi" />
        <p className="muted">
          Categorie, aliquote IVA, prodotti e listini sono configurati qui e diventano la fonte autorevole per tutti i POS.
        </p>
      </section>
      <div className="mt-5">
        <CatalogConsole
          canManage={canManage}
          initialCategories={categories.items}
          initialLocationId={initialLocationId}
          initialLocations={locations}
          initialPriceListDetail={initialPriceListDetail}
          initialPriceLists={priceLists.items}
          initialProducts={products.items}
          initialVatRates={vatRates.items}
        />
      </div>
    </>
  );
}
