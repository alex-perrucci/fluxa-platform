import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/network/backend_error.dart';
import 'package:fluxa_pos/features/fiscal/data/fiscal_api.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_models.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_runtime.dart';
import 'package:fluxa_pos/features/fiscal/presentation/fiscal_controller.dart';
import 'package:fluxa_pos/features/health/data/health_api.dart';
import 'package:fluxa_pos/features/health/domain/health_models.dart';
import 'package:fluxa_pos/features/orders/data/orders_api.dart';
import 'package:fluxa_pos/features/orders/domain/order_models.dart';

void main() {
  test('loads ADE_WEB production runtime from operational health', () async {
    final fiscal = _FiscalGateway();
    final health = _HealthGateway(
      current: _health(
        provider: FiscalProvider.adeWeb,
        environment: FiscalEnvironment.production,
        autoIssueOnPaid: true,
      ),
    );
    final controller = FiscalController(fiscal, _OrdersGateway(), health);
    addTearDown(controller.dispose);

    await controller.bindLocation('location-1');

    expect(controller.runtime?.status, FiscalRuntimeStatus.ready);
    expect(controller.runtime?.provider, FiscalProvider.adeWeb);
    expect(controller.runtime?.environment, FiscalEnvironment.production);
    expect(controller.runtime?.enabled, isTrue);
    expect(controller.runtime?.autoIssueOnPaid, isTrue);
    expect(controller.ordersToFiscalize.single.id, 'order-location-1');
    expect(health.locationIds, ['location-1']);
  });

  test('blocks lottery code before an ADE_WEB emission starts', () async {
    final fiscal = _FiscalGateway();
    final controller = FiscalController(
      fiscal,
      _OrdersGateway(),
      _HealthGateway(
        current: _health(
          provider: FiscalProvider.adeWeb,
          environment: FiscalEnvironment.production,
          autoIssueOnPaid: true,
        ),
      ),
    );
    addTearDown(controller.dispose);

    await controller.bindLocation('location-1');
    final success = await controller.issueOrder(
      'order-location-1',
      lotteryCode: 'ABCD1234',
    );

    expect(success, isFalse);
    expect(fiscal.issueCalls, 0);
    expect(controller.errorMessage, contains('codice lotteria'));
    expect(controller.errorMessage, contains('non è stata avviata'));
  });

  test(
    'reloads authoritative fiscal document after version conflict',
    () async {
      final fiscal = _FiscalGateway(versionConflict: true);
      final controller = FiscalController(
        fiscal,
        _OrdersGateway(),
        _HealthGateway(current: _health()),
      );
      addTearDown(controller.dispose);
      await controller.bindLocation('location-1');
      fiscal.documents = [
        _document(
          locationId: 'location-1',
          status: FiscalDocumentStatus.rejected,
          version: 2,
        ),
      ];
      await controller.refresh();
      final selected = fiscal.documents.single;

      final success = await controller.retryDocument(selected);
      expect(success, isFalse);
      expect(controller.selectedDocument?.version, 3);
      expect(controller.errorMessage, 'Versione non aggiornata.');
    },
  );

  test('real absence maps to NOT_CONFIGURED', () async {
    final controller = FiscalController(
      _FiscalGateway(),
      _OrdersGateway(),
      _HealthGateway(current: _health(provider: null, enabled: false)),
    );
    addTearDown(controller.dispose);

    await controller.bindLocation('location-1');

    expect(controller.runtime?.status, FiscalRuntimeStatus.notConfigured);
    expect(controller.runtime?.provider, isNull);
    expect(controller.errorMessage, isNull);
  });

  for (final failure in [
    const BackendError(message: 'timeout'),
    const BackendError(message: 'server error', statusCode: 500),
  ]) {
    test(
      'health failure ${failure.statusCode ?? 'timeout'} is verification error',
      () async {
        final controller = FiscalController(
          _FiscalGateway(),
          _OrdersGateway(),
          _HealthGateway(error: failure),
        );
        addTearDown(controller.dispose);

        await controller.bindLocation('location-1');

        expect(
          controller.runtime?.status,
          FiscalRuntimeStatus.verificationError,
        );
        expect(controller.errorMessage, contains('Impossibile verificare'));
        expect(controller.errorMessage, isNot(contains('non è configurata')));
      },
    );
  }

  test('AUTH_REQUIRED remains a distinct runtime state', () async {
    final controller = FiscalController(
      _FiscalGateway(),
      _OrdersGateway(),
      _HealthGateway(
        current: _health(lastDocumentStatus: FiscalDocumentStatus.authRequired),
      ),
    );
    addTearDown(controller.dispose);

    await controller.bindLocation('location-1');

    expect(controller.runtime?.status, FiscalRuntimeStatus.authRequired);
    final issued = await controller.issueOrder('order-location-1');
    expect(issued, isFalse);
    expect(controller.errorMessage, contains('ripristinare l’accesso fiscale'));
  });

  test('UNKNOWN remains attention and is never treated as pending', () async {
    final controller = FiscalController(
      _FiscalGateway(),
      _OrdersGateway(),
      _HealthGateway(
        current: _health(lastDocumentStatus: FiscalDocumentStatus.unknown),
      ),
    );
    addTearDown(controller.dispose);

    await controller.bindLocation('location-1');

    expect(controller.runtime?.status, FiscalRuntimeStatus.attention);
    expect(controller.runtime?.lastDocumentStatus?.isPending, isFalse);
  });

  test('binding a new device location loads the new runtime', () async {
    final health = _HealthGateway(
      current: _health(provider: FiscalProvider.adeWeb),
      byLocation: {
        'location-1': _health(provider: FiscalProvider.adeWeb),
        'location-2': _health(
          provider: FiscalProvider.openapiSmartReceipts,
          environment: FiscalEnvironment.sandbox,
        ),
      },
    );
    final controller = FiscalController(
      _FiscalGateway(),
      _OrdersGateway(),
      health,
    );
    addTearDown(controller.dispose);

    await controller.bindLocation('location-1');
    await controller.bindLocation('location-2');

    expect(controller.locationId, 'location-2');
    expect(controller.runtime?.locationId, 'location-2');
    expect(controller.runtime?.provider, FiscalProvider.openapiSmartReceipts);
    expect(health.locationIds, ['location-1', 'location-2']);
  });

  test('manual refresh replaces the shared runtime snapshot', () async {
    final health = _HealthGateway(
      current: _health(provider: FiscalProvider.adeWeb),
    );
    final controller = FiscalController(
      _FiscalGateway(),
      _OrdersGateway(),
      health,
    );
    addTearDown(controller.dispose);

    await controller.bindLocation('location-1');
    expect(controller.runtime?.provider, FiscalProvider.adeWeb);

    health.current = _health(
      provider: FiscalProvider.acubeSmartReceipts,
      environment: FiscalEnvironment.sandbox,
      autoIssueOnPaid: false,
    );
    await controller.refresh();

    expect(controller.runtime?.provider, FiscalProvider.acubeSmartReceipts);
    expect(controller.runtime?.autoIssueOnPaid, isFalse);
    expect(health.locationIds, ['location-1', 'location-1']);
  });
}

class _HealthGateway implements HealthGateway {
  _HealthGateway({this.current, this.error, this.byLocation = const {}});

  OperationalHealth? current;
  final BackendError? error;
  final Map<String, OperationalHealth> byLocation;
  final List<String> locationIds = [];

  @override
  Future<OperationalHealth> operational({required String locationId}) async {
    locationIds.add(locationId);
    if (error != null) throw error!;
    return byLocation[locationId] ?? current ?? _health();
  }
}

class _FiscalGateway implements FiscalGateway {
  _FiscalGateway({this.versionConflict = false});

  final bool versionConflict;
  int issueCalls = 0;
  List<FiscalDocument> documents = [];

  @override
  Future<FiscalDocumentPage> listDocuments({
    required String locationId,
    FiscalDocumentType? type,
    FiscalDocumentStatus? status,
    int page = 1,
    int pageSize = 100,
  }) async => FiscalDocumentPage(
    page: page,
    pageSize: pageSize,
    total: documents.length,
    items: documents,
  );

  @override
  Future<FiscalDocument> getDocument(String documentId) async => _document(
    locationId: documents.firstOrNull?.locationId ?? 'location-1',
    status: FiscalDocumentStatus.rejected,
    version: 3,
  );

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
  }) async {
    issueCalls += 1;
    final locationId = orderId.startsWith('order-')
        ? orderId.substring('order-'.length)
        : 'location-1';
    final document = _document(
      locationId: locationId,
      status: FiscalDocumentStatus.queued,
      version: 1,
    );
    documents = [document];
    return document;
  }

  @override
  Future<FiscalDocument> retry({
    required String documentId,
    required String mutationId,
    required int expectedVersion,
  }) async {
    if (versionConflict) {
      throw const BackendError(
        code: 'FISCAL_VERSION_CONFLICT',
        message: 'Versione non aggiornata.',
      );
    }
    return _document(
      locationId: documents.firstOrNull?.locationId ?? 'location-1',
      status: FiscalDocumentStatus.queued,
      version: expectedVersion + 1,
    );
  }

  @override
  Future<FiscalDocument> voidDocument({
    required String documentId,
    required String mutationId,
    required int expectedVersion,
    required String reason,
  }) async => _document(
    locationId: documents.firstOrNull?.locationId ?? 'location-1',
    status: FiscalDocumentStatus.queued,
    version: 1,
    type: FiscalDocumentType.voidDocument,
  );
}

class _OrdersGateway implements OrdersGateway {
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
    items: [_order(locationId)],
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
  FiscalProvider? provider = FiscalProvider.acubeSmartReceipts,
  FiscalEnvironment environment = FiscalEnvironment.sandbox,
  bool enabled = true,
  bool autoIssueOnPaid = false,
  FiscalDocumentStatus? lastDocumentStatus,
}) => OperationalHealth(
  generatedAt: DateTime.utc(2026, 8, 20),
  overallStatus: HealthStatus.ok,
  apiStatus: HealthStatus.ok,
  apiLatencyMs: 10,
  printerStatus: HealthStatus.ok,
  printerCount: 1,
  fiscalStatus: provider == null || !enabled
      ? HealthStatus.notConfigured
      : HealthStatus.ok,
  fiscalProvider: provider?.wireValue,
  fiscalEnvironment: provider == null ? null : environment.wireValue,
  fiscalEnabled: provider == null ? null : enabled,
  fiscalAutoIssueOnPaid: provider == null ? false : autoIssueOnPaid,
  fiscalLastDocumentStatus: lastDocumentStatus?.wireValue,
  fiscalErrorCode: null,
  fiscalErrorMessage: null,
  paymentStatus: HealthStatus.ok,
  paymentProvider: 'MANUAL_TERMINAL',
  lastPrintJob: null,
  suggestions: const [],
  raw: const {},
);

OrderHeader _order(String locationId) => OrderHeader(
  id: 'order-$locationId',
  organizationId: 'org-1',
  locationId: locationId,
  deviceId: 'device-1',
  createdByUserId: 'user-1',
  clientOrderId: 'client-$locationId',
  number: '20260820-000001',
  businessDate: '2026-08-20',
  status: OrderStatus.paid,
  serviceMode: OrderServiceMode.counter,
  customerNote: null,
  currency: 'EUR',
  version: 4,
  subtotalCents: 1000,
  discountCents: 0,
  totalCents: 1000,
  netTotalCents: 820,
  taxTotalCents: 180,
  heldAt: null,
  cancelledAt: null,
  cancelReason: null,
  createdAt: DateTime.utc(2026, 8, 20),
  updatedAt: DateTime.utc(2026, 8, 20),
);

FiscalDocument _document({
  required String locationId,
  required FiscalDocumentStatus status,
  required int version,
  FiscalDocumentType type = FiscalDocumentType.sale,
}) => FiscalDocument(
  id: type == FiscalDocumentType.sale ? 'document-1' : 'void-1',
  organizationId: 'org-1',
  locationId: locationId,
  orderId: 'order-$locationId',
  parentDocumentId: type == FiscalDocumentType.voidDocument
      ? 'document-1'
      : null,
  type: type,
  status: status,
  provider: FiscalProvider.acubeSmartReceipts,
  environment: FiscalEnvironment.sandbox,
  fiscalId: '12345678901',
  currency: 'EUR',
  totalCents: 1000,
  cashPaymentCents: 0,
  electronicPaymentCents: 1000,
  externalId: status == FiscalDocumentStatus.issued ? 'acube-1' : null,
  externalStatus: null,
  documentNumber: null,
  documentDate: null,
  errorCode: status == FiscalDocumentStatus.rejected ? 'ACUBE_REJECTED' : null,
  errorMessage: status == FiscalDocumentStatus.rejected ? 'Rifiutato' : null,
  attempts: 1,
  maxAttempts: 5,
  nextAttemptAt: DateTime.utc(2026, 8, 20),
  version: version,
  payload: const {},
  providerResponse: null,
  createdAt: DateTime.utc(2026, 8, 20),
  updatedAt: DateTime.utc(2026, 8, 20),
  issuedAt: null,
  voidedAt: null,
  items: const [],
  vatSummaries: const [],
  attemptHistory: const [],
);
