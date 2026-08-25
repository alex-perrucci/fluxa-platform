import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/offline/offline_sale_models.dart';
import 'package:fluxa_pos/features/catalog/domain/catalog_models.dart';

void main() {
  test('offline sale keeps the cached monetary snapshot and cash amount', () {
    final snapshot = CatalogSnapshot.fromJson(_catalogJson());
    final product = snapshot.products.single;
    final line = OfflineSaleLine.fromCatalog(
      snapshot: snapshot,
      product: product,
      quantityAmount: 2,
    );
    final draft = OfflineSaleDraft.empty(
      locationId: snapshot.locationId,
      currency: snapshot.currency,
    ).copyWith(items: [line]);

    expect(line.grossCents, 300);
    expect(line.taxCents, 27);
    expect(line.netCents, 273);
    expect(draft.totalCents, 300);
    expect(draft.netTotalCents + draft.taxTotalCents, draft.totalCents);

    final replay = draft.toReplayJson(tenderedCents: 500);
    expect(replay['serviceMode'], 'COUNTER');
    expect(replay['locationId'], 'location-1');
    final payment = replay['payment']! as Map<String, Object?>;
    expect(payment['method'], 'CASH');
    expect(payment['provider'], 'CASH');
    expect(payment['amountCents'], 300);
    expect(payment['tenderedCents'], 500);
  });

  test('draft serialization preserves stable replay identifiers', () {
    final snapshot = CatalogSnapshot.fromJson(_catalogJson());
    final original = OfflineSaleDraft.empty(
      locationId: snapshot.locationId,
      currency: snapshot.currency,
    ).copyWith(
      items: [
        OfflineSaleLine.fromCatalog(
          snapshot: snapshot,
          product: snapshot.products.single,
          quantityAmount: 1,
        ),
      ],
    );

    final restored = OfflineSaleDraft.fromJson(original.toJson());

    expect(restored.saleId, original.saleId);
    expect(restored.clientOrderId, original.clientOrderId);
    expect(restored.clientCheckoutId, original.clientCheckoutId);
    expect(restored.clientPaymentId, original.clientPaymentId);
    expect(restored.items.single.clientItemId, original.items.single.clientItemId);
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
