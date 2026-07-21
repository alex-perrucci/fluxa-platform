import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/device/domain/device_assignment_models.dart';
import 'package:fluxa_pos/features/hospitality/presentation/kitchen_controller.dart';
import 'package:fluxa_pos/features/orders/data/orders_api.dart';
import 'package:fluxa_pos/features/orders/domain/order_models.dart';
import 'package:fluxa_pos/features/orders/presentation/order_controller.dart';
import 'package:fluxa_pos/features/orders/presentation/orders_screen.dart';

import '../hospitality/fakes.dart';

void main() {
  testWidgets('shows held orders and their resume action', (tester) async {
    final gateway = _WidgetOrdersGateway();
    final controller = OrderController(gateway);
    final kitchenController = KitchenController(FakeHospitalityGateway());
    await controller.bindLocation('location-1');

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: OrdersView(
            controller: controller,
            kitchenController: kitchenController,
            location: const OperationalLocation(
              id: 'location-1',
              code: 'PARMA',
              name: 'Parma Centro',
              timezone: 'Europe/Rome',
              status: 'ACTIVE',
            ),
          ),
        ),
      ),
    );

    expect(find.text('20260721-000001'), findsOneWidget);
    await tester.tap(find.byKey(const Key('order-row-order-1')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('resume-order-button')), findsOneWidget);
    expect(find.text('Caffè espresso'), findsOneWidget);
  });
}

class _WidgetOrdersGateway implements OrdersGateway {
  final OrderDetail order = _heldOrder();

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
  }) async => order;

  @override
  Future<OrderDetail> createOrder({
    required String clientOrderId,
    required String locationId,
    required OrderServiceMode serviceMode,
    String? customerNote,
  }) async => order;

  @override
  Future<OrderDetail> deleteItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
  }) async => order;

  @override
  Future<OrderDetail> getOrder(String orderId) async => order;

  @override
  Future<OrderDetail> hold({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  }) async => order;

  @override
  Future<OrderListPage> listOrders({
    required String locationId,
    OrderStatus? status,
    int page = 1,
    int pageSize = 30,
  }) async => OrderListPage(
    page: page,
    pageSize: pageSize,
    total: 1,
    items: [order.header],
  );

  @override
  Future<OrderDetail> resume({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  }) async => order;

  @override
  Future<OrderDetail> updateItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
    int? quantityAmount,
    String? note,
  }) async => order;
}

OrderDetail _heldOrder() => OrderDetail(
  header: OrderHeader(
    id: 'order-1',
    organizationId: 'organization-1',
    locationId: 'location-1',
    deviceId: 'device-1',
    createdByUserId: 'user-1',
    clientOrderId: 'client-order-1',
    number: '20260721-000001',
    businessDate: '2026-07-21',
    status: OrderStatus.held,
    serviceMode: OrderServiceMode.counter,
    customerNote: null,
    currency: 'EUR',
    version: 3,
    subtotalCents: 120,
    discountCents: 0,
    totalCents: 120,
    netTotalCents: 109,
    taxTotalCents: 11,
    heldAt: DateTime.utc(2026, 7, 21),
    cancelledAt: null,
    cancelReason: null,
    createdAt: DateTime.utc(2026, 7, 21),
    updatedAt: DateTime.utc(2026, 7, 21),
  ),
  items: [
    OrderItem(
      id: 'item-1',
      clientItemId: 'client-item-1',
      productId: 'product-1',
      variantId: null,
      productCodeSnapshot: 'CAFFE',
      productNameSnapshot: 'Caffè espresso',
      variantCodeSnapshot: null,
      variantNameSnapshot: null,
      skuSnapshot: null,
      barcodeSnapshot: null,
      categoryIdSnapshot: 'category-1',
      categoryCodeSnapshot: 'BEVANDE',
      categoryNameSnapshot: 'Bevande',
      unitSnapshot: 'EACH',
      quantityAmount: 1,
      quantityScale: 0,
      unitPriceCents: 120,
      grossTotalCents: 120,
      allocatedDiscountCents: 0,
      finalGrossCents: 120,
      finalNetCents: 109,
      finalTaxCents: 11,
      vatRateIdSnapshot: 'vat-1',
      vatCodeSnapshot: 'IVA10',
      vatRateBasisPointsSnapshot: 1000,
      vatNatureCodeSnapshot: null,
      priceListIdSnapshot: 'price-list-1',
      note: null,
      sortOrder: 0,
      createdAt: DateTime.utc(2026, 7, 21),
      updatedAt: DateTime.utc(2026, 7, 21),
    ),
  ],
  adjustments: const [],
  vatSummaries: const [],
);
