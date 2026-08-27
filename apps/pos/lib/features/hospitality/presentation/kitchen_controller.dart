import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/network/backend_error.dart';
import '../../orders/domain/uuid_v4.dart';
import '../data/hospitality_api.dart';
import '../domain/hospitality_models.dart';

enum KitchenLoadStatus { idle, loading, ready, failure }

class KitchenController extends ChangeNotifier {
  KitchenController(this._gateway);

  static const autoPollInterval = Duration(seconds: 2);
  static const subscriptionBackoffInterval = Duration(seconds: 15);

  final HospitalityGateway _gateway;

  String? _locationId;
  List<KitchenStation> _stations = const [];
  List<KitchenTicketSummary> _tickets = const [];
  KitchenTicketDetail? _selectedTicket;
  KitchenTicketStatus? _statusFilter;
  String? _stationFilterId;
  KitchenLoadStatus _status = KitchenLoadStatus.idle;
  bool _busy = false;
  bool _pollInFlight = false;
  bool _autoPollingEnabled = false;
  bool _autoPollingBlocked = false;
  String? _errorMessage;
  String? _noticeMessage;
  String? _pendingDispatchOrderId;
  String? _pendingDispatchBatchId;
  Timer? _autoPollTimer;
  int _requestVersion = 0;

  String? get locationId => _locationId;
  List<KitchenStation> get stations => _stations;
  List<KitchenTicketSummary> get tickets => _tickets;
  KitchenTicketDetail? get selectedTicket => _selectedTicket;
  KitchenTicketStatus? get statusFilter => _statusFilter;
  String? get stationFilterId => _stationFilterId;
  KitchenLoadStatus get status => _status;
  bool get busy => _busy;
  bool get autoPollingActive => _autoPollTimer?.isActive == true;
  bool get autoPollingBlocked => _autoPollingBlocked;
  String? get errorMessage => _errorMessage;
  String? get noticeMessage => _noticeMessage;

  List<KitchenStation> get activeStations =>
      _stations.where((station) => station.isActive).toList(growable: false);

  Future<void> bindLocation(String locationId) async {
    if (_locationId == locationId) {
      if (_status == KitchenLoadStatus.idle) {
        await refresh();
      }
      return;
    }
    _requestVersion += 1;
    _locationId = locationId;
    _stations = const [];
    _tickets = const [];
    _selectedTicket = null;
    _statusFilter = null;
    _stationFilterId = null;
    _status = KitchenLoadStatus.idle;
    _busy = false;
    _pollInFlight = false;
    _autoPollingBlocked = false;
    _errorMessage = null;
    _noticeMessage = null;
    _clearPendingDispatch();
    _cancelAutoPollTimer();
    notifyListeners();
    await refresh();
    if (_autoPollingEnabled) {
      _startAutoPolling(autoPollInterval);
    }
  }

  void clearLocation() {
    _requestVersion += 1;
    _locationId = null;
    _stations = const [];
    _tickets = const [];
    _selectedTicket = null;
    _statusFilter = null;
    _stationFilterId = null;
    _status = KitchenLoadStatus.idle;
    _busy = false;
    _pollInFlight = false;
    _autoPollingEnabled = false;
    _autoPollingBlocked = false;
    _errorMessage = null;
    _noticeMessage = null;
    _clearPendingDispatch();
    _cancelAutoPollTimer();
    notifyListeners();
  }

  void startAutoPolling() {
    _autoPollingEnabled = true;
    if (_locationId == null || _autoPollTimer?.isActive == true) {
      return;
    }
    _startAutoPolling(
      _autoPollingBlocked ? subscriptionBackoffInterval : autoPollInterval,
    );
  }

  void stopAutoPolling() {
    _autoPollingEnabled = false;
    _cancelAutoPollTimer();
  }

  Future<void> refresh() async {
    final currentLocationId = _locationId;
    if (currentLocationId == null) {
      return;
    }
    final requestVersion = ++_requestVersion;
    _status = KitchenLoadStatus.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      final stations = await _gateway.listKitchenStations(currentLocationId);
      final tickets = await _gateway.listKitchenTickets(
        locationId: currentLocationId,
        stationId: _stationFilterId,
        status: _statusFilter,
      );
      if (requestVersion != _requestVersion ||
          _locationId != currentLocationId) {
        return;
      }
      if (stations.any((station) => station.locationId != currentLocationId) ||
          tickets.any((ticket) => ticket.locationId != currentLocationId)) {
        throw const BackendError(
          message: 'I dati cucina appartengono a una location diversa.',
        );
      }
      _stations = stations;
      _tickets = tickets;
      _status = KitchenLoadStatus.ready;
      _recoverAutoPollingIfNeeded();
      final selectedId = _selectedTicket?.ticket.id;
      if (selectedId != null &&
          !tickets.any((ticket) => ticket.id == selectedId)) {
        _selectedTicket = null;
      }
    } on BackendError catch (error) {
      if (requestVersion != _requestVersion) {
        return;
      }
      _tickets = const [];
      _status = KitchenLoadStatus.failure;
      _errorMessage = _kdsErrorMessage(error);
      if (_isSubscriptionPollingError(error)) {
        _enterSubscriptionBackoff();
      }
    } on FormatException {
      if (requestVersion != _requestVersion) {
        return;
      }
      _tickets = const [];
      _status = KitchenLoadStatus.failure;
      _errorMessage = 'Il backend ha restituito dati cucina non validi.';
    } catch (_) {
      if (requestVersion != _requestVersion) {
        return;
      }
      _tickets = const [];
      _status = KitchenLoadStatus.failure;
      _errorMessage = 'Impossibile recuperare le comande.';
    }
    notifyListeners();
  }

  Future<void> pollTickets() async {
    final currentLocationId = _locationId;
    if (currentLocationId == null || _busy || _pollInFlight) {
      return;
    }

    _pollInFlight = true;
    try {
      final tickets = await _gateway.listKitchenTickets(
        locationId: currentLocationId,
        stationId: _stationFilterId,
        status: _statusFilter,
      );
      if (_locationId != currentLocationId) {
        return;
      }
      if (tickets.any((ticket) => ticket.locationId != currentLocationId)) {
        throw const BackendError(
          message: 'Le comande appartengono a una location diversa.',
        );
      }

      final previousTickets = _tickets;
      final wasBlocked = _autoPollingBlocked;
      var selectedChanged = false;
      final selected = _selectedTicket;
      if (selected != null) {
        final selectedSummary = _findTicket(tickets, selected.ticket.id);
        if (selectedSummary == null) {
          _selectedTicket = null;
          selectedChanged = true;
        } else if (selectedSummary.version != selected.ticket.version) {
          final detail = await _gateway.getKitchenTicket(selected.ticket.id);
          if (_locationId == currentLocationId &&
              detail.ticket.locationId == currentLocationId) {
            _selectedTicket = detail;
            selectedChanged = true;
          }
        }
      }

      _tickets = tickets;
      _status = KitchenLoadStatus.ready;
      _recoverAutoPollingIfNeeded();
      if (wasBlocked) {
        _errorMessage = null;
      }

      if (wasBlocked ||
          selectedChanged ||
          !_sameTickets(previousTickets, tickets)) {
        notifyListeners();
      }
    } on BackendError catch (error) {
      if (_isSubscriptionPollingError(error)) {
        _errorMessage = _kdsErrorMessage(error);
        _enterSubscriptionBackoff();
        notifyListeners();
      }
      // Transient polling failures keep the last known KDS state on screen.
      // Operators can still use the explicit refresh action if needed.
    } on FormatException {
      // Preserve the last known state; a later poll or manual refresh can recover.
    } catch (_) {
      // Preserve the last known state on transient connectivity failures.
    } finally {
      _pollInFlight = false;
    }
  }

  Future<void> setStatusFilter(KitchenTicketStatus? status) async {
    if (_statusFilter == status || _busy) {
      return;
    }
    _statusFilter = status;
    _selectedTicket = null;
    await refresh();
  }

  Future<void> setStationFilter(String? stationId) async {
    if (_stationFilterId == stationId || _busy) {
      return;
    }
    _stationFilterId = stationId;
    _selectedTicket = null;
    await refresh();
  }

  Future<bool> selectTicket(String ticketId) async {
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      final ticket = await _gateway.getKitchenTicket(ticketId);
      if (_locationId == null || ticket.ticket.locationId != _locationId) {
        throw const BackendError(
          message: 'La comanda appartiene a una location diversa.',
        );
      }
      _selectedTicket = ticket;
      return true;
    } on BackendError catch (error) {
      _errorMessage = error.message;
      return false;
    } on FormatException {
      _errorMessage = 'Il backend ha restituito una comanda non valida.';
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile aprire la comanda.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  void closeTicket() {
    if (_busy) {
      return;
    }
    _selectedTicket = null;
    notifyListeners();
  }

  Future<bool> dispatchOrder({
    required String locationId,
    required String orderId,
  }) async {
    if (_busy) {
      return false;
    }
    if (_locationId != locationId) {
      await bindLocation(locationId);
    }
    if (_busy) {
      return false;
    }

    final clientBatchId = _dispatchBatchIdFor(orderId);
    _setBusy();
    try {
      final batch = await _gateway.dispatchOrderToKitchen(
        orderId: orderId,
        clientBatchId: clientBatchId,
      );
      if (batch.locationId != locationId || batch.orderId != orderId) {
        throw const BackendError(
          message: 'L’invio cucina appartiene a un ordine o una sede diversi.',
        );
      }
      _clearPendingDispatch();
      _noticeMessage = batch.tickets.length == 1
          ? 'Comanda ${batch.tickets.first.number} inviata in cucina.'
          : '${batch.tickets.length} comande inviate in cucina.';
      await _refreshTicketsSilently();
      return true;
    } on BackendError catch (error) {
      if (!_shouldReuseDispatchId(error)) {
        _clearPendingDispatch();
      }
      _errorMessage = _dispatchErrorMessage(error);
      return false;
    } on FormatException {
      _errorMessage =
          'Risposta cucina non valida. Riprova: Fluxa riutilizzerà lo stesso invio per evitare duplicati.';
      return false;
    } catch (_) {
      _errorMessage =
          'Invio cucina non confermato. Riprova: Fluxa eviterà una doppia comanda.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> transitionTicket(
    KitchenTicketSummary ticket,
    KitchenTicketStatus nextStatus,
  ) async {
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      final updated = await _gateway.transitionKitchenTicket(
        ticketId: ticket.id,
        mutationId: UuidV4.generate(),
        expectedVersion: ticket.version,
        nextStatus: nextStatus,
      );
      _selectedTicket = updated;
      _noticeMessage =
          'Comanda ${updated.ticket.number}: ${updated.ticket.status.label}.';
      await _refreshTicketsSilently();
      return true;
    } on BackendError catch (error) {
      if (error.code == 'KITCHEN_TICKET_VERSION_CONFLICT') {
        await _reloadTicketAfterConflict(ticket.id, error);
      } else {
        _errorMessage = error.message;
      }
      return false;
    } on FormatException {
      _errorMessage = 'Il backend ha restituito una comanda non valida.';
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile aggiornare la comanda.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  String stationName(String stationId) {
    for (final station in _stations) {
      if (station.id == stationId) {
        return station.name;
      }
    }
    return 'Postazione';
  }

  void clearMessages() {
    if (_errorMessage == null && _noticeMessage == null) {
      return;
    }
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  String _dispatchBatchIdFor(String orderId) {
    if (_pendingDispatchOrderId == orderId) {
      final pendingBatchId = _pendingDispatchBatchId;
      if (pendingBatchId != null) {
        return pendingBatchId;
      }
    }
    final batchId = UuidV4.generate();
    _pendingDispatchOrderId = orderId;
    _pendingDispatchBatchId = batchId;
    return batchId;
  }

  void _clearPendingDispatch() {
    _pendingDispatchOrderId = null;
    _pendingDispatchBatchId = null;
  }

  bool _shouldReuseDispatchId(BackendError error) {
    final status = error.statusCode;
    if (status == null) {
      return true;
    }
    return status == 408 || status == 425 || status == 429 || status >= 500;
  }

  String _dispatchErrorMessage(BackendError error) {
    switch (error.code) {
      case 'FEATURE_NOT_INCLUDED':
        return 'La cucina non è inclusa nel piano attivo. Aggiorna il piano per inviare comande.';
      case 'SUBSCRIPTION_SUSPENDED':
        return 'L’abbonamento è sospeso: l’invio in cucina non è disponibile.';
      case 'SUBSCRIPTION_NOT_PROVISIONED':
        return 'Il piano del locale non è ancora configurato per usare la cucina.';
      case 'KITCHEN_ORDER_EMPTY':
        return 'Aggiungi almeno un prodotto prima di inviare la comanda.';
      case 'KITCHEN_ORDER_NOT_DISPATCHABLE':
      case 'ORDER_NOT_DISPATCHABLE':
        return 'Solo un ordine aperto può essere inviato in cucina.';
      case 'KITCHEN_CATEGORY_NOT_ROUTED':
        return 'Configura una postazione cucina attiva e l’instradamento delle categorie prima di inviare la comanda.';
      case 'KITCHEN_NOTHING_TO_SEND':
        return 'Tutte le quantità dell’ordine sono già state inviate in cucina.';
      default:
        return error.message;
    }
  }

  String _kdsErrorMessage(BackendError error) {
    switch (error.code) {
      case 'FEATURE_NOT_INCLUDED':
        return 'Il KDS non è incluso nel piano attivo. Le comande restano salvate, ma questa postazione non può aggiornarle finché il piano non include la cucina.';
      case 'SUBSCRIPTION_SUSPENDED':
        return 'L’abbonamento è sospeso: gli aggiornamenti automatici della cucina sono in pausa.';
      case 'SUBSCRIPTION_NOT_PROVISIONED':
        return 'Il piano del locale non è configurato: gli aggiornamenti automatici della cucina sono in pausa.';
      default:
        return error.message;
    }
  }

  bool _isSubscriptionPollingError(BackendError error) =>
      error.code == 'FEATURE_NOT_INCLUDED' ||
      error.code == 'SUBSCRIPTION_SUSPENDED' ||
      error.code == 'SUBSCRIPTION_NOT_PROVISIONED';

  void _startAutoPolling(Duration interval) {
    _cancelAutoPollTimer();
    if (!_autoPollingEnabled || _locationId == null) {
      return;
    }
    _autoPollTimer = Timer.periodic(interval, (_) => unawaited(pollTickets()));
  }

  void _enterSubscriptionBackoff() {
    if (!_autoPollingEnabled) {
      return;
    }
    if (_autoPollingBlocked && _autoPollTimer?.isActive == true) {
      return;
    }
    _autoPollingBlocked = true;
    _startAutoPolling(subscriptionBackoffInterval);
  }

  void _recoverAutoPollingIfNeeded() {
    if (!_autoPollingBlocked) {
      return;
    }
    _autoPollingBlocked = false;
    if (_autoPollingEnabled) {
      _startAutoPolling(autoPollInterval);
    }
  }

  void _cancelAutoPollTimer() {
    _autoPollTimer?.cancel();
    _autoPollTimer = null;
  }

  KitchenTicketSummary? _findTicket(
    List<KitchenTicketSummary> tickets,
    String id,
  ) {
    for (final ticket in tickets) {
      if (ticket.id == id) {
        return ticket;
      }
    }
    return null;
  }

  bool _sameTickets(
    List<KitchenTicketSummary> previous,
    List<KitchenTicketSummary> next,
  ) {
    if (previous.length != next.length) {
      return false;
    }
    for (var index = 0; index < previous.length; index += 1) {
      final left = previous[index];
      final right = next[index];
      if (left.id != right.id ||
          left.status != right.status ||
          left.version != right.version ||
          left.stationId != right.stationId ||
          left.tableCodeSnapshot != right.tableCodeSnapshot) {
        return false;
      }
    }
    return true;
  }

  Future<void> _reloadTicketAfterConflict(
    String ticketId,
    BackendError original,
  ) async {
    try {
      final reloaded = await _gateway.getKitchenTicket(ticketId);
      _selectedTicket = reloaded;
      _errorMessage =
          'La comanda è stata aggiornata da un altro dispositivo. Dati ricaricati.';
      await _refreshTicketsSilently();
    } catch (_) {
      _errorMessage = original.message;
    }
  }

  Future<void> _refreshTicketsSilently() async {
    final currentLocationId = _locationId;
    if (currentLocationId == null) {
      return;
    }
    try {
      final tickets = await _gateway.listKitchenTickets(
        locationId: currentLocationId,
        stationId: _stationFilterId,
        status: _statusFilter,
      );
      if (_locationId == currentLocationId) {
        _tickets = tickets;
        _status = KitchenLoadStatus.ready;
      }
    } catch (_) {
      // The mutation response remains authoritative; refresh can be retried.
    }
  }

  void _setBusy() {
    _busy = true;
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  void _finishBusy() {
    _busy = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _autoPollingEnabled = false;
    _cancelAutoPollTimer();
    super.dispose();
  }
}
