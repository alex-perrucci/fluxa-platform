import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/catalog/data/catalog_api.dart';
import 'package:fluxa_pos/features/catalog/domain/catalog_models.dart';
import 'package:fluxa_pos/features/catalog/presentation/catalog_controller.dart';
import 'package:fluxa_pos/features/catalog/presentation/catalog_screen.dart';
import 'package:fluxa_pos/features/device/domain/device_assignment_models.dart';
import 'package:fluxa_pos/features/orders/data/orders_api.dart';
import 'package:fluxa_pos/features/orders/domain/order_models.dart';
import 'package:fluxa_pos/features/orders/presentation/order_controller.dart';

void main() {
  testWidgets('shows products and filters by variant barcode', (tester) async {
    final controller = CatalogController(_FakeGateway());
    final orderController = OrderController(_NoopOrdersGateway());
    await controller.load('location-1');

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CatalogView(
            controller: controller,
            orderController: orderController,
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

    expect(find.text('Caffè espresso'), findsOneWidget);
    expect(find.text('Acqua'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('catalog-search-field')),
      'variant-only-barcode',
    );
    await tester.pump();

    expect(find.text('Caffè espresso'), findsOneWidget);
    expect(find.text('Acqua'), findsNothing);
  });
}

class _FakeGateway implements CatalogGateway {
  @override
  Future<CatalogSnapshot> fetchCatalog({
    required String locationId,
    String? query,
  }) async => CatalogSnapshot(
    locationId: locationId,
    currency: 'EUR',
    priceListIds: const ['price-list-1'],
    categories: const [
      CatalogCategory(
        id: 'category-1',
        code: 'BEVANDE',
        name: 'Bevande',
        sortOrder: 10,
        products: [
          CatalogProduct(
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
            variants: [
              CatalogVariant(
                id: 'variant-1',
                code: 'DOPPIO',
                sku: null,
                barcode: 'variant-only-barcode',
                name: 'Doppio',
                sortOrder: 10,
                price: CatalogPrice(
                  priceListId: 'price-list-1',
                  amountCents: 220,
                ),
              ),
            ],
          ),
          CatalogProduct(
            id: 'product-2',
            code: 'ACQUA',
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
            price: CatalogPrice(priceListId: 'price-list-1', amountCents: 150),
            variants: [],
          ),
        ],
      ),
    ],
  );
}

class _NoopOrdersGateway implements OrdersGateway {
  Never _unsupported() =>
      throw UnsupportedError('Not used by this widget test.');

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
  }) async => _unsupported();

  @override
  Future<OrderDetail> addManualItem({
    required String orderId,
    required String mutationId,
    required String clientItemId,
    required int expectedVersion,
    required int amountCents,
    String? description,
    String? note,
  }) async => _unsupported();

  @override
  Future<OrderDetail> createOrder({
    required String clientOrderId,
    required String locationId,
    required OrderServiceMode serviceMode,
    String? customerNote,
  }) async => _unsupported();

  @override
  Future<OrderDetail> deleteItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
  }) async => _unsupported();

  @override
  Future<OrderDetail> getOrder(String orderId) async => _unsupported();

  @override
  Future<OrderDetail> hold({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  }) async => _unsupported();

  @override
  Future<OrderListPage> listOrders({
    required String locationId,
    OrderStatus? status,
    int page = 1,
    int pageSize = 30,
  }) async => _unsupported();

  @override
  Future<OrderDetail> resume({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  }) async => _unsupported();

  @override
  Future<OrderDetail> updateItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
    int? quantityAmount,
    String? note,
  }) async => _unsupported();
}
