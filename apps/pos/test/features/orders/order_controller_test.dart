import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/network/backend_error.dart';
import 'package:fluxa_pos/features/catalog/domain/catalog_models.dart';
import 'package:fluxa_pos/features/orders/data/orders_api.dart';
import 'package:fluxa_pos/features/orders/domain/order_models.dart';
import 'package:fluxa_pos/features/orders/presentation/order_controller.dart';

void main() {
  test(
    'creates the backend order lazily when the first item is added',
    () async {
      final gateway = _FakeOrdersGateway();
      final controller = OrderController(gateway);
      await controller.bindLocation('location-1');
      controller.startDraft(serviceMode: OrderServiceMode.counter);

      final added = await controller.addCatalogItem(
        product: _product(),
        quantityAmount: 2,
      );

      expect(added, isTrue);
      expect(gateway.createCalls, 1);
      expect(gateway.addCalls, 1);
      expect(controller.draft, isNull);
      expect(controller.activeOrder?.header.version, 2);
      expect(controller.activeOrder?.items.single.quantityAmount, 2);
    },
  );

  test('reloads the authoritative order after a version conflict', () async {
    final gateway = _FakeOrdersGateway();
    final controller = OrderController(gateway);
    await controller.bindLocation('location-1');
    controller.startDraft(serviceMode: OrderServiceMode.counter);
    await controller.addCatalogItem(product: _product(), quantityAmount: 1);
    final item = controller.activeOrder!.items.single;

    gateway
      ..updateError = const BackendError(
        code: 'ORDER_VERSION_CONFLICT',
        message: 'Versione non aggiornata.',
      )
      ..current = _detail(version: 5, items: [item]);

    final updated = await controller.updateItem(
      item: item,
      quantityAmount: 3,
      note: '',
    );

    expect(updated, isFalse);
    expect(controller.activeOrder?.header.version, 5);
    expect(controller.errorMessage, contains('altro dispositivo'));
  });

  test('cancels the active order with the authoritative version', () async {
    final gateway = _FakeOrdersGateway();
    final controller = OrderController(gateway);
    await controller.bindLocation('location-1');
    expect(await controller.selectOrder('order-1'), isTrue);

    final cancelled = await controller.cancelActiveOrder(
      reason: 'Cliente ha cambiato idea',
    );

    expect(cancelled, isTrue);
    expect(gateway.cancelCalls, 1);
    expect(gateway.cancelReason, 'Cliente ha cambiato idea');
    expect(controller.activeOrder?.header.status, OrderStatus.cancelled);
    expect(controller.noticeMessage, contains('annullato'));
  });

  test('clears draft and active order when the location changes', () async {
    final gateway = _FakeOrdersGateway();
    final controller = OrderController(gateway);
    await controller.bindLocation('location-1');
    controller.startDraft(serviceMode: OrderServiceMode.takeaway);

    await controller.bindLocation('location-2');

    expect(controller.locationId, 'location-2');
    expect(controller.draft, isNull);
    expect(controller.activeOrder, isNull);
  });
}

class _FakeOrdersGateway implements OrdersGateway {
  OrderDetail current = _detail(version: 1, items: const []);
  BackendError? updateError;
  int createCalls = 0;
  int addCalls = 0;
  int cancelCalls = 0;
  String? cancelReason;

  @override
  Future<OrderDetail> addItem({
    required String orderId,
    required String mutationId,
    required String clientItemId,
    required int expectedVersion,
    required String productId,
    String? variantId,
    required int quantityAmount,
    String? note,
  }) async {
    addCalls += 1;
    current = _detail(
      version: expectedVersion + 1,
      items: [_item(quantityAmount: quantityAmount)],
    );
    return current;
  }

  @override
  Future<OrderDetail> addManualItem({
    required String orderId,
    required String mutationId,
    required String clientItemId,
    required int expectedVersion,
    required int amountCents,
    String? description,
    String? note,
  }) async => current;

  @override
  Future<OrderDetail> cancelOrder({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
    String? reason,
  }) async {
    cancelCalls += 1;
    cancelReason = reason;
    current = _detail(
      version: expectedVersion + 1,
      status: OrderStatus.cancelled,
      items: current.items,
    );
    return current;
  }

  @override
  Future<OrderDetail> createOrder({
    required String clientOrderId,
    required String locationId,
    required OrderServiceMode serviceMode,
    String? customerNote,
  }) async {
    createCalls += 1;
    current = _detail(version: 1, items: const [], locationId: locationId);
    return current;
  }

  @override
  Future<OrderDetail> deleteItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
  }) async {
    current = _detail(version: expectedVersion + 1, items: const []);
    return current;
  }

  @override
  Future<OrderDetail> getOrder(String orderId) async => current;

  @override
  Future<OrderDetail> hold({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  }) async {
    current = _detail(
      version: expectedVersion + 1,
      status: OrderStatus.held,
      items: current.items,
    );
    return current;
  }

  @override
  Future<OrderListPage> listOrders({
    required String locationId,
    OrderStatus? status,
    int page = 1,
    int pageSize = 30,
  }) async => OrderListPage(
    page: page,
    pageSize: pageSize,
    total: current.header.locationId == locationId ? 1 : 0,
    items: current.header.locationId == locationId
        ? [current.header]
        : const [],
  );

  @override
  Future<OrderDetail> resume({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  }) async {
    current = _detail(
      version: expectedVersion + 1,
      status: OrderStatus.open,
      items: current.items,
    );
    return current;
  }

  @override
  Future<OrderDetail> updateItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
    int? quantityAmount,
    String? note,
  }) async {
    final error = updateError;
    if (error != null) {
      throw error;
    }
    current = _detail(
      version: expectedVersion + 1,
      items: [
        _item(
          quantityAmount: quantityAmount ?? current.items.single.quantityAmount,
        ),
      ],
    );
    return current;
  }
}

CatalogProduct _product() => const CatalogProduct(
  id: 'product-1',
  code: 'CAFFE',
  sku: 'CAFFE-1',
  barcode: null,
  name: 'Caffè espresso',
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
  price: CatalogPrice(priceListId: 'price-list-1', amountCents: 120),
  variants: [],
);

OrderDetail _detail({
  required int version,
  required List<OrderItem> items,
  String locationId = 'location-1',
  OrderStatus status = OrderStatus.open,
}) {
  final subtotal = items.fold<int>(
    0,
    (sum, item) => sum + item.finalGrossCents,
  );
  return OrderDetail(
    header: OrderHeader(
      id: 'order-1',
      organizationId: 'organization-1',
      locationId: locationId,
      deviceId: 'device-1',
      createdByUserId: 'user-1',
      clientOrderId: 'client-order-1',
      number: '20260721-000001',
      businessDate: '2026-07-21',
      status: status,
      serviceMode: OrderServiceMode.counter,
      customerNote: null,
      currency: 'EUR',
      version: version,
      subtotalCents: subtotal,
      discountCents: 0,
      totalCents: subtotal,
      netTotalCents: subtotal,
      taxTotalCents: 0,
      heldAt: status == OrderStatus.held ? DateTime.utc(2026, 7, 21) : null,
      cancelledAt: status == OrderStatus.cancelled
          ? DateTime.utc(2026, 7, 21, 12)
          : null,
      cancelReason: status == OrderStatus.cancelled ? 'Annullato' : null,
      createdAt: DateTime.utc(2026, 7, 21),
      updatedAt: DateTime.utc(2026, 7, 21),
    ),
    items: items,
    adjustments: const [],
    vatSummaries: const [],
  );
}

OrderItem _item({required int quantityAmount}) => OrderItem(
  id: 'item-1',
  clientItemId: 'client-item-1',
  productId: 'product-1',
  variantId: null,
  productCodeSnapshot: 'CAFFE',
  productNameSnapshot: 'Caffè espresso',
  variantCodeSnapshot: null,
  variantNameSnapshot: null,
  skuSnapshot: 'CAFFE-1',
  barcodeSnapshot: null,
  categoryIdSnapshot: 'category-1',
  categoryCodeSnapshot: 'BEVANDE',
  categoryNameSnapshot: 'Bevande',
  unitSnapshot: 'EACH',
  quantityAmount: quantityAmount,
  quantityScale: 0,
  unitPriceCents: 120,
  grossTotalCents: 120 * quantityAmount,
  allocatedDiscountCents: 0,
  finalGrossCents: 120 * quantityAmount,
  finalNetCents: 120 * quantityAmount,
  finalTaxCents: 0,
  vatRateIdSnapshot: 'vat-1',
  vatCodeSnapshot: 'IVA10',
  vatRateBasisPointsSnapshot: 1000,
  vatNatureCodeSnapshot: null,
  priceListIdSnapshot: 'price-list-1',
  note: null,
  sortOrder: 0,
  createdAt: DateTime.utc(2026, 7, 21),
  updatedAt: DateTime.utc(2026, 7, 21),
);
