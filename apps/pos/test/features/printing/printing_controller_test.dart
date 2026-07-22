import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/network/backend_error.dart';
import 'package:fluxa_pos/core/storage/secure_store.dart';
import 'package:fluxa_pos/features/printing/data/local_printer_mapping_store.dart';
import 'package:fluxa_pos/features/printing/data/printing_api.dart';
import 'package:fluxa_pos/features/printing/domain/printing_models.dart';
import 'package:fluxa_pos/features/printing/platform/local_printer_backend_contract.dart';
import 'package:fluxa_pos/features/printing/presentation/printing_controller.dart';

void main() {
  test('loads current location and queues an order receipt', () async {
    final gateway = _FakePrintingGateway();
    final controller = PrintingController(
      gateway,
      LocalPrinterMappingStore(MemorySecureKeyValueStore()),
      const _FakeLocalBackend(),
    );

    await controller.bindContext(
      locationId: 'location-1',
      deviceId: 'device-1',
    );
    final success = await controller.requestOrderReceipt('order-1');

    expect(controller.status, PrintingLoadStatus.ready);
    expect(controller.printers.single.id, 'printer-1');
    expect(success, isTrue);
    expect(gateway.orderReceiptRequests, 1);
    controller.dispose();
  });

  test('reloads authoritative job after version conflict', () async {
    final gateway = _FakePrintingGateway(conflictOnRetry: true);
    final controller = PrintingController(
      gateway,
      LocalPrinterMappingStore(MemorySecureKeyValueStore()),
      const _FakeLocalBackend(),
    );
    await controller.bindContext(
      locationId: 'location-1',
      deviceId: 'device-1',
    );
    await controller.selectJob('job-1');

    final success = await controller.retryJob(controller.selectedJob!);

    expect(success, isFalse);
    expect(controller.selectedJob!.version, 3);
    expect(controller.errorMessage, contains('Dati ricaricati'));
    controller.dispose();
  });

  test('clears previous location printing context', () async {
    final gateway = _FakePrintingGateway();
    final controller = PrintingController(
      gateway,
      LocalPrinterMappingStore(MemorySecureKeyValueStore()),
      const _FakeLocalBackend(),
    );
    await controller.bindContext(
      locationId: 'location-1',
      deviceId: 'device-1',
    );

    controller.clearContext();

    expect(controller.locationId, isNull);
    expect(controller.printers, isEmpty);
    expect(controller.jobs, isEmpty);
    controller.dispose();
  });
}

class _FakePrintingGateway implements PrintingGateway {
  _FakePrintingGateway({this.conflictOnRetry = false});

  final bool conflictOnRetry;
  int orderReceiptRequests = 0;

  @override
  Future<PrinterListPage> listPrinters({
    required String locationId,
    PrinterStatus? status,
    int page = 1,
    int pageSize = 100,
  }) async => PrinterListPage(
    page: page,
    pageSize: pageSize,
    total: 1,
    items: [_printer(locationId)],
  );

  @override
  Future<PrintJobPage> listPrintJobs({
    required String locationId,
    String? printerId,
    PrintJobStatus? status,
    int page = 1,
    int pageSize = 100,
  }) async => PrintJobPage(
    page: page,
    pageSize: pageSize,
    total: 1,
    items: [_job(locationId: locationId)],
  );

  @override
  Future<PrintJob> getPrintJob(String jobId) async => _job(version: 3);

  @override
  Future<PrintRequestResult> requestOrderReceipt({
    required String orderId,
    required String clientRequestId,
    int copies = 1,
  }) async {
    orderReceiptRequests += 1;
    return const PrintRequestResult(
      jobs: [
        PrintRequestJob(
          id: 'job-1',
          status: PrintJobStatus.queued,
          printerId: 'printer-1',
          documentType: PrintDocumentType.orderReceipt,
        ),
      ],
    );
  }

  @override
  Future<PrintJob> retryPrintJob({
    required String jobId,
    required String mutationId,
    required int expectedVersion,
  }) async {
    if (conflictOnRetry) {
      throw const BackendError(
        message: 'Conflitto di versione.',
        code: 'PRINT_JOB_VERSION_CONFLICT',
      );
    }
    return _job(status: PrintJobStatus.queued, version: expectedVersion + 1);
  }

  @override
  Future<PrintJob> cancelPrintJob({
    required String jobId,
    required String mutationId,
    required int expectedVersion,
    required String reason,
  }) async =>
      _job(status: PrintJobStatus.cancelled, version: expectedVersion + 1);

  @override
  Future<PrinterDevice> heartbeat({
    required String printerId,
    String? agentVersion,
    String? statusMessage,
  }) async => _printer('location-1');

  @override
  Future<PrintJob?> claimPrintJob({
    required String printerId,
    int leaseSeconds = 60,
  }) async => null;

  @override
  Future<PrintJob> completePrintJob({
    required String jobId,
    required String leaseToken,
  }) async => _job(status: PrintJobStatus.completed);

  @override
  Future<PrintJob> failPrintJob({
    required String jobId,
    required String leaseToken,
    required String errorMessage,
    bool retryable = true,
  }) async => _job(status: PrintJobStatus.failed);

  @override
  Future<PrintRequestResult> requestKitchenTicket({
    required String ticketId,
    required String clientRequestId,
    int copies = 1,
  }) async => const PrintRequestResult(jobs: []);

  @override
  Future<PrintRequestResult> requestPaymentReceipt({
    required String checkoutId,
    required String clientRequestId,
    int copies = 1,
  }) async => const PrintRequestResult(jobs: []);

  @override
  Future<PrintRequestResult> requestTestPage({
    required String printerId,
    required String clientRequestId,
    int copies = 1,
  }) async => const PrintRequestResult(jobs: []);
}

class _FakeLocalBackend implements LocalPrinterBackend {
  const _FakeLocalBackend();

  @override
  bool get isSupported => false;

  @override
  Future<List<String>> listQueues() async => const [];

  @override
  Future<void> printText({
    required String queueName,
    required String text,
    required int copies,
    required bool supportsCut,
  }) async {}
}

PrinterDevice _printer(String locationId) => PrinterDevice(
  id: 'printer-1',
  organizationId: 'organization-1',
  locationId: locationId,
  code: 'CASSA',
  name: 'Cassa Parma',
  purpose: PrinterPurpose.receipt,
  agentDeviceId: 'device-1',
  driver: 'ESC_POS_TEXT',
  paperWidthMm: 80,
  charactersPerLine: 48,
  supportsCut: true,
  supportsDrawer: false,
  status: PrinterStatus.active,
  lastSeenAt: null,
  agentVersion: null,
  statusMessage: null,
  createdAt: DateTime.utc(2026, 7, 21),
  updatedAt: DateTime.utc(2026, 7, 21),
);

PrintJob _job({
  String locationId = 'location-1',
  PrintJobStatus status = PrintJobStatus.failed,
  int version = 2,
}) => PrintJob(
  id: 'job-1',
  organizationId: 'organization-1',
  locationId: locationId,
  printerId: 'printer-1',
  documentType: PrintDocumentType.orderReceipt,
  sourceEntityType: 'order',
  sourceEntityId: 'order-1',
  dedupeKey: 'ORDER_RECEIPT:order-1:request-1',
  payload: const {},
  renderedText: 'FLUXA\nORDINE 0001',
  templateVersion: 1,
  copies: 1,
  status: status,
  priority: 0,
  attempts: 1,
  maxAttempts: 5,
  nextAttemptAt: DateTime.utc(2026, 7, 21),
  claimedByDeviceId: null,
  leaseToken: null,
  leaseExpiresAt: null,
  lastError: status == PrintJobStatus.failed ? 'Carta esaurita' : null,
  version: version,
  completedAt: null,
  cancelledAt: null,
  cancelReason: null,
  createdAt: DateTime.utc(2026, 7, 21),
  updatedAt: DateTime.utc(2026, 7, 21),
  attemptHistory: const [],
);
