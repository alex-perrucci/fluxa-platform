import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/catalog/data/catalog_snapshot_cache.dart';
import 'package:fluxa_pos/features/catalog/domain/catalog_models.dart';

void main() {
  test('catalog cache codec preserves products, prices and vat snapshots', () {
    final original = CatalogSnapshot.fromJson(_catalogJson());

    final restored = decodeCatalogSnapshot(encodeCatalogSnapshot(original));

    expect(restored.locationId, 'location-1');
    expect(restored.currency, 'EUR');
    expect(restored.priceListIds, ['price-list-1']);
    expect(restored.categories.single.name, 'Bar');
    final product = restored.products.single;
    expect(product.name, 'Caffè');
    expect(product.price?.amountCents, 150);
    expect(product.vat.rateBasisPoints, 1000);
    expect(product.variants.single.price?.amountCents, 200);
  });
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
          'sku': 'CAF-1',
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
          'variants': [
            {
              'id': 'variant-1',
              'code': 'DOPPIO',
              'sku': null,
              'barcode': null,
              'name': 'Doppio',
              'sortOrder': 0,
              'price': {'priceListId': 'price-list-1', 'amountCents': 200},
            },
          ],
        },
      ],
    },
  ],
};
