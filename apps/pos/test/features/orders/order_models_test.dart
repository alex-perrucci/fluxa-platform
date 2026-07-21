import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/orders/domain/order_models.dart';

void main() {
  test('parses the complete backend order snapshot', () {
    final order = OrderDetail.fromJson(_orderPayload());

    expect(order.header.number, '20260721-000001');
    expect(order.header.status, OrderStatus.open);
    expect(order.header.serviceMode, OrderServiceMode.counter);
    expect(order.header.version, 2);
    expect(order.items.single.displayName, 'Caffè espresso · Doppio');
    expect(order.items.single.displayQuantity, '2');
    expect(order.header.totalCents, 440);
    expect(order.vatSummaries.single.taxCents, 40);
  });

  test('parses paginated order headers', () {
    final page = OrderListPage.fromJson({
      'page': 1,
      'pageSize': 30,
      'total': 1,
      'items': [
        _orderPayload()
          ..remove('items')
          ..remove('adjustments')
          ..remove('vatSummaries'),
      ],
    });

    expect(page.total, 1);
    expect(page.items.single.status, OrderStatus.open);
  });
}

Map<String, Object?> _orderPayload() => {
  'id': '11111111-1111-4111-8111-111111111111',
  'organizationId': '22222222-2222-4222-8222-222222222222',
  'locationId': '33333333-3333-4333-8333-333333333333',
  'deviceId': '44444444-4444-4444-8444-444444444444',
  'createdByUserId': '55555555-5555-4555-8555-555555555555',
  'clientOrderId': '66666666-6666-4666-8666-666666666666',
  'number': '20260721-000001',
  'businessDate': '2026-07-21',
  'status': 'OPEN',
  'serviceMode': 'COUNTER',
  'customerNote': null,
  'currency': 'EUR',
  'version': 2,
  'subtotalCents': 440,
  'discountCents': 0,
  'totalCents': 440,
  'netTotalCents': 400,
  'taxTotalCents': 40,
  'heldAt': null,
  'cancelledAt': null,
  'cancelReason': null,
  'createdAt': '2026-07-21T10:00:00.000Z',
  'updatedAt': '2026-07-21T10:01:00.000Z',
  'items': [
    {
      'id': '77777777-7777-4777-8777-777777777777',
      'clientItemId': '88888888-8888-4888-8888-888888888888',
      'productId': '99999999-9999-4999-8999-999999999999',
      'variantId': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'productCodeSnapshot': 'CAFFE',
      'productNameSnapshot': 'Caffè espresso',
      'variantCodeSnapshot': 'DOPPIO',
      'variantNameSnapshot': 'Doppio',
      'skuSnapshot': 'CAFFE-DOPPIO',
      'barcodeSnapshot': null,
      'categoryIdSnapshot': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'categoryCodeSnapshot': 'BEVANDE',
      'categoryNameSnapshot': 'Bevande',
      'unitSnapshot': 'EACH',
      'quantityAmount': 2,
      'quantityScale': 0,
      'unitPriceCents': 220,
      'grossTotalCents': 440,
      'allocatedDiscountCents': 0,
      'finalGrossCents': 440,
      'finalNetCents': 400,
      'finalTaxCents': 40,
      'vatRateIdSnapshot': 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'vatCodeSnapshot': 'IVA10',
      'vatRateBasisPointsSnapshot': 1000,
      'vatNatureCodeSnapshot': null,
      'priceListIdSnapshot': 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'note': null,
      'sortOrder': 0,
      'createdAt': '2026-07-21T10:01:00.000Z',
      'updatedAt': '2026-07-21T10:01:00.000Z',
    },
  ],
  'adjustments': [],
  'vatSummaries': [
    {
      'vatKey': 'RATE:1000',
      'vatRateBasisPoints': 1000,
      'vatNatureCode': null,
      'grossCents': 440,
      'netCents': 400,
      'taxCents': 40,
    },
  ],
};
