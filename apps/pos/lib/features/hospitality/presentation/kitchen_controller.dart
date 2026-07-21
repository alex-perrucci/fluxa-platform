import 'package:flutter/foundation.dart';

import '../../../core/network/backend_error.dart';
import '../../orders/domain/uuid_v4.dart';
import '../data/hospitality_api.dart';
import '../domain/hospitality_models.dart';

enum KitchenLoadStatus { idle, loading, ready, failure }

class KitchenController extends ChangeNotifier {
  KitchenController(this._gateway);

  final HospitalityGateway _gateway;

  String? _locationId;
  List<KitchenStation> _stations = const [];
  List<KitchenTicketSummary> _tickets = const [];
  KitchenTicketDetail? _selectedTicket;
  KitchenTicketStatus? _statusFilter;
  String? _stationFilterId;
  KitchenLoadStatus _status = KitchenLoadStatus.idle;
  bool _busy = false;
  String? _errorMessage;
  String? _noticeMessage;
  int _requestVersion = 0;

  String? get locationId => _locationId;
  List<KitchenStation> get stations => _stations;
  List<KitchenTicketSummary> get tickets => _tickets;
  KitchenTicketDetail? get selectedTicket => _selectedTicket;
  KitchenTicketStatus? get statusFilter => _statusFilter;
  String? get stationFilterId => _stationFilterId;
  KitchenLoadStatus get status => _status;
  bool get busy => _busy;
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
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
    await refresh();
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
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
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
      _errorMessage = error.message;
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
    _setBusy();
    try {
      final batch = await _gateway.dispatchOrderToKitchen(
        orderId: orderId,
        clientBatchId: UuidV4.generate(),
      );
      if (batch.locationId != locationId) {
        throw const BackendError(
          message: 'L’invio cucina appartiene a una location diversa.',
        );
      }
      _noticeMessage = batch.tickets.length == 1
          ? 'Comanda ${batch.tickets.first.number} inviata in cucina.'
          : '${batch.tickets.length} comande inviate alle postazioni.';
      await _refreshTicketsSilently();
      return true;
    } on BackendError catch (error) {
      _errorMessage = error.message;
      return false;
    } on FormatException {
      _errorMessage = 'Il backend ha restituito un invio cucina non valido.';
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile inviare l’ordine in cucina.';
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
}
