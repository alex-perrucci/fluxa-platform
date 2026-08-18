import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/network/backend_error.dart';
import 'package:fluxa_pos/features/fiscal/data/fiscal_api.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_models.dart';
import 'package:fluxa_pos/features/fiscal/presentation/fiscal_controller.dart';
import 'package:fluxa_pos/features/orders/data/orders_api.dart';
import 'package:fluxa_pos/features/orders/domain/order_models.dart';

void main() {
  test('loads profile, paid orders and issues idempotent sale', () async {
    final fiscal = _FiscalGateway();
    final controller = FiscalController(fiscal, _OrdersGateway());
    addTearDown(controller.dispose);

    await controller.bindLocation('location-1');
    expect(controller.profile?.environment, FiscalEnvironment.sandbox);
    expect(controller.ordersToFiscalize.single.id, 'order-1');

    final success = await controller.issueOrder('order-1');
    expect(success, isTrue);
    expect(fiscal.issueCalls, 1);
    expect(
      controller.documentForOrder('order-1')?.status,
      FiscalDocumentStatus.queued,
    );
  });

  test(
    'reloads authoritative fiscal document after version conflict',
    () async {
      final fiscal = _FiscalGateway(versionConflict: true);
      final controller = FiscalController(fiscal, _OrdersGateway());
      addTearDown(controller.dispose);
      await controller.bindLocation('location-1');
      fiscal.documents = [
        _document(status: FiscalDocumentStatus.rejected, version: 2),
      ];
      await controller.refresh();
      final selected = fiscal.documents.single;

      final success = await controller.retryDocument(selected);
      expect(success, isFalse);
      expect(controller.selectedDocument?.version, 3);
      expect(controller.errorMessage, 'Versione non aggiornata.');
    },
  );
}

class _FiscalGateway implements FiscalGateway {
  _FiscalGateway({this.versionConflict = false});
  final bool versionConflict;
  int issueCalls = 0;
  List<FiscalDocument> documents = [];

  @override
  Future<FiscalProfile?> getProfile(String locationId) async => _profile();

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
  }) async => _profile();

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
  Future<FiscalDocument> getDocument(String documentId) async =>
      _document(status: FiscalDocumentStatus.rejected, version: 3);

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
    final document = _document(status: FiscalDocumentStatus.queued, version: 1);
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
    items: [_order()],
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

FiscalProfile _profile() => FiscalProfile(
  id: 'profile-1',
  organizationId: 'org-1',
  locationId: 'location-1',
  provider: FiscalProvider.acubeSmartReceipts,
  environment: FiscalEnvironment.sandbox,
  fiscalId: '12345678901',
  enabled: true,
  autoIssueOnPaid: false,
  receiptEmail: null,
  displayName: 'Demo',
  version: 1,
  createdAt: DateTime.utc(2026, 7, 22),
  updatedAt: DateTime.utc(2026, 7, 22),
);

OrderHeader _order() => OrderHeader(
  id: 'order-1',
  organizationId: 'org-1',
  locationId: 'location-1',
  deviceId: 'device-1',
  createdByUserId: 'user-1',
  clientOrderId: 'client-1',
  number: '20260722-000001',
  businessDate: '2026-07-22',
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
  createdAt: DateTime.utc(2026, 7, 22),
  updatedAt: DateTime.utc(2026, 7, 22),
);

FiscalDocument _document({
  required FiscalDocumentStatus status,
  required int version,
  FiscalDocumentType type = FiscalDocumentType.sale,
}) => FiscalDocument(
  id: type == FiscalDocumentType.sale ? 'document-1' : 'void-1',
  organizationId: 'org-1',
  locationId: 'location-1',
  orderId: 'order-1',
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
  nextAttemptAt: DateTime.utc(2026, 7, 22),
  version: version,
  payload: const {},
  providerResponse: null,
  createdAt: DateTime.utc(2026, 7, 22),
  updatedAt: DateTime.utc(2026, 7, 22),
  issuedAt: null,
  voidedAt: null,
  items: const [],
  vatSummaries: const [],
  attemptHistory: const [],
);
