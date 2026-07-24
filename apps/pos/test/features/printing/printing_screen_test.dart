import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/storage/secure_store.dart';
import 'package:fluxa_pos/features/device/domain/device_assignment_models.dart';
import 'package:fluxa_pos/features/printing/data/local_printer_mapping_store.dart';
import 'package:fluxa_pos/features/printing/data/printing_api.dart';
import 'package:fluxa_pos/features/printing/domain/printing_models.dart';
import 'package:fluxa_pos/features/printing/platform/local_printer_backend_contract.dart';
import 'package:fluxa_pos/features/printing/presentation/printing_controller.dart';
import 'package:fluxa_pos/features/printing/presentation/printing_screen.dart';

void main() {
  testWidgets('shows printing queue and local agent state', (tester) async {
    final controller = PrintingController(
      _UnusedGateway(),
      LocalPrinterMappingStore(MemorySecureKeyValueStore()),
      const _UnsupportedBackend(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PrintingView(
            controller: controller,
            location: const OperationalLocation(
              id: 'location-1',
              code: 'PARMA',
              name: 'Parma Centro',
              timezone: 'Europe/Rome',
              status: 'ACTIVE',
            ),
            canManageJobs: false,
          ),
        ),
      ),
    );

    expect(find.text('Stampa'), findsOneWidget);
    expect(find.text('Agente di stampa Android'), findsOneWidget);
    expect(find.text('Coda vuota'), findsOneWidget);
    expect(find.byKey(const Key('printing-agent-switch')), findsOneWidget);
    controller.dispose();
  });

  testWidgets('does not overflow on a compact printing viewport', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 560);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final controller = PrintingController(
      _UnusedGateway(),
      LocalPrinterMappingStore(MemorySecureKeyValueStore()),
      const _SupportedBackend(),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PrintingView(
            controller: controller,
            location: const OperationalLocation(
              id: 'location-1',
              code: 'PARMA',
              name: 'Parma Centro con denominazione molto lunga',
              timezone: 'Europe/Rome',
              status: 'ACTIVE',
            ),
            canManageJobs: true,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const Key('printing-refresh-local-queues')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
  });
}

class _UnsupportedBackend implements LocalPrinterBackend {
  const _UnsupportedBackend();

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

class _SupportedBackend extends _UnsupportedBackend {
  const _SupportedBackend();

  @override
  bool get isSupported => true;
}

class _UnusedGateway implements PrintingGateway {
  Never _unused() => throw UnimplementedError();

  @override
  Future<PrintJob> cancelPrintJob({
    required String jobId,
    required String mutationId,
    required int expectedVersion,
    required String reason,
  }) async => _unused();

  @override
  Future<PrintJob?> claimPrintJob({
    required String printerId,
    int leaseSeconds = 60,
  }) async => _unused();

  @override
  Future<PrintJob> completePrintJob({
    required String jobId,
    required String leaseToken,
  }) async => _unused();

  @override
  Future<PrintJob> failPrintJob({
    required String jobId,
    required String leaseToken,
    required String errorMessage,
    bool retryable = true,
  }) async => _unused();

  @override
  Future<PrintJob> getPrintJob(String jobId) async => _unused();

  @override
  Future<PrinterDevice> heartbeat({
    required String printerId,
    String? agentVersion,
    String? statusMessage,
  }) async => _unused();

  @override
  Future<PrintJobPage> listPrintJobs({
    required String locationId,
    String? printerId,
    PrintJobStatus? status,
    int page = 1,
    int pageSize = 100,
  }) async => _unused();

  @override
  Future<PrinterListPage> listPrinters({
    required String locationId,
    PrinterStatus? status,
    int page = 1,
    int pageSize = 100,
  }) async => _unused();

  @override
  Future<PrintRequestResult> requestKitchenTicket({
    required String ticketId,
    required String clientRequestId,
    int copies = 1,
  }) async => _unused();

  @override
  Future<PrintRequestResult> requestOrderReceipt({
    required String orderId,
    required String clientRequestId,
    int copies = 1,
  }) async => _unused();

  @override
  Future<PrintRequestResult> requestPaymentReceipt({
    required String checkoutId,
    required String clientRequestId,
    int copies = 1,
  }) async => _unused();

  @override
  Future<PrintRequestResult> requestTestPage({
    required String printerId,
    required String clientRequestId,
    int copies = 1,
  }) async => _unused();

  @override
  Future<PrintJob> retryPrintJob({
    required String jobId,
    required String mutationId,
    required int expectedVersion,
  }) async => _unused();
}
