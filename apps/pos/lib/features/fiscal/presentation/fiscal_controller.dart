import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/network/backend_error.dart';
import '../../health/data/health_api.dart';
import '../../orders/data/orders_api.dart';
import '../../orders/domain/order_models.dart';
import '../../orders/domain/uuid_v4.dart';
import '../data/fiscal_api.dart';
import '../domain/fiscal_models.dart';
import '../domain/fiscal_runtime.dart';

enum FiscalLoadStatus { idle, loading, ready, failure }

class FiscalController extends ChangeNotifier {
  FiscalController(this._gateway, this._orders, this._health);

  final FiscalGateway _gateway;
  final OrdersGateway _orders;
  final HealthGateway _health;

  String? _locationId;
  FiscalRuntimeConfiguration? _runtime;
  List<FiscalDocument> _documents = const [];
  List<OrderHeader> _paidOrders = const [];
  FiscalDocument? _selectedDocument;
  FiscalLoadStatus _status = FiscalLoadStatus.idle;
  FiscalDocumentStatus? _statusFilter;
  FiscalDocumentType? _typeFilter;
  bool _busy = false;
  String? _errorMessage;
  String? _noticeMessage;
  Timer? _pollTimer;
  int _requestVersion = 0;
  bool _disposed = false;

  String? get locationId => _locationId;
  FiscalRuntimeConfiguration? get runtime => _runtime;
  List<FiscalDocument> get documents => _documents
      .where((document) {
        final matchesType = _typeFilter == null || document.type == _typeFilter;
        final matchesStatus =
            _statusFilter == null || document.status == _statusFilter;
        return matchesType && matchesStatus;
      })
      .toList(growable: false);
  List<OrderHeader> get paidOrders => _paidOrders;
  FiscalDocument? get selectedDocument => _selectedDocument;
  FiscalLoadStatus get status => _status;
  FiscalDocumentStatus? get statusFilter => _statusFilter;
  FiscalDocumentType? get typeFilter => _typeFilter;
  bool get busy => _busy;
  String? get errorMessage => _errorMessage;
  String? get noticeMessage => _noticeMessage;

  List<OrderHeader> get ordersToFiscalize => _paidOrders
      .where((order) => documentForOrder(order.id) == null)
      .toList(growable: false);

  FiscalDocument? documentForOrder(String orderId) {
    for (final document in _documents) {
      if (document.orderId == orderId &&
          document.type == FiscalDocumentType.sale) {
        return document;
      }
    }
    return null;
  }

  Future<void> bindLocation(String locationId) async {
    if (_locationId == locationId && _status != FiscalLoadStatus.idle) return;
    _requestVersion += 1;
    _stopPolling();
    _locationId = locationId;
    _runtime = null;
    _documents = const [];
    _paidOrders = const [];
    _selectedDocument = null;
    _statusFilter = null;
    _typeFilter = null;
    _status = FiscalLoadStatus.loading;
    _errorMessage = null;
    _noticeMessage = null;
    _notify();
    await _load(locationId, _requestVersion);
  }

  Future<void> refresh({bool silent = false}) async {
    final locationId = _locationId;
    if (locationId == null || _busy) return;
    final version = ++_requestVersion;
    if (!silent) {
      _status = FiscalLoadStatus.loading;
      _errorMessage = null;
      _notify();
    }
    await _load(locationId, version, preserveSelection: true);
  }

  Future<void> _load(
    String locationId,
    int version, {
    bool preserveSelection = false,
  }) async {
    final selectedId = preserveSelection ? _selectedDocument?.id : null;
    final previousRuntime = _runtime?.locationId == locationId
        ? _runtime
        : null;

    late final FiscalRuntimeConfiguration runtime;
    try {
      final health = await _health.operational(locationId: locationId);
      runtime = FiscalRuntimeConfiguration.fromOperationalHealth(
        locationId: locationId,
        health: health,
      );
    } on BackendError {
      if (!_isCurrent(version, locationId)) return;
      const message =
          'Impossibile verificare lo stato fiscale. Controlla la connessione o riprova.';
      _runtime = FiscalRuntimeConfiguration.verificationError(
        locationId: locationId,
        message: message,
        previous: previousRuntime,
      );
      _status = FiscalLoadStatus.failure;
      _errorMessage = message;
      _notify();
      return;
    } on FormatException {
      if (!_isCurrent(version, locationId)) return;
      const message =
          'Impossibile verificare lo stato fiscale. La configurazione ricevuta non è valida.';
      _runtime = FiscalRuntimeConfiguration.verificationError(
        locationId: locationId,
        message: message,
        previous: previousRuntime,
      );
      _status = FiscalLoadStatus.failure;
      _errorMessage = message;
      _notify();
      return;
    } catch (_) {
      if (!_isCurrent(version, locationId)) return;
      const message =
          'Impossibile verificare lo stato fiscale. Controlla la connessione o riprova.';
      _runtime = FiscalRuntimeConfiguration.verificationError(
        locationId: locationId,
        message: message,
        previous: previousRuntime,
      );
      _status = FiscalLoadStatus.failure;
      _errorMessage = message;
      _notify();
      return;
    }

    try {
      final results = await Future.wait<Object>([
        _gateway.listDocuments(locationId: locationId),
        _orders.listOrders(
          locationId: locationId,
          status: OrderStatus.paid,
          pageSize: 100,
        ),
      ]);
      final documents = results[0] as FiscalDocumentPage;
      final orders = results[1] as OrderListPage;
      if (!_isCurrent(version, locationId)) return;
      if (runtime.locationId != locationId) {
        throw const FormatException('Stato fiscale fuori location.');
      }
      if (documents.items.any(
        (document) => document.locationId != locationId,
      )) {
        throw const FormatException('Documento fiscale fuori location.');
      }
      if (orders.items.any((order) => order.locationId != locationId)) {
        throw const FormatException('Ordine pagato fuori location.');
      }
      _runtime = runtime;
      _documents = documents.items;
      _paidOrders = orders.items;
      _status = FiscalLoadStatus.ready;
      _errorMessage = null;
      if (selectedId != null) {
        try {
          _selectedDocument = await _gateway.getDocument(selectedId);
        } on BackendError {
          _selectedDocument = null;
        }
      }
      _syncPolling();
    } on BackendError catch (error) {
      if (!_isCurrent(version, locationId)) return;
      _runtime = runtime;
      _status = FiscalLoadStatus.failure;
      _errorMessage = error.message;
    } on FormatException {
      if (!_isCurrent(version, locationId)) return;
      _runtime = runtime;
      _status = FiscalLoadStatus.failure;
      _errorMessage = 'Il backend ha restituito dati fiscali non validi.';
    } catch (_) {
      if (!_isCurrent(version, locationId)) return;
      _runtime = runtime;
      _status = FiscalLoadStatus.failure;
      _errorMessage = 'Impossibile caricare i documenti fiscali.';
    }
    _notify();
  }

  void setStatusFilter(FiscalDocumentStatus? value) {
    if (_statusFilter == value) return;
    _statusFilter = value;
    _notify();
  }

  void setTypeFilter(FiscalDocumentType? value) {
    if (_typeFilter == value) return;
    _typeFilter = value;
    _notify();
  }

  Future<bool> selectDocument(String documentId) async {
    if (_busy) return false;
    _beginBusy();
    try {
      final document = await _gateway.getDocument(documentId);
      if (document.locationId != _locationId) {
        throw const BackendError(message: 'Documento fiscale fuori location.');
      }
      _selectedDocument = document;
      return true;
    } on BackendError catch (error) {
      _errorMessage = error.message;
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile aprire il documento fiscale.';
      return false;
    } finally {
      _endBusy();
    }
  }

  Future<bool> issueOrder(String orderId, {String? lotteryCode}) async {
    if (_busy) return false;
    final runtime = _runtime;
    if (runtime == null ||
        runtime.status == FiscalRuntimeStatus.verificationError) {
      _errorMessage =
          'Impossibile verificare la configurazione fiscale. Riprova prima di emettere.';
      _notify();
      return false;
    }
    if (!runtime.isOperationallyConfigured) {
      _errorMessage = runtime.status == FiscalRuntimeStatus.disabled
          ? 'La fiscalizzazione è disabilitata per questa sede.'
          : 'La fiscalizzazione non è configurata per questa sede.';
      _notify();
      return false;
    }
    if (runtime.status == FiscalRuntimeStatus.authRequired) {
      _errorMessage =
          'È necessario ripristinare l’accesso fiscale prima di emettere nuovi documenti.';
      _notify();
      return false;
    }

    final normalizedLottery = lotteryCode?.trim().toUpperCase();
    if (runtime.provider == FiscalProvider.adeWeb &&
        normalizedLottery != null &&
        normalizedLottery.isNotEmpty) {
      _errorMessage =
          'Il codice lotteria non è ancora supportato con Agenzia delle Entrate. L’emissione non è stata avviata.';
      _notify();
      return false;
    }
    if (normalizedLottery != null &&
        normalizedLottery.isNotEmpty &&
        !RegExp(r'^[A-Z0-9]{8}$').hasMatch(normalizedLottery)) {
      _errorMessage =
          'Il codice lotteria deve contenere esattamente 8 caratteri alfanumerici.';
      _notify();
      return false;
    }
    _beginBusy();
    try {
      final document = await _gateway.issue(
        orderId: orderId,
        clientRequestId: UuidV4.generate(),
        lotteryCode: normalizedLottery?.isEmpty == true
            ? null
            : normalizedLottery,
      );
      _upsertDocument(document);
      _selectedDocument = document;
      _noticeMessage = document.status == FiscalDocumentStatus.issued
          ? 'Documento fiscale emesso.'
          : 'Documento fiscale accodato al provider.';
      _syncPolling();
      return true;
    } on BackendError catch (error) {
      _errorMessage = error.message;
      return false;
    } catch (_) {
      _errorMessage = 'Fiscalizzazione non riuscita.';
      return false;
    } finally {
      _endBusy();
    }
  }

  Future<bool> retryDocument(FiscalDocument document) async {
    if (_busy || !document.canRetry) return false;
    _beginBusy();
    try {
      final updated = await _gateway.retry(
        documentId: document.id,
        mutationId: UuidV4.generate(),
        expectedVersion: document.version,
      );
      _upsertDocument(updated);
      _selectedDocument = updated;
      _noticeMessage = 'Documento fiscale rimesso in coda.';
      _syncPolling();
      return true;
    } on BackendError catch (error) {
      if (error.code == 'FISCAL_VERSION_CONFLICT') {
        await _reloadDocument(document.id);
      }
      _errorMessage = error.message;
      return false;
    } catch (_) {
      _errorMessage = 'Retry fiscale non riuscito.';
      return false;
    } finally {
      _endBusy();
    }
  }

  Future<bool> voidDocument(FiscalDocument document, String reason) async {
    final normalizedReason = reason.trim();
    if (_busy || !document.canVoid) return false;
    if (normalizedReason.isEmpty) {
      _errorMessage = 'Indica il motivo dell’annullamento fiscale.';
      _notify();
      return false;
    }
    _beginBusy();
    try {
      final voided = await _gateway.voidDocument(
        documentId: document.id,
        mutationId: UuidV4.generate(),
        expectedVersion: document.version,
        reason: normalizedReason,
      );
      _upsertDocument(voided);
      _selectedDocument = voided;
      _noticeMessage = 'Annullamento fiscale accodato.';
      _syncPolling();
      return true;
    } on BackendError catch (error) {
      if (error.code == 'FISCAL_VERSION_CONFLICT') {
        await _reloadDocument(document.id);
      }
      _errorMessage = error.message;
      return false;
    } catch (_) {
      _errorMessage = 'Annullamento fiscale non riuscito.';
      return false;
    } finally {
      _endBusy();
    }
  }

  void clearMessages() {
    _errorMessage = null;
    _noticeMessage = null;
    _notify();
  }

  void clearSelection() {
    _selectedDocument = null;
    _notify();
  }

  void clearContext() {
    _requestVersion += 1;
    _stopPolling();
    _locationId = null;
    _runtime = null;
    _documents = const [];
    _paidOrders = const [];
    _selectedDocument = null;
    _status = FiscalLoadStatus.idle;
    _busy = false;
    _errorMessage = null;
    _noticeMessage = null;
    _notify();
  }

  Future<void> _reloadDocument(String id) async {
    try {
      final current = await _gateway.getDocument(id);
      _upsertDocument(current);
      _selectedDocument = current;
    } catch (_) {
      // Preserve the original concurrency error.
    }
  }

  void _upsertDocument(FiscalDocument document) {
    final values = [..._documents];
    final index = values.indexWhere((item) => item.id == document.id);
    if (index == -1) {
      values.insert(0, document);
    } else {
      values[index] = document;
    }
    _documents = List.unmodifiable(values);
  }

  void _syncPolling() {
    final pending = _documents.any((document) => document.status.isPending);
    if (!pending || _locationId == null) {
      _stopPolling();
      return;
    }
    _pollTimer ??= Timer.periodic(const Duration(seconds: 5), (_) {
      if (!_busy && _locationId != null) unawaited(refresh(silent: true));
    });
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
  }

  bool _isCurrent(int version, String locationId) =>
      version == _requestVersion && locationId == _locationId;

  void _beginBusy() {
    _busy = true;
    _errorMessage = null;
    _noticeMessage = null;
    _notify();
  }

  void _endBusy() {
    _busy = false;
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _stopPolling();
    super.dispose();
  }
}
