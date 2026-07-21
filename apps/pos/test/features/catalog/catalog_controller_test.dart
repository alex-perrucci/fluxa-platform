import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/network/backend_error.dart';
import 'package:fluxa_pos/features/catalog/data/catalog_api.dart';
import 'package:fluxa_pos/features/catalog/domain/catalog_models.dart';
import 'package:fluxa_pos/features/catalog/presentation/catalog_controller.dart';

void main() {
  test(
    'loads a location catalog and filters product and variant fields',
    () async {
      final gateway = _FakeCatalogGateway(snapshot: _snapshot());
      final controller = CatalogController(gateway);

      await controller.load('location-1');

      expect(controller.status, CatalogLoadStatus.ready);
      expect(controller.visibleProducts, hasLength(2));

      controller.setSearchQuery('variant-barcode');
      expect(controller.visibleProducts.map((item) => item.id), ['product-1']);

      controller.setSearchQuery('');
      controller.selectCategory('category-2');
      expect(controller.visibleProducts.map((item) => item.id), ['product-2']);
    },
  );

  test(
    'never keeps the previous location snapshot while loading a new one',
    () async {
      final gateway = _FakeCatalogGateway(snapshot: _snapshot());
      final controller = CatalogController(gateway);

      await controller.load('location-1');
      expect(controller.snapshot, isNotNull);

      gateway.snapshot = _snapshot(locationId: 'location-2');
      final load = controller.load('location-2');

      expect(controller.locationId, 'location-2');
      expect(controller.snapshot, isNull);
      await load;
      expect(controller.snapshot?.locationId, 'location-2');
    },
  );

  test('exposes backend errors as a failure state', () async {
    final gateway = _FakeCatalogGateway(
      error: const BackendError(
        code: 'LOCATION_NOT_FOUND',
        message: 'Punto vendita non trovato.',
      ),
    );
    final controller = CatalogController(gateway);

    await controller.load('location-1');

    expect(controller.status, CatalogLoadStatus.failure);
    expect(controller.errorMessage, 'Punto vendita non trovato.');
    expect(controller.snapshot, isNull);
  });
}

class _FakeCatalogGateway implements CatalogGateway {
  _FakeCatalogGateway({this.snapshot, this.error});

  CatalogSnapshot? snapshot;
  BackendError? error;

  @override
  Future<CatalogSnapshot> fetchCatalog({
    required String locationId,
    String? query,
  }) async {
    final currentError = error;
    if (currentError != null) {
      throw currentError;
    }
    return snapshot!;
  }
}

CatalogSnapshot _snapshot({String locationId = 'location-1'}) =>
    CatalogSnapshot(
      locationId: locationId,
      currency: 'EUR',
      priceListIds: const ['price-list-1'],
      categories: const [
        CatalogCategory(
          id: 'category-1',
          code: 'FOOD',
          name: 'Food',
          sortOrder: 10,
          products: [
            CatalogProduct(
              id: 'product-1',
              code: 'PIZZA',
              sku: 'PIZZA-1',
              barcode: null,
              name: 'Pizza',
              description: null,
              imageUrl: null,
              unit: CatalogProductUnit.each,
              quantityScale: 0,
              trackAvailability: false,
              vat: CatalogVat(
                id: 'vat-1',
                code: 'IVA10',
                rateBasisPoints: 1000,
                natureCode: null,
              ),
              price: CatalogPrice(
                priceListId: 'price-list-1',
                amountCents: 700,
              ),
              variants: [
                CatalogVariant(
                  id: 'variant-1',
                  code: 'MAXI',
                  sku: 'PIZZA-MAXI',
                  barcode: 'variant-barcode',
                  name: 'Maxi',
                  sortOrder: 10,
                  price: CatalogPrice(
                    priceListId: 'price-list-1',
                    amountCents: 1000,
                  ),
                ),
              ],
            ),
          ],
        ),
        CatalogCategory(
          id: 'category-2',
          code: 'DRINKS',
          name: 'Drinks',
          sortOrder: 20,
          products: [
            CatalogProduct(
              id: 'product-2',
              code: 'WATER',
              sku: null,
              barcode: null,
              name: 'Acqua',
              description: null,
              imageUrl: null,
              unit: CatalogProductUnit.each,
              quantityScale: 0,
              trackAvailability: false,
              vat: CatalogVat(
                id: 'vat-2',
                code: 'IVA22',
                rateBasisPoints: 2200,
                natureCode: null,
              ),
              price: null,
              variants: [],
            ),
          ],
        ),
      ],
    );
