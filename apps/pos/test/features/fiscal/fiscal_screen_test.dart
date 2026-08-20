import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/fiscal/data/fiscal_api.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_models.dart';
import 'package:fluxa_pos/features/fiscal/presentation/fiscal_controller.dart';
import 'package:fluxa_pos/features/fiscal/presentation/fiscal_screen.dart';
import 'package:fluxa_pos/features/health/data/health_api.dart';
import 'package:fluxa_pos/features/health/domain/health_models.dart';
import 'package:fluxa_pos/features/orders/data/orders_api.dart';
import 'package:fluxa_pos/features/orders/domain/order_models.dart';

void main() {
  testWidgets('shows A-Cube sandbox from operational runtime', (tester) async {
    final controller = _controller(provider: FiscalProvider.acubeSmartReceipts);
    addTearDown(controller.dispose);
    await controller.bindLocation('location-1');

    await _pumpFiscalView(tester, controller);

    expect(find.text('A-Cube Smart Receipts · Sandbox'), findsOneWidget);
    expect(find.text('Stato fiscale della sede'), findsOneWidget);
    expect(find.byKey(const Key('configure-acube-sandbox-button')), findsNothing);
    expect(
      find.text(
        'Le impostazioni tecniche del provider sono gestite dal Platform Control Center.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('keeps OpenAPI configuration managed by the platform', (
    tester,
  ) async {
    final controller = _controller(provider: FiscalProvider.openapiSmartReceipts);
    addTearDown(controller.dispose);
    await controller.bindLocation('location-1');

    await _pumpFiscalView(tester, controller);

    expect(find.text('OpenAPI Smart Receipts · Sandbox'), findsOneWidget);
    expect(find.byKey(const Key('configure-acube-sandbox-button')), findsNothing);
  });

  testWidgets('renders ADE_WEB production runtime without technical controls', (
    tester,
  ) async {
    final controller = _controller(
      provider: FiscalProvider.adeWeb,
      environment: FiscalEnvironment.production,
      autoIssueOnPaid: true,
    );
    addTearDown(controller.dispose);
    await controller.bindLocation('location-1');

    await _pumpFiscalView(tester, controller);

    expect(find.text('Agenzia delle Entrate · Produzione'), findsOneWidget);
    expect(find.text('Emissione automatica al pagamento: attiva'), findsOneWidget);
    expect(find.textContaining('Partita IVA'), findsNothing);
    expect(find.byKey(const Key('configure-acube-sandbox-button')), findsNothing);
  });
}

Future<void> _pumpFiscalView(
  WidgetTester tester,
  FiscalController controller,
) async {
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
}

FiscalController _controller({
  FiscalProvider provider = FiscalProvider.acubeSmartReceipts,
  FiscalEnvironment environment = FiscalEnvironment.sandbox,
  bool autoIssueOnPaid = false,
}) => FiscalController(
  _FiscalGateway(),
  _OrdersGateway(),
  _HealthGateway(
    _health(
      provider: provider,
      environment: environment,
      autoIssueOnPaid: autoIssueOnPaid,
    ),
  ),
);

class _HealthGateway implements HealthGateway {
  _HealthGateway(this.health);
  final OperationalHealth health;

  @override
  Future<OperationalHealth> operational({required String locationId}) async =>
      health;
}

class _FiscalGateway implements FiscalGateway {
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
  }) async => const OrderListPage(
    page: 1,
    pageSize: 100,
    total: 0,
    items: [],
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

OperationalHealth _health({
  required FiscalProvider provider,
  required FiscalEnvironment environment,
  required bool autoIssueOnPaid,
}) => OperationalHealth(
  generatedAt: DateTime.utc(2026, 8, 20),
  overallStatus: HealthStatus.ok,
  apiStatus: HealthStatus.ok,
  apiLatencyMs: 10,
  printerStatus: HealthStatus.ok,
  printerCount: 1,
  fiscalStatus: HealthStatus.ok,
  fiscalProvider: provider.wireValue,
  fiscalEnvironment: environment.wireValue,
  fiscalEnabled: true,
  fiscalAutoIssueOnPaid: autoIssueOnPaid,
  fiscalLastDocumentStatus: 'ISSUED',
  fiscalErrorCode: null,
  fiscalErrorMessage: null,
  paymentStatus: HealthStatus.ok,
  paymentProvider: 'MANUAL_TERMINAL',
  lastPrintJob: null,
  suggestions: const [],
  raw: const {},
);
