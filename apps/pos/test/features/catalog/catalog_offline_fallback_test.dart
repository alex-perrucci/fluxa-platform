import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/network/backend_error.dart';
import 'package:fluxa_pos/features/catalog/data/catalog_api.dart';
import 'package:fluxa_pos/features/catalog/data/catalog_snapshot_cache.dart';
import 'package:fluxa_pos/features/catalog/domain/catalog_models.dart';
import 'package:fluxa_pos/features/catalog/presentation/catalog_controller.dart';

void main() {
  test('uses the cached catalog when the backend is unreachable', () async {
    final cached = CatalogSnapshot.fromJson(_catalogJson());
    final controller = CatalogController(
      _FailingCatalogGateway(const BackendError(message: 'offline')),
      cache: _MemoryCatalogCache(cached),
    );

    await controller.load('location-1');

    expect(controller.status, CatalogLoadStatus.ready);
    expect(controller.offlineMode, isTrue);
    expect(controller.snapshot?.products.single.name, 'Caffè');
    expect(controller.errorMessage, isNull);
  });

  test('does not hide authentication failures behind stale cache', () async {
    final cached = CatalogSnapshot.fromJson(_catalogJson());
    final controller = CatalogController(
      _FailingCatalogGateway(
        const BackendError(message: 'Sessione scaduta', statusCode: 401),
      ),
      cache: _MemoryCatalogCache(cached),
    );

    await controller.load('location-1');

    expect(controller.status, CatalogLoadStatus.failure);
    expect(controller.offlineMode, isFalse);
    expect(controller.errorMessage, 'Sessione scaduta');
  });
}

class _FailingCatalogGateway implements CatalogGateway {
  const _FailingCatalogGateway(this.error);

  final BackendError error;

  @override
  Future<CatalogSnapshot> fetchCatalog({
    required String locationId,
    String? query,
  }) async => throw error;
}

class _MemoryCatalogCache implements CatalogSnapshotCache {
  _MemoryCatalogCache(this.snapshot);

  CatalogSnapshot? snapshot;

  @override
  Future<CatalogSnapshot?> load(String locationId) async =>
      snapshot?.locationId == locationId ? snapshot : null;

  @override
  Future<void> save(CatalogSnapshot snapshot) async {
    this.snapshot = snapshot;
  }
}

Map<String, Object?> _catalogJson() => {
  'locationId': 'location-1',
  'currency': 'EUR',
  'priceLists': ['price-list-1'],
  'categories': [
    {
      'id': 'category-1',
      'code': 'BAR',
      'name': 'Bar',
      'sortOrder': 0,
      'products': [
        {
          'id': 'product-1',
          'code': 'CAFFE',
          'sku': null,
          'barcode': null,
          'name': 'Caffè',
          'description': null,
          'imageUrl': null,
          'unit': 'EACH',
          'quantityScale': 0,
          'trackAvailability': false,
          'vat': {
            'id': 'vat-1',
            'code': 'IVA10',
            'rateBasisPoints': 1000,
            'natureCode': null,
          },
          'price': {'priceListId': 'price-list-1', 'amountCents': 150},
          'variants': <Object?>[],
        },
      ],
    },
  ],
};
