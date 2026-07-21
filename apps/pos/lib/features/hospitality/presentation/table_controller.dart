import 'package:flutter/foundation.dart';

import '../../../core/network/backend_error.dart';
import '../../orders/data/orders_api.dart';
import '../../orders/domain/order_models.dart';
import '../../orders/domain/uuid_v4.dart';
import '../data/hospitality_api.dart';
import '../domain/hospitality_models.dart';

enum FloorLoadStatus { idle, loading, ready, failure }

class TableController extends ChangeNotifier {
  TableController(this._hospitality, this._orders);

  final HospitalityGateway _hospitality;
  final OrdersGateway _orders;

  String? _locationId;
  FloorSnapshot? _floor;
  FloorLoadStatus _status = FloorLoadStatus.idle;
  String? _selectedAreaId;
  String? _selectedTableId;
  TableSessionDetail? _selectedSession;
  List<OrderHeader> _attachableOrders = const [];
  bool _busy = false;
  String? _errorMessage;
  String? _noticeMessage;
  int _requestVersion = 0;

  String? get locationId => _locationId;
  FloorSnapshot? get floor => _floor;
  FloorLoadStatus get status => _status;
  String? get selectedAreaId => _selectedAreaId;
  String? get selectedTableId => _selectedTableId;
  TableSessionDetail? get selectedSession => _selectedSession;
  List<OrderHeader> get attachableOrders => _attachableOrders;
  bool get busy => _busy;
  String? get errorMessage => _errorMessage;
  String? get noticeMessage => _noticeMessage;

  List<DiningAreaFloor> get areas => _floor?.areas ?? const <DiningAreaFloor>[];

  List<DiningTableFloor> get visibleTables {
    final currentFloor = _floor;
    if (currentFloor == null) {
      return const <DiningTableFloor>[];
    }
    if (_selectedAreaId == null) {
      return currentFloor.tables;
    }
    for (final area in currentFloor.areas) {
      if (area.id == _selectedAreaId) {
        return area.tables;
      }
    }
    return const <DiningTableFloor>[];
  }

  DiningTableFloor? get selectedTable =>
      _floor?.tableById(_selectedTableId ?? '');

  List<DiningTableFloor> get movableTables =>
      (_floor?.tables ?? const <DiningTableFloor>[])
          .where(
            (table) => !table.occupied && table.id != _selectedSession?.tableId,
          )
          .toList(growable: false);

  Future<void> bindLocation(String locationId) async {
    if (_locationId == locationId) {
      if (_status == FloorLoadStatus.idle) {
        await refreshFloor();
      }
      return;
    }
    _requestVersion += 1;
    _locationId = locationId;
    _floor = null;
    _status = FloorLoadStatus.idle;
    _selectedAreaId = null;
    _selectedTableId = null;
    _selectedSession = null;
    _attachableOrders = const [];
    _busy = false;
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
    await refreshFloor();
  }

  void clearLocation() {
    _requestVersion += 1;
    _locationId = null;
    _floor = null;
    _status = FloorLoadStatus.idle;
    _selectedAreaId = null;
    _selectedTableId = null;
    _selectedSession = null;
    _attachableOrders = const [];
    _busy = false;
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  Future<void> refreshFloor() async {
    final currentLocationId = _locationId;
    if (currentLocationId == null) {
      return;
    }
    final requestVersion = ++_requestVersion;
    final preservedTableId = _selectedTableId;
    _status = FloorLoadStatus.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      final snapshot = await _hospitality.fetchFloor(currentLocationId);
      if (requestVersion != _requestVersion ||
          _locationId != currentLocationId) {
        return;
      }
      if (snapshot.locationId != currentLocationId) {
        throw const BackendError(
          message: 'La pianta sala appartiene a una location diversa.',
        );
      }
      _floor = snapshot;
      _status = FloorLoadStatus.ready;
      if (preservedTableId != null &&
          snapshot.tableById(preservedTableId) == null) {
        _selectedTableId = null;
        _selectedSession = null;
      }
      if (_selectedAreaId != null &&
          !snapshot.areas.any((area) => area.id == _selectedAreaId)) {
        _selectedAreaId = null;
      }
    } on BackendError catch (error) {
      if (requestVersion != _requestVersion) {
        return;
      }
      _floor = null;
      _status = FloorLoadStatus.failure;
      _errorMessage = error.message;
    } on FormatException {
      if (requestVersion != _requestVersion) {
        return;
      }
      _floor = null;
      _status = FloorLoadStatus.failure;
      _errorMessage = 'Il backend ha restituito una pianta sala non valida.';
    } catch (_) {
      if (requestVersion != _requestVersion) {
        return;
      }
      _floor = null;
      _status = FloorLoadStatus.failure;
      _errorMessage = 'Impossibile recuperare la pianta sala.';
    }
    notifyListeners();
  }

  void selectArea(String? areaId) {
    if (_selectedAreaId == areaId) {
      return;
    }
    _selectedAreaId = areaId;
    notifyListeners();
  }

  Future<void> selectTable(DiningTableFloor table) async {
    if (_busy) {
      return;
    }
    _selectedTableId = table.id;
    _selectedSession = null;
    _attachableOrders = const [];
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
    final sessionId = table.session?.id;
    if (sessionId == null) {
      return;
    }
    await _loadSession(sessionId);
  }

  void closeSelection() {
    if (_busy) {
      return;
    }
    _selectedTableId = null;
    _selectedSession = null;
    _attachableOrders = const [];
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  Future<bool> openSession({
    required DiningTableFloor table,
    required int guestCount,
    String? note,
  }) async {
    if (_busy || _locationId == null) {
      return false;
    }
    _setBusy();
    try {
      final session = await _hospitality.openTableSession(
        clientSessionId: UuidV4.generate(),
        tableId: table.id,
        guestCount: guestCount,
        note: _normalize(note),
      );
      _acceptSession(session);
      _noticeMessage = 'Tavolo ${table.code} aperto.';
      await _refreshFloorSilently();
      return true;
    } on BackendError catch (error) {
      await _handleSessionError(error);
      return false;
    } on FormatException {
      _errorMessage =
          'Il backend ha restituito una sessione tavolo non valida.';
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile aprire il tavolo.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> updateSession({
    required int guestCount,
    required String note,
  }) async {
    final session = _selectedSession;
    if (_busy || session == null || !session.status.isOpen) {
      return false;
    }
    _setBusy();
    try {
      final updated = await _hospitality.updateTableSession(
        sessionId: session.id,
        mutationId: UuidV4.generate(),
        expectedVersion: session.version,
        guestCount: guestCount,
        note: note.trim(),
      );
      _acceptSession(updated);
      _noticeMessage = 'Dati del tavolo aggiornati.';
      await _refreshFloorSilently();
      return true;
    } on BackendError catch (error) {
      await _handleSessionError(error);
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile aggiornare il tavolo.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> moveSession(DiningTableFloor target) async {
    final session = _selectedSession;
    if (_busy || session == null || !session.status.isOpen) {
      return false;
    }
    _setBusy();
    try {
      final updated = await _hospitality.moveTableSession(
        sessionId: session.id,
        mutationId: UuidV4.generate(),
        expectedVersion: session.version,
        tableId: target.id,
      );
      _acceptSession(updated);
      _selectedTableId = target.id;
      _noticeMessage = 'Conto spostato al tavolo ${target.code}.';
      await _refreshFloorSilently();
      return true;
    } on BackendError catch (error) {
      await _handleSessionError(error);
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile spostare il tavolo.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<OrderDetail?> createAndAttachOrder() async {
    final session = _selectedSession;
    final currentLocationId = _locationId;
    if (_busy ||
        session == null ||
        !session.status.isOpen ||
        currentLocationId == null) {
      return null;
    }
    _setBusy();
    try {
      final tableCode = session.table?.code ?? 'TABLE';
      final order = await _orders.createOrder(
        clientOrderId: UuidV4.generate(),
        locationId: currentLocationId,
        serviceMode: OrderServiceMode.table,
        customerNote: 'Tavolo $tableCode',
      );
      final updated = await _hospitality.attachOrder(
        sessionId: session.id,
        mutationId: UuidV4.generate(),
        expectedVersion: session.version,
        orderId: order.header.id,
      );
      _acceptSession(updated);
      _noticeMessage = 'Ordine ${order.header.number} collegato al tavolo.';
      await _refreshFloorSilently();
      return order;
    } on BackendError catch (error) {
      await _handleSessionError(error);
      return null;
    } catch (_) {
      _errorMessage = 'Impossibile creare e collegare l’ordine al tavolo.';
      return null;
    } finally {
      _finishBusy();
    }
  }

  Future<void> loadAttachableOrders() async {
    final currentLocationId = _locationId;
    final session = _selectedSession;
    if (_busy || currentLocationId == null || session == null) {
      return;
    }
    _setBusy();
    try {
      final pages = await Future.wait<OrderListPage>([
        _orders.listOrders(
          locationId: currentLocationId,
          status: OrderStatus.open,
          pageSize: 100,
        ),
        _orders.listOrders(
          locationId: currentLocationId,
          status: OrderStatus.held,
          pageSize: 100,
        ),
      ]);
      final attachedIds = session.orders.map((order) => order.id).toSet();
      _attachableOrders = pages
          .expand((page) => page.items)
          .where(
            (order) =>
                order.serviceMode == OrderServiceMode.table &&
                !attachedIds.contains(order.id),
          )
          .toList(growable: false);
    } on BackendError catch (error) {
      _attachableOrders = const [];
      _errorMessage = error.message;
    } catch (_) {
      _attachableOrders = const [];
      _errorMessage = 'Impossibile recuperare gli ordini collegabili.';
    } finally {
      _finishBusy();
    }
  }

  Future<bool> attachExistingOrder(OrderHeader order) async {
    final session = _selectedSession;
    if (_busy || session == null || !session.status.isOpen) {
      return false;
    }
    _setBusy();
    try {
      final updated = await _hospitality.attachOrder(
        sessionId: session.id,
        mutationId: UuidV4.generate(),
        expectedVersion: session.version,
        orderId: order.id,
      );
      _acceptSession(updated);
      _attachableOrders = _attachableOrders
          .where((item) => item.id != order.id)
          .toList(growable: false);
      _noticeMessage = 'Ordine ${order.number} collegato al tavolo.';
      await _refreshFloorSilently();
      return true;
    } on BackendError catch (error) {
      await _handleSessionError(error);
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile collegare l’ordine al tavolo.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> closeSession({String? reason}) async {
    final session = _selectedSession;
    if (_busy || session == null || !session.status.isOpen) {
      return false;
    }
    _setBusy();
    try {
      final updated = await _hospitality.closeTableSession(
        sessionId: session.id,
        mutationId: UuidV4.generate(),
        expectedVersion: session.version,
        reason: _normalize(reason),
      );
      _selectedSession = updated;
      _noticeMessage = 'Tavolo chiuso e liberato.';
      await _refreshFloorSilently();
      _selectedTableId = null;
      _selectedSession = null;
      return true;
    } on BackendError catch (error) {
      await _handleSessionError(error);
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile chiudere il tavolo.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> cancelSession({String? reason}) async {
    final session = _selectedSession;
    if (_busy || session == null || !session.status.isOpen) {
      return false;
    }
    _setBusy();
    try {
      final updated = await _hospitality.cancelTableSession(
        sessionId: session.id,
        mutationId: UuidV4.generate(),
        expectedVersion: session.version,
        reason: _normalize(reason),
      );
      _selectedSession = updated;
      _noticeMessage = 'Sessione tavolo annullata.';
      await _refreshFloorSilently();
      _selectedTableId = null;
      _selectedSession = null;
      return true;
    } on BackendError catch (error) {
      await _handleSessionError(error);
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile annullare la sessione tavolo.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  void clearMessages() {
    if (_errorMessage == null && _noticeMessage == null) {
      return;
    }
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  void _acceptSession(TableSessionDetail session) {
    if (_locationId == null || session.locationId != _locationId) {
      throw const BackendError(
        message: 'La sessione ricevuta appartiene a una location diversa.',
      );
    }
    _selectedSession = session;
    _selectedTableId = session.tableId;
  }

  Future<void> _loadSession(String sessionId) async {
    _setBusy();
    try {
      final session = await _hospitality.getTableSession(sessionId);
      _acceptSession(session);
    } on BackendError catch (error) {
      _errorMessage = error.message;
    } on FormatException {
      _errorMessage =
          'Il backend ha restituito una sessione tavolo non valida.';
    } catch (_) {
      _errorMessage = 'Impossibile recuperare il dettaglio del tavolo.';
    } finally {
      _finishBusy();
    }
  }

  Future<void> _handleSessionError(BackendError error) async {
    if (error.code == 'TABLE_SESSION_VERSION_CONFLICT' &&
        _selectedSession != null) {
      try {
        final reloaded = await _hospitality.getTableSession(
          _selectedSession!.id,
        );
        _acceptSession(reloaded);
        _errorMessage =
            'Il tavolo è stato aggiornato da un altro dispositivo. Dati ricaricati.';
        await _refreshFloorSilently();
        return;
      } catch (_) {
        _errorMessage = error.message;
        return;
      }
    }
    _errorMessage = error.message;
  }

  Future<void> _refreshFloorSilently() async {
    final currentLocationId = _locationId;
    if (currentLocationId == null) {
      return;
    }
    try {
      final snapshot = await _hospitality.fetchFloor(currentLocationId);
      if (_locationId == currentLocationId &&
          snapshot.locationId == currentLocationId) {
        _floor = snapshot;
        _status = FloorLoadStatus.ready;
        final currentSession = _selectedSession;
        if (currentSession != null && currentSession.status.isOpen) {
          _selectedTableId = currentSession.tableId;
        }
      }
    } catch (_) {
      // The mutation response remains authoritative; the floor can be retried.
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

  String? _normalize(String? value) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }
}
