import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/network/backend_error.dart';
import '../../orders/domain/uuid_v4.dart';
import '../data/local_printer_mapping_store.dart';
import '../data/printing_api.dart';
import '../domain/printing_models.dart';
import '../platform/local_printer_backend_contract.dart';

enum PrintingLoadStatus { idle, loading, ready, failure }

class PrintingController extends ChangeNotifier {
  PrintingController(this._gateway, this._mappingStore, this._localBackend);

  final PrintingGateway _gateway;
  final LocalPrinterMappingStore _mappingStore;
  final LocalPrinterBackend _localBackend;

  String? _locationId;
  String? _deviceId;
  List<PrinterDevice> _printers = const [];
  List<PrintJob> _jobs = const [];
  PrintJob? _selectedJob;
  PrintingLoadStatus _status = PrintingLoadStatus.idle;
  PrintJobStatus? _statusFilter;
  String? _printerFilterId;
  bool _busy = false;
  bool _agentEnabled = false;
  bool _agentPolling = false;
  String? _errorMessage;
  String? _noticeMessage;
  String? _agentMessage;
  DateTime? _lastAgentPollAt;
  List<String> _localQueues = const [];
  Map<String, String> _queueMappings = const {};
  final Map<String, DateTime> _lastHeartbeatAt = {};
  Timer? _pollTimer;
  int _requestVersion = 0;
  bool _disposed = false;

  String? get locationId => _locationId;
  String? get deviceId => _deviceId;
  List<PrinterDevice> get printers => _printers;
  List<PrintJob> get jobs => _jobs;
  PrintJob? get selectedJob => _selectedJob;
  PrintingLoadStatus get status => _status;
  PrintJobStatus? get statusFilter => _statusFilter;
  String? get printerFilterId => _printerFilterId;
  bool get busy => _busy;
  bool get agentEnabled => _agentEnabled;
  bool get agentPolling => _agentPolling;
  bool get agentSupported => _localBackend.isSupported;
  String? get errorMessage => _errorMessage;
  String? get noticeMessage => _noticeMessage;
  String? get agentMessage => _agentMessage;
  DateTime? get lastAgentPollAt => _lastAgentPollAt;
  List<String> get localQueues => _localQueues;
  Map<String, String> get queueMappings =>
      Map<String, String>.unmodifiable(_queueMappings);

  List<PrinterDevice> get assignedPrinters => _printers
      .where((printer) => printer.isAssignedTo(_deviceId))
      .toList(growable: false);

  bool get canEnableAgent =>
      agentSupported &&
      assignedPrinters.any(
        (printer) => (_queueMappings[printer.id]?.isNotEmpty ?? false),
      );

  String? queueFor(String printerId) => _queueMappings[printerId];

  String connectionLabel(String printerId) =>
      localPrinterTargetLabel(_queueMappings[printerId]);

  String printerName(String printerId) {
    for (final printer in _printers) {
      if (printer.id == printerId) {
        return printer.name;
      }
    }
    return printerId;
  }

  Future<void> bindContext({
    required String locationId,
    required String deviceId,
  }) async {
    if (_locationId == locationId &&
        _deviceId == deviceId &&
        _status != PrintingLoadStatus.idle) {
      return;
    }

    _requestVersion += 1;
    _stopPolling();
    _locationId = locationId;
    _deviceId = deviceId;
    _printers = const [];
    _jobs = const [];
    _selectedJob = null;
    _statusFilter = null;
    _printerFilterId = null;
    _errorMessage = null;
    _noticeMessage = null;
    _agentMessage = null;
    _localQueues = const [];
    _queueMappings = const {};
    _status = PrintingLoadStatus.loading;
    _notify();

    final requestVersion = _requestVersion;
    try {
      _agentEnabled = await _mappingStore.readAgentEnabled();
      if (!_localBackend.isSupported) {
        _agentEnabled = false;
      }
      if (_localBackend.isSupported) {
        _localQueues = await _localBackend.listQueues();
      }
      final printerPage = await _gateway.listPrinters(locationId: locationId);
      if (!_isCurrent(requestVersion, locationId, deviceId)) {
        return;
      }
      _assertPrinterLocations(printerPage.items, locationId);
      _printers = printerPage.items;
      await _loadQueueMappings();
      final jobPage = await _gateway.listPrintJobs(locationId: locationId);
      if (!_isCurrent(requestVersion, locationId, deviceId)) {
        return;
      }
      _assertJobLocations(jobPage.items, locationId);
      _jobs = jobPage.items;
      _status = PrintingLoadStatus.ready;
      if (_agentEnabled) {
        if (canEnableAgent) {
          _startPolling();
        } else {
          _agentMessage =
              'Agente sospeso: configura una connessione Wi-Fi o Bluetooth per almeno una stampante assegnata.';
        }
      }
    } on BackendError catch (error) {
      if (!_isCurrent(requestVersion, locationId, deviceId)) {
        return;
      }
      _status = PrintingLoadStatus.failure;
      _errorMessage = error.message;
    } on FormatException {
      if (!_isCurrent(requestVersion, locationId, deviceId)) {
        return;
      }
      _status = PrintingLoadStatus.failure;
      _errorMessage = 'Il backend ha restituito dati di stampa non validi.';
    } catch (error) {
      if (!_isCurrent(requestVersion, locationId, deviceId)) {
        return;
      }
      _status = PrintingLoadStatus.failure;
      _errorMessage = 'Impossibile inizializzare la stampa: $error';
    }
    _notify();
  }

  void clearContext() {
    _requestVersion += 1;
    _stopPolling();
    _locationId = null;
    _deviceId = null;
    _printers = const [];
    _jobs = const [];
    _selectedJob = null;
    _status = PrintingLoadStatus.idle;
    _statusFilter = null;
    _printerFilterId = null;
    _busy = false;
    _agentPolling = false;
    _errorMessage = null;
    _noticeMessage = null;
    _agentMessage = null;
    _localQueues = const [];
    _queueMappings = const {};
    _lastHeartbeatAt.clear();
    _notify();
  }

  Future<void> refresh() async {
    final currentLocationId = _locationId;
    final currentDeviceId = _deviceId;
    if (currentLocationId == null || currentDeviceId == null) {
      return;
    }
    final requestVersion = ++_requestVersion;
    _status = PrintingLoadStatus.loading;
    _errorMessage = null;
    _notify();
    try {
      final printerPage = await _gateway.listPrinters(
        locationId: currentLocationId,
      );
      if (!_isCurrent(requestVersion, currentLocationId, currentDeviceId)) {
        return;
      }
      _assertPrinterLocations(printerPage.items, currentLocationId);
      _printers = printerPage.items;
      await _loadQueueMappings();
      final jobPage = await _gateway.listPrintJobs(
        locationId: currentLocationId,
        printerId: _printerFilterId,
        status: _statusFilter,
      );
      if (!_isCurrent(requestVersion, currentLocationId, currentDeviceId)) {
        return;
      }
      _assertJobLocations(jobPage.items, currentLocationId);
      _jobs = jobPage.items;
      if (_selectedJob != null) {
        _selectedJob = await _gateway.getPrintJob(_selectedJob!.id);
      }
      _status = PrintingLoadStatus.ready;
      if (_agentEnabled && canEnableAgent) {
        _startPolling();
      }
    } on BackendError catch (error) {
      _status = PrintingLoadStatus.failure;
      _errorMessage = error.message;
    } on FormatException {
      _status = PrintingLoadStatus.failure;
      _errorMessage = 'Il backend ha restituito dati di stampa non validi.';
    } catch (_) {
      _status = PrintingLoadStatus.failure;
      _errorMessage = 'Impossibile aggiornare stampanti e coda.';
    }
    _notify();
  }

  Future<void> refreshJobs() async {
    final currentLocationId = _locationId;
    if (currentLocationId == null) {
      return;
    }
    _status = PrintingLoadStatus.loading;
    _errorMessage = null;
    _notify();
    try {
      final page = await _gateway.listPrintJobs(
        locationId: currentLocationId,
        printerId: _printerFilterId,
        status: _statusFilter,
      );
      if (_locationId != currentLocationId) {
        return;
      }
      _assertJobLocations(page.items, currentLocationId);
      _jobs = page.items;
      _status = PrintingLoadStatus.ready;
    } on BackendError catch (error) {
      _status = PrintingLoadStatus.failure;
      _errorMessage = error.message;
    } catch (_) {
      _status = PrintingLoadStatus.failure;
      _errorMessage = 'Impossibile aggiornare la coda di stampa.';
    }
    _notify();
  }

  Future<void> refreshLocalQueues() async {
    if (!_localBackend.isSupported || _busy) {
      return;
    }
    _setBusy();
    try {
      _localQueues = await _localBackend.listQueues();
      _noticeMessage =
          '${_localQueues.length} stampanti Bluetooth abbinate rilevate.';
    } catch (error) {
      _errorMessage =
          'Impossibile leggere le stampanti Bluetooth abbinate: $error';
    } finally {
      _finishBusy();
    }
  }

  Future<void> setStatusFilter(PrintJobStatus? status) async {
    if (_statusFilter == status) {
      return;
    }
    _statusFilter = status;
    await refreshJobs();
  }

  Future<void> setPrinterFilter(String? printerId) async {
    if (_printerFilterId == printerId) {
      return;
    }
    _printerFilterId = printerId;
    await refreshJobs();
  }

  Future<bool> selectJob(String jobId) async {
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      final job = await _gateway.getPrintJob(jobId);
      if (job.locationId != _locationId) {
        throw const BackendError(
          message: 'Il lavoro appartiene a una location diversa.',
        );
      }
      _selectedJob = job;
      return true;
    } on BackendError catch (error) {
      _errorMessage = error.message;
      return false;
    } on FormatException {
      _errorMessage =
          'Il backend ha restituito un lavoro di stampa non valido.';
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile aprire il lavoro di stampa.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  void closeJob() {
    if (_busy) {
      return;
    }
    _selectedJob = null;
    _notify();
  }

  Future<void> setQueueMapping(PrinterDevice printer, String? queueName) async {
    if (!printer.isAssignedTo(_deviceId)) {
      _errorMessage = 'La stampante non è assegnata a questo dispositivo POS.';
      _notify();
      return;
    }
    final normalized = queueName?.trim();
    if (normalized != null &&
        normalized.isNotEmpty &&
        !isBluetoothPrinterTarget(normalized) &&
        !isWifiPrinterTarget(normalized)) {
      _errorMessage = 'La connessione locale indicata non è valida.';
      _notify();
      return;
    }
    final nextMappings = Map<String, String>.from(_queueMappings);
    if (normalized == null || normalized.isEmpty) {
      nextMappings.remove(printer.id);
    } else {
      nextMappings[printer.id] = normalized;
    }
    _queueMappings = Map<String, String>.unmodifiable(nextMappings);
    await _mappingStore.saveQueue(printer.id, normalized);
    _noticeMessage = normalized == null || normalized.isEmpty
        ? 'Associazione locale rimossa.'
        : '${printer.name} associata a ${localPrinterTargetLabel(normalized)}.';
    if (_agentEnabled) {
      if (canEnableAgent) {
        _startPolling();
      } else {
        _stopPolling();
      }
    }
    _notify();
  }

  Future<void> setAgentEnabled(bool enabled) async {
    if (enabled && !_localBackend.isSupported) {
      _errorMessage =
          'L’agente locale è disponibile soltanto nell’app Android.';
      _notify();
      return;
    }
    if (enabled && !canEnableAgent) {
      _errorMessage =
          'Configura una connessione Wi-Fi o Bluetooth per una stampante assegnata a questo dispositivo.';
      _notify();
      return;
    }
    _agentEnabled = enabled;
    await _mappingStore.saveAgentEnabled(enabled);
    if (enabled) {
      _agentMessage = 'Agente locale attivo.';
      _startPolling();
    } else {
      _agentMessage = 'Agente locale fermato.';
      _stopPolling();
    }
    _notify();
  }

  Future<bool> requestTestPage(PrinterDevice printer, {int copies = 1}) async =>
      _requestDocument(
        action: () => _gateway.requestTestPage(
          printerId: printer.id,
          clientRequestId: UuidV4.generate(),
          copies: copies,
        ),
        successMessage: 'Pagina di test accodata per ${printer.name}.',
      );

  Future<bool> requestOrderReceipt(String orderId, {int copies = 1}) async =>
      _requestDocument(
        action: () => _gateway.requestOrderReceipt(
          orderId: orderId,
          clientRequestId: UuidV4.generate(),
          copies: copies,
        ),
        successMessage: 'Riepilogo ordine accodato.',
      );

  Future<bool> requestPaymentReceipt(
    String checkoutId, {
    int copies = 1,
  }) async => _requestDocument(
    action: () => _gateway.requestPaymentReceipt(
      checkoutId: checkoutId,
      clientRequestId: UuidV4.generate(),
      copies: copies,
    ),
    successMessage: 'Riepilogo pagamento accodato.',
  );

  Future<bool> requestKitchenTicket(String ticketId, {int copies = 1}) async =>
      _requestDocument(
        action: () => _gateway.requestKitchenTicket(
          ticketId: ticketId,
          clientRequestId: UuidV4.generate(),
          copies: copies,
        ),
        successMessage: 'Ristampa della comanda accodata.',
      );

  Future<bool> reprintJob(PrintJob job) async {
    final sourceId = job.sourceEntityId;
    if (sourceId == null) {
      _errorMessage = 'Il lavoro non contiene un riferimento ristampabile.';
      _notify();
      return false;
    }
    return switch (job.documentType) {
      PrintDocumentType.kitchenTicket => requestKitchenTicket(
        sourceId,
        copies: job.copies,
      ),
      PrintDocumentType.orderReceipt => requestOrderReceipt(
        sourceId,
        copies: job.copies,
      ),
      PrintDocumentType.paymentReceipt => requestPaymentReceipt(
        sourceId,
        copies: job.copies,
      ),
      PrintDocumentType.testPage => _requestTestPageForSource(
        sourceId,
        copies: job.copies,
      ),
    };
  }

  Future<bool> _requestTestPageForSource(
    String printerId, {
    required int copies,
  }) async {
    for (final printer in _printers) {
      if (printer.id == printerId) {
        return requestTestPage(printer, copies: copies);
      }
    }
    _errorMessage = 'La stampante della pagina di test non è più disponibile.';
    _notify();
    return false;
  }

  Future<bool> retryJob(PrintJob job) async {
    if (_busy || !job.status.canRetry) {
      return false;
    }
    _setBusy();
    try {
      final updated = await _gateway.retryPrintJob(
        jobId: job.id,
        mutationId: UuidV4.generate(),
        expectedVersion: job.version,
      );
      _replaceJob(updated);
      _noticeMessage = 'Lavoro rimesso in coda.';
      await _refreshJobsSilently();
      return true;
    } on BackendError catch (error) {
      await _handleMutationError(error, job.id);
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile ritentare il lavoro di stampa.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> cancelJob(PrintJob job, String reason) async {
    final normalized = reason.trim();
    if (_busy || !job.status.canCancel) {
      return false;
    }
    if (normalized.length < 2) {
      _errorMessage = 'Inserisci un motivo di almeno due caratteri.';
      _notify();
      return false;
    }
    _setBusy();
    try {
      final updated = await _gateway.cancelPrintJob(
        jobId: job.id,
        mutationId: UuidV4.generate(),
        expectedVersion: job.version,
        reason: normalized,
      );
      _replaceJob(updated);
      _noticeMessage = 'Lavoro di stampa annullato.';
      await _refreshJobsSilently();
      return true;
    } on BackendError catch (error) {
      await _handleMutationError(error, job.id);
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile annullare il lavoro di stampa.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<void> pollAgentNow() => _pollAgent();

  void clearMessages() {
    if (_errorMessage == null && _noticeMessage == null) {
      return;
    }
    _errorMessage = null;
    _noticeMessage = null;
    _notify();
  }

  Future<bool> _requestDocument({
    required Future<PrintRequestResult> Function() action,
    required String successMessage,
  }) async {
    if (_locationId == null) {
      _errorMessage = 'Location operativa non disponibile.';
      _notify();
      return false;
    }
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      final result = await action();
      if (result.jobs.isEmpty) {
        throw const BackendError(
          message:
              'Nessun lavoro creato: configura una rotta di stampa attiva.',
          code: 'PRINT_ROUTE_NOT_CONFIGURED',
        );
      }
      _noticeMessage =
          '$successMessage ${result.jobs.length} lavoro/i creato/i.';
      await _refreshJobsSilently();
      return true;
    } on BackendError catch (error) {
      _errorMessage = error.message;
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile accodare il documento.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<void> _handleMutationError(BackendError error, String jobId) async {
    if (error.code == 'PRINT_JOB_VERSION_CONFLICT') {
      try {
        final authoritative = await _gateway.getPrintJob(jobId);
        _replaceJob(authoritative);
        _errorMessage =
            'Il lavoro è stato modificato da un altro client. Dati ricaricati.';
        await _refreshJobsSilently();
        return;
      } catch (_) {
        _errorMessage = error.message;
        return;
      }
    }
    _errorMessage = error.message;
  }

  void _replaceJob(PrintJob updated) {
    if (_selectedJob?.id == updated.id) {
      _selectedJob = updated;
    }
    _jobs = [
      for (final job in _jobs)
        if (job.id == updated.id) updated else job,
    ];
  }

  Future<void> _loadQueueMappings() async {
    final mappings = <String, String>{};
    for (final printer in _printers) {
      final queue = await _mappingStore.readQueue(printer.id);
      if (queue != null) {
        mappings[printer.id] = queue;
      }
    }
    _queueMappings = Map<String, String>.unmodifiable(mappings);
  }

  void _startPolling() {
    if (!_agentEnabled || !canEnableAgent || _pollTimer != null) {
      return;
    }
    _pollTimer = Timer.periodic(
      const Duration(seconds: 4),
      (_) => unawaited(_pollAgent()),
    );
    unawaited(_pollAgent());
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _agentPolling = false;
  }

  Future<void> _pollAgent() async {
    if (!_agentEnabled ||
        !canEnableAgent ||
        _agentPolling ||
        _locationId == null ||
        _deviceId == null) {
      return;
    }
    _agentPolling = true;
    _notify();
    var processed = false;
    try {
      for (final printer in assignedPrinters) {
        final queueName = _queueMappings[printer.id];
        if (queueName == null || queueName.isEmpty) {
          continue;
        }
        await _sendHeartbeatIfDue(printer, queueName);
        final job = await _gateway.claimPrintJob(
          printerId: printer.id,
          leaseSeconds: 60,
        );
        if (job == null) {
          continue;
        }
        processed = true;
        final leaseToken = job.leaseToken;
        if (leaseToken == null) {
          throw const BackendError(
            message: 'Il backend non ha restituito il lease di stampa.',
            code: 'PRINT_LEASE_INVALID',
          );
        }
        try {
          await _localBackend.printText(
            queueName: queueName,
            text: job.renderedText,
            copies: job.copies,
            supportsCut: printer.supportsCut,
          );
          await _gateway.completePrintJob(
            jobId: job.id,
            leaseToken: leaseToken,
          );
          _agentMessage =
              '${job.documentType.label} stampato su ${printer.name}.';
        } catch (error) {
          final message = error.toString();
          try {
            await _gateway.failPrintJob(
              jobId: job.id,
              leaseToken: leaseToken,
              errorMessage: message.length > 500
                  ? message.substring(0, 500)
                  : message,
              retryable: true,
            );
          } catch (_) {
            // The original local printing error remains the useful signal.
          }
          _agentMessage = 'Stampa fallita su ${printer.name}: $message';
        }
      }
      _lastAgentPollAt = DateTime.now();
      if (processed) {
        await _refreshJobsSilently();
      }
    } on BackendError catch (error) {
      _agentMessage = error.message;
    } catch (error) {
      _agentMessage = 'Errore agente locale: $error';
    } finally {
      _agentPolling = false;
      _notify();
    }
  }

  Future<void> _sendHeartbeatIfDue(
    PrinterDevice printer,
    String queueName,
  ) async {
    final now = DateTime.now();
    final previous = _lastHeartbeatAt[printer.id];
    if (previous != null &&
        now.difference(previous) < const Duration(seconds: 30)) {
      return;
    }
    await _gateway.heartbeat(
      printerId: printer.id,
      agentVersion: 'fluxa-pos-android/1.0',
      statusMessage: 'ONLINE · ${localPrinterTargetLabel(queueName)}',
    );
    _lastHeartbeatAt[printer.id] = now;
  }

  Future<void> _refreshJobsSilently() async {
    final currentLocationId = _locationId;
    if (currentLocationId == null) {
      return;
    }
    try {
      final page = await _gateway.listPrintJobs(
        locationId: currentLocationId,
        printerId: _printerFilterId,
        status: _statusFilter,
      );
      if (_locationId == currentLocationId) {
        _assertJobLocations(page.items, currentLocationId);
        _jobs = page.items;
        if (_selectedJob != null) {
          try {
            _selectedJob = await _gateway.getPrintJob(_selectedJob!.id);
          } catch (_) {
            // The list refresh is still useful if the detail was removed.
          }
        }
        _status = PrintingLoadStatus.ready;
      }
    } catch (_) {
      // User-triggered operations remain authoritative; refresh is retryable.
    }
  }

  bool _isCurrent(int requestVersion, String locationId, String deviceId) =>
      requestVersion == _requestVersion &&
      _locationId == locationId &&
      _deviceId == deviceId;

  void _assertPrinterLocations(
    List<PrinterDevice> printers,
    String locationId,
  ) {
    if (printers.any((printer) => printer.locationId != locationId)) {
      throw const BackendError(
        message: 'Il backend ha restituito stampanti di un’altra location.',
      );
    }
  }

  void _assertJobLocations(List<PrintJob> jobs, String locationId) {
    if (jobs.any((job) => job.locationId != locationId)) {
      throw const BackendError(
        message: 'Il backend ha restituito lavori di un’altra location.',
      );
    }
  }

  void _setBusy() {
    _busy = true;
    _errorMessage = null;
    _noticeMessage = null;
    _notify();
  }

  void _finishBusy() {
    _busy = false;
    _notify();
  }

  void _notify() {
    if (!_disposed) {
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _stopPolling();
    super.dispose();
  }
}
