import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/fiscal/data/fiscal_api.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_models.dart';
import 'package:fluxa_pos/features/fiscal/presentation/fiscal_controller.dart';
import 'package:fluxa_pos/features/fiscal/presentation/fiscal_screen.dart';
import 'package:fluxa_pos/features/orders/data/orders_api.dart';
import 'package:fluxa_pos/features/orders/domain/order_models.dart';

void main() {
  testWidgets('shows A-Cube sandbox and paid order pending fiscalization', (
    tester,
  ) async {
    final controller = FiscalController(_FiscalGateway(), _OrdersGateway());
    addTearDown(controller.dispose);
    await controller.bindLocation('location-1');

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FiscalView(
            controller: controller,
            locationName: 'Parma',
            role: 'OWNER',
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('A-Cube Smart Receipts · Sandbox'), findsOneWidget);
    expect(find.text('Ordini pagati da fiscalizzare'), findsOneWidget);
    expect(
      find.byKey(const Key('fiscal-pending-order-order-1')),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('configure-acube-sandbox-button')),
      findsOneWidget,
    );
  });

  testWidgets('keeps OpenAPI configuration managed by the platform', (
    tester,
  ) async {
    final controller = FiscalController(
      _FiscalGateway(provider: FiscalProvider.openapiSmartReceipts),
      _OrdersGateway(),
    );
    addTearDown(controller.dispose);
    await controller.bindLocation('location-1');

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FiscalView(
            controller: controller,
            locationName: 'Bar Latino',
            role: 'OWNER',
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('OpenAPI Smart Receipts · Sandbox'), findsOneWidget);
    expect(
      find.text('Configurazione OpenAPI gestita dal Platform Control Center.'),
      findsOneWidget,
    );
    expect(
      find.byKey(const Key('configure-acube-sandbox-button')),
      findsNothing,
    );
  });
}

class _FiscalGateway implements FiscalGateway {
  _FiscalGateway({this.provider = FiscalProvider.acubeSmartReceipts});

  final FiscalProvider provider;

  @override
  Future<FiscalProfile?> getProfile(String locationId) async => FiscalProfile(
    id: 'p1',
    organizationId: 'o1',
    locationId: locationId,
    provider: provider,
    environment: FiscalEnvironment.sandbox,
    fiscalId: '12345678901',
    enabled: true,
    autoIssueOnPaid: false,
    receiptEmail: null,
    displayName: null,
    version: 1,
    createdAt: DateTime.utc(2026),
    updatedAt: DateTime.utc(2026),
  );

  @override
  Future<FiscalDocumentPage> listDocuments({
    required String locationId,
    FiscalDocumentType? type,
    FiscalDocumentStatus? status,
    int page = 1,
    int pageSize = 100,
  }) async =>
      FiscalDocumentPage(page: 1, pageSize: 100, total: 0, items: const []);

  @override
  Future<FiscalProfile> upsertProfile({
    required String locationId,
    required FiscalProvider provider,
    required FiscalEnvironment environment,
    required String fiscalId,
    required bool enabled,
    required bool autoIssueOnPaid,
    String? receiptEmail,
    String? displayName,
  }) => throw UnimplementedError();

  @override
  Future<FiscalDocument> getDocument(String documentId) =>
      throw UnimplementedError();

  @override
  Future<FiscalReceiptPdfData> downloadReceiptPdf(String documentId) async =>
      FiscalReceiptPdfData(
        bytes: Uint8List.fromList('%PDF-1.7'.codeUnits),
        filename: 'scontrino.pdf',
      );

  @override
  Future<FiscalDocument> issue({
    required String orderId,
    required String clientRequestId,
    String? lotteryCode,
  }) => throw UnimplementedError();

  @override
  Future<FiscalDocument> retry({
    required String documentId,
    required String mutationId,
    required int expectedVersion,
  }) => throw UnimplementedError();

  @override
  Future<FiscalDocument> voidDocument({
    required String documentId,
    required String mutationId,
    required int expectedVersion,
    required String reason,
  }) => throw UnimplementedError();
}

class _OrdersGateway implements OrdersGateway {
  @override
  Future<OrderListPage> listOrders({
    required String locationId,
    OrderStatus? status,
    int page = 1,
    int pageSize = 30,
  }) async => OrderListPage(
    page: 1,
    pageSize: 100,
    total: 1,
    items: [
      OrderHeader(
        id: 'order-1',
        organizationId: 'o1',
        locationId: locationId,
        deviceId: 'd1',
        createdByUserId: 'u1',
        clientOrderId: 'c1',
        number: '20260722-000001',
        businessDate: '2026-07-22',
        status: OrderStatus.paid,
        serviceMode: OrderServiceMode.counter,
        customerNote: null,
        currency: 'EUR',
        version: 1,
        subtotalCents: 1000,
        discountCents: 0,
        totalCents: 1000,
        netTotalCents: 820,
        taxTotalCents: 180,
        heldAt: null,
        cancelledAt: null,
        cancelReason: null,
        createdAt: DateTime.utc(2026),
        updatedAt: DateTime.utc(2026),
      ),
    ],
  );

  @override
  Future<OrderDetail> getOrder(String orderId) => throw UnimplementedError();

  @override
  Future<OrderDetail> createOrder({
    required String clientOrderId,
    required String locationId,
    required OrderServiceMode serviceMode,
    String? customerNote,
  }) => throw UnimplementedError();

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
  }) => throw UnimplementedError();

  @override
  Future<OrderDetail> addManualItem({
    required String orderId,
    required String mutationId,
    required String clientItemId,
    required int expectedVersion,
    required int amountCents,
    String? description,
    String? note,
  }) => throw UnimplementedError();

  @override
  Future<OrderDetail> cancelOrder({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
    String? reason,
  }) => throw UnimplementedError();

  @override
  Future<OrderDetail> updateItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
    int? quantityAmount,
    String? note,
  }) => throw UnimplementedError();

  @override
  Future<OrderDetail> deleteItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
  }) => throw UnimplementedError();

  @override
  Future<OrderDetail> hold({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  }) => throw UnimplementedError();

  @override
  Future<OrderDetail> resume({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  }) => throw UnimplementedError();
}
