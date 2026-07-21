import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/catalog/domain/catalog_models.dart';

void main() {
  test('parses the effective catalog contract', () {
    final catalog = CatalogSnapshot.fromJson(_catalogPayload());

    expect(catalog.locationId, '55555555-5555-4555-8555-555555555555');
    expect(catalog.currency, 'EUR');
    expect(catalog.priceListIds, ['price-list-1']);
    expect(catalog.categories, hasLength(1));

    final product = catalog.categories.single.products.single;
    expect(product.name, 'Caffè espresso');
    expect(product.unit, CatalogProductUnit.each);
    expect(product.price?.amountCents, 120);
    expect(product.vat.rateBasisPoints, 1000);
    expect(product.variants.single.price?.amountCents, 220);
    expect(product.lowestPrice?.amountCents, 120);
  });

  test('supports nullable prices and searches variant identifiers locally', () {
    final payload = _catalogPayload();
    final categories = payload['categories']! as List<Object?>;
    final category = categories.single! as Map<String, Object?>;
    final products = category['products']! as List<Object?>;
    final productPayload = products.single! as Map<String, Object?>;
    productPayload['price'] = null;

    final product = CatalogSnapshot.fromJson(payload).products.single;

    expect(product.price, isNull);
    expect(product.lowestPrice?.amountCents, 220);
    expect(product.matches('CAFFE-DOPPIO'), isTrue);
    expect(product.matches('800000000002'), isTrue);
    expect(product.matches('inesistente'), isFalse);
  });

  test('formats integer cents without floating point input', () {
    expect(formatCatalogMoney(120, 'EUR'), '€ 1,20');
    expect(formatCatalogMoney(1250, 'USD'), r'$ 12,50');
  });
}

Map<String, Object?> _catalogPayload() => {
  'locationId': '55555555-5555-4555-8555-555555555555',
  'currency': 'EUR',
  'priceLists': ['price-list-1'],
  'categories': <Object?>[
    <String, Object?>{
      'id': 'category-1',
      'code': 'BEVANDE',
      'name': 'Bevande',
      'sortOrder': 10,
      'products': <Object?>[
        <String, Object?>{
          'id': 'product-1',
          'code': 'CAFFE',
          'sku': 'CAFFE-001',
          'barcode': '800000000001',
          'name': 'Caffè espresso',
          'description': 'Espresso classico',
          'imageUrl': null,
          'unit': 'EACH',
          'quantityScale': 0,
          'trackAvailability': false,
          'vat': <String, Object?>{
            'id': 'vat-1',
            'code': 'IVA10',
            'rateBasisPoints': 1000,
            'natureCode': null,
          },
          'price': <String, Object?>{
            'priceListId': 'price-list-1',
            'amountCents': 120,
          },
          'variants': <Object?>[
            <String, Object?>{
              'id': 'variant-1',
              'code': 'DOPPIO',
              'sku': 'CAFFE-DOPPIO',
              'barcode': '800000000002',
              'name': 'Doppio',
              'sortOrder': 10,
              'price': <String, Object?>{
                'priceListId': 'price-list-1',
                'amountCents': 220,
              },
            },
          ],
        },
      ],
    },
  ],
};
