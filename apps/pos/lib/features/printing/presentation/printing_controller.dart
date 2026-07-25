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
      _noticeMessage = _localQueues.isEmpty
          ? 'Nessuna stampante locale rilevata. Per il Bluetooth verifica prima l’abbinamento nelle impostazioni Android.'
          : '${_localQueues.length} stampanti locali rilevate.';
    } catch (error) {
      _errorMessage = 'Impossibile rilevare le stampanti locali: $error';
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
      _startPolling();
      await pollAgentNow();
    } else {
      _stopPolling();
      _agentMessage = 'Agente di stampa disattivato.';
      _notify();
    }
  }

  Future<void> pollAgentNow() async {
    if (!_agentEnabled || _agentPolling || !_localBackend.isSupported) {
      return;
    }
    if (!canEnableAgent) {
      _agentMessage =
          'Agente sospeso: associa una stampante locale al dispositivo.';
      _notify();
      return;
    }
    _agentPolling = true;
    _agentMessage = 'Controllo lavori di stampa…';
    _notify();
    try {
      var processed = 0;
      for (final printer in assignedPrinters) {
        final queueName = _queueMappings[printer.id];
        if (queueName == null || queueName.trim().isEmpty) {
          continue;
        }
        await _sendHeartbeatIfNeeded(printer);
        final job = await _gateway.claimPrintJob(printerId: printer.id);
        if (job == null) {
          continue;
        }
        processed += 1;
        await _executeClaimedJob(printer, queueName, job);
      }
      _lastAgentPollAt = DateTime.now();
      _agentMessage = processed == 0
          ? 'Nessun lavoro in attesa.'
          : '$processed lavori elaborati.';
      await refreshJobs();
    } catch (error) {
      _agentMessage = 'Errore agente di stampa: $error';
    } finally {
      _agentPolling = false;
      _notify();
    }
  }

  Future<void> _executeClaimedJob(
    PrinterDevice printer,
    String queueName,
    PrintJob job,
  ) async {
    final leaseToken = job.leaseToken;
    if (leaseToken == null || leaseToken.isEmpty) {
      _agentMessage = 'Lavoro ${job.id} senza lease token valido.';
      return;
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
    } catch (error) {
      try {
        await _gateway.failPrintJob(
          jobId: job.id,
          leaseToken: leaseToken,
          errorMessage: error.toString(),
        );
      } catch (_) {
        _agentMessage =
            'Stampa fallita e impossibile registrare l’errore per ${printer.name}.';
      }
    }
  }

  Future<void> _sendHeartbeatIfNeeded(PrinterDevice printer) async {
    final lastHeartbeat = _lastHeartbeatAt[printer.id];
    if (lastHeartbeat != null &&
        DateTime.now().difference(lastHeartbeat) < const Duration(seconds: 30)) {
      return;
    }
    await _gateway.heartbeat(
      printerId: printer.id,
      agentVersion: 'fluxa-pos',
      statusMessage: connectionLabel(printer.id),
    );
    _lastHeartbeatAt[printer.id] = DateTime.now();
  }

  Future<bool> requestOrderReceipt(String orderId) async {
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      final result = await _gateway.requestOrderReceipt(
        orderId: orderId,
        clientRequestId: newUuidV4(),
      );
      _noticeMessage = '${result.jobs.length} stampe accodate.';
      await refreshJobs();
      return true;
    } on BackendError catch (error) {
      _errorMessage = error.message;
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile accodare la stampa dell’ordine.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> requestPaymentReceipt(String checkoutId) async {
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      final result = await _gateway.requestPaymentReceipt(
        checkoutId: checkoutId,
        clientRequestId: newUuidV4(),
      );
      _noticeMessage = '${result.jobs.length} stampe accodate.';
      await refreshJobs();
      return true;
    } on BackendError catch (error) {
      _errorMessage = error.message;
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile accodare la ricevuta di pagamento.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> requestKitchenTicket(String ticketId) async {
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      final result = await _gateway.requestKitchenTicket(
        ticketId: ticketId,
        clientRequestId: newUuidV4(),
      );
      _noticeMessage = '${result.jobs.length} stampe accodate.';
      await refreshJobs();
      return true;
    } on BackendError catch (error) {
      _errorMessage = error.message;
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile accodare il ticket cucina.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> requestTestPage(PrinterDevice printer) async {
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      final result = await _gateway.requestTestPage(
        printerId: printer.id,
        clientRequestId: newUuidV4(),
      );
      _noticeMessage = result.jobs.isEmpty
          ? 'Nessuna pagina di test generata.'
          : 'Pagina di test accodata.';
      await refreshJobs();
      return result.jobs.isNotEmpty;
    } on BackendError catch (error) {
      _errorMessage = error.message;
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile accodare la pagina di test.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> retryJob(PrintJob job) async {
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      _selectedJob = await _gateway.retryPrintJob(
        jobId: job.id,
        mutationId: newUuidV4(),
        expectedVersion: job.version,
      );
      _noticeMessage = 'Lavoro rimesso in coda.';
      await refreshJobs();
      return true;
    } on BackendError catch (error) {
      if (error.isConflict) {
        await _reloadSelectedJob(job.id);
        _errorMessage = '${error.message} Dati ricaricati.';
      } else {
        _errorMessage = error.message;
      }
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile riprovare la stampa.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> cancelJob(PrintJob job, String reason) async {
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      _selectedJob = await _gateway.cancelPrintJob(
        jobId: job.id,
        mutationId: newUuidV4(),
        expectedVersion: job.version,
        reason: reason,
      );
      _noticeMessage = 'Lavoro annullato.';
      await refreshJobs();
      return true;
    } on BackendError catch (error) {
      if (error.isConflict) {
        await _reloadSelectedJob(job.id);
        _errorMessage = '${error.message} Dati ricaricati.';
      } else {
        _errorMessage = error.message;
      }
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile annullare la stampa.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  void clearMessages() {
    _errorMessage = null;
    _noticeMessage = null;
    _notify();
  }

  Future<void> _reloadSelectedJob(String jobId) async {
    try {
      _selectedJob = await _gateway.getPrintJob(jobId);
    } catch (_) {
      _selectedJob = null;
    }
  }

  Future<void> _loadQueueMappings() async {
    final next = <String, String>{};
    for (final printer in assignedPrinters) {
      final queue = await _mappingStore.readQueue(printer.id);
      if (queue != null && queue.isNotEmpty) {
        next[printer.id] = queue;
      }
    }
    _queueMappings = Map<String, String>.unmodifiable(next);
  }

  void _assertPrinterLocations(
    List<PrinterDevice> printers,
    String locationId,
  ) {
    if (printers.any((printer) => printer.locationId != locationId)) {
      throw const FormatException('Printer location mismatch.');
    }
  }

  void _assertJobLocations(List<PrintJob> jobs, String locationId) {
    if (jobs.any((job) => job.locationId != locationId)) {
      throw const FormatException('Print job location mismatch.');
    }
  }

  bool _isCurrent(int version, String locationId, String deviceId) =>
      version == _requestVersion &&
      locationId == _locationId &&
      deviceId == _deviceId;

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

  void _startPolling() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => unawaited(pollAgentNow()),
    );
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _agentPolling = false;
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
