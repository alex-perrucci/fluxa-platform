import 'package:flutter/foundation.dart';

import '../../../core/network/backend_error.dart';
import '../../catalog/domain/catalog_models.dart';
import '../data/orders_api.dart';
import '../domain/order_models.dart';
import '../domain/uuid_v4.dart';

enum OrdersLoadStatus { idle, loading, ready, failure }

class OrderController extends ChangeNotifier {
  OrderController(this._gateway);

  final OrdersGateway _gateway;
  String? _locationId;
  OrderDraft? _draft;
  OrderDetail? _activeOrder;
  List<OrderHeader> _orders = const [];
  OrdersLoadStatus _listStatus = OrdersLoadStatus.idle;
  OrderStatus? _statusFilter;
  bool _busy = false;
  String? _errorMessage;
  String? _noticeMessage;
  int _requestVersion = 0;

  String? get locationId => _locationId;
  OrderDraft? get draft => _draft;
  OrderDetail? get activeOrder => _activeOrder;
  List<OrderHeader> get orders => _orders;
  OrdersLoadStatus get listStatus => _listStatus;
  OrderStatus? get statusFilter => _statusFilter;
  bool get busy => _busy;
  String? get errorMessage => _errorMessage;
  String? get noticeMessage => _noticeMessage;
  bool get hasCurrentOrder => _draft != null || _activeOrder != null;
  bool get canAddItems =>
      _draft != null || _activeOrder?.header.status.isEditable == true;

  Future<void> bindLocation(String locationId) async {
    if (_locationId == locationId) {
      if (_listStatus == OrdersLoadStatus.idle) {
        await refreshOrders();
      }
      return;
    }
    _requestVersion += 1;
    _locationId = locationId;
    _draft = null;
    _activeOrder = null;
    _orders = const [];
    _statusFilter = null;
    _errorMessage = null;
    _noticeMessage = null;
    _listStatus = OrdersLoadStatus.idle;
    notifyListeners();
    await refreshOrders();
  }

  void clearLocation() {
    _requestVersion += 1;
    _locationId = null;
    _draft = null;
    _activeOrder = null;
    _orders = const [];
    _listStatus = OrdersLoadStatus.idle;
    _statusFilter = null;
    _busy = false;
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  void startDraft({
    required OrderServiceMode serviceMode,
    String? customerNote,
  }) {
    if (_busy) {
      return;
    }
    _activeOrder = null;
    _draft = OrderDraft(
      clientOrderId: UuidV4.generate(),
      serviceMode: serviceMode,
      customerNote: _normalizeNote(customerNote),
    );
    _errorMessage = null;
    _noticeMessage = 'Bozza pronta. Seleziona un prodotto dal catalogo.';
    notifyListeners();
  }

  void discardCurrentView() {
    if (_busy) {
      return;
    }
    _draft = null;
    _activeOrder = null;
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  void clearMessages() {
    if (_errorMessage == null && _noticeMessage == null) {
      return;
    }
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  Future<void> refreshOrders() async {
    final currentLocationId = _locationId;
    if (currentLocationId == null) {
      return;
    }
    final requestVersion = ++_requestVersion;
    _listStatus = OrdersLoadStatus.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      final page = await _gateway.listOrders(
        locationId: currentLocationId,
        status: _statusFilter,
      );
      if (requestVersion != _requestVersion ||
          _locationId != currentLocationId) {
        return;
      }
      _orders = page.items;
      _listStatus = OrdersLoadStatus.ready;
    } on BackendError catch (error) {
      if (requestVersion != _requestVersion) {
        return;
      }
      _orders = const [];
      _errorMessage = error.message;
      _listStatus = OrdersLoadStatus.failure;
    } on FormatException {
      if (requestVersion != _requestVersion) {
        return;
      }
      _orders = const [];
      _errorMessage = 'Il backend ha restituito una lista ordini non valida.';
      _listStatus = OrdersLoadStatus.failure;
    } catch (_) {
      if (requestVersion != _requestVersion) {
        return;
      }
      _orders = const [];
      _errorMessage = 'Impossibile recuperare gli ordini.';
      _listStatus = OrdersLoadStatus.failure;
    }
    notifyListeners();
  }

  Future<void> setStatusFilter(OrderStatus? status) async {
    if (_statusFilter == status) {
      return;
    }
    _statusFilter = status;
    await refreshOrders();
  }

  Future<bool> selectOrder(String orderId) async {
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      final order = await _gateway.getOrder(orderId);
      if (!_matchesLocation(order)) {
        throw const BackendError(
          message: 'L’ordine ricevuto appartiene a una location diversa.',
        );
      }
      _draft = null;
      _activeOrder = order;
      _noticeMessage = null;
      return true;
    } on BackendError catch (error) {
      _errorMessage = error.message;
      return false;
    } on FormatException {
      _errorMessage = 'Il backend ha restituito un ordine non valido.';
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile aprire l’ordine.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> addCatalogItem({
    required CatalogProduct product,
    CatalogVariant? variant,
    required int quantityAmount,
    String? note,
  }) async {
    final currentLocationId = _locationId;
    if (currentLocationId == null) {
      _errorMessage = 'Location operativa non disponibile.';
      notifyListeners();
      return false;
    }
    if (!canAddItems) {
      _errorMessage = 'Crea o riprendi un ordine prima di aggiungere prodotti.';
      notifyListeners();
      return false;
    }
    final effectivePrice = variant?.price ?? product.price;
    if (effectivePrice == null) {
      _errorMessage = 'Il prodotto selezionato non ha un prezzo utilizzabile.';
      notifyListeners();
      return false;
    }
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      var order = _activeOrder;
      final currentDraft = _draft;
      if (order == null) {
        if (currentDraft == null) {
          throw const BackendError(message: 'Bozza ordine non disponibile.');
        }
        order = await _gateway.createOrder(
          clientOrderId: currentDraft.clientOrderId,
          locationId: currentLocationId,
          serviceMode: currentDraft.serviceMode,
          customerNote: currentDraft.customerNote,
        );
        if (!_matchesLocation(order)) {
          throw const BackendError(
            message: 'L’ordine creato appartiene a una location diversa.',
          );
        }
        _activeOrder = order;
        _draft = null;
      }
      final updated = await _gateway.addItem(
        orderId: order.header.id,
        mutationId: UuidV4.generate(),
        clientItemId: UuidV4.generate(),
        expectedVersion: order.header.version,
        productId: product.id,
        variantId: variant?.id,
        quantityAmount: quantityAmount,
        note: _normalizeNote(note),
      );
      _activeOrder = updated;
      _noticeMessage = '${product.name} aggiunto all’ordine.';
      await _refreshOrdersSilently();
      return true;
    } on BackendError catch (error) {
      await _handleMutationError(error);
      return false;
    } on FormatException {
      _errorMessage = 'Il backend ha restituito un ordine non valido.';
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile aggiungere il prodotto all’ordine.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> updateItem({
    required OrderItem item,
    required int quantityAmount,
    String? note,
  }) async {
    final order = _activeOrder;
    if (order == null || order.header.status != OrderStatus.open || _busy) {
      return false;
    }
    _setBusy();
    try {
      _activeOrder = await _gateway.updateItem(
        orderId: order.header.id,
        itemId: item.id,
        mutationId: UuidV4.generate(),
        expectedVersion: order.header.version,
        quantityAmount: quantityAmount,
        note: note?.trim() ?? '',
      );
      _noticeMessage = 'Riga aggiornata.';
      await _refreshOrdersSilently();
      return true;
    } on BackendError catch (error) {
      await _handleMutationError(error);
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile aggiornare la riga.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> deleteItem(OrderItem item) async {
    final order = _activeOrder;
    if (order == null || order.header.status != OrderStatus.open || _busy) {
      return false;
    }
    _setBusy();
    try {
      _activeOrder = await _gateway.deleteItem(
        orderId: order.header.id,
        itemId: item.id,
        mutationId: UuidV4.generate(),
        expectedVersion: order.header.version,
      );
      _noticeMessage = 'Riga rimossa.';
      await _refreshOrdersSilently();
      return true;
    } on BackendError catch (error) {
      await _handleMutationError(error);
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile eliminare la riga.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> holdActiveOrder() async {
    final order = _activeOrder;
    if (order == null || !order.canHold || _busy) {
      _errorMessage = 'Un ordine vuoto non può essere messo in attesa.';
      notifyListeners();
      return false;
    }
    _setBusy();
    try {
      _activeOrder = await _gateway.hold(
        orderId: order.header.id,
        mutationId: UuidV4.generate(),
        expectedVersion: order.header.version,
      );
      _noticeMessage = 'Ordine ${order.header.number} messo in attesa.';
      await _refreshOrdersSilently();
      return true;
    } on BackendError catch (error) {
      await _handleMutationError(error);
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile mettere in attesa l’ordine.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> resumeOrder(String orderId) async {
    if (_busy) {
      return false;
    }
    _setBusy();
    try {
      final order = await _gateway.getOrder(orderId);
      if (order.header.status != OrderStatus.held) {
        throw const BackendError(
          message: 'Solo un ordine in attesa può essere ripreso.',
        );
      }
      final updated = await _gateway.resume(
        orderId: order.header.id,
        mutationId: UuidV4.generate(),
        expectedVersion: order.header.version,
      );
      _draft = null;
      _activeOrder = updated;
      _noticeMessage = 'Ordine ${updated.header.number} ripreso.';
      await _refreshOrdersSilently();
      return true;
    } on BackendError catch (error) {
      await _handleMutationError(error);
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile riprendere l’ordine.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  bool _matchesLocation(OrderDetail order) =>
      _locationId != null && order.header.locationId == _locationId;

  Future<void> _handleMutationError(BackendError error) async {
    if (error.code == 'ORDER_VERSION_CONFLICT' && _activeOrder != null) {
      try {
        _activeOrder = await _gateway.getOrder(_activeOrder!.header.id);
        _errorMessage =
            'L’ordine è stato aggiornato da un altro dispositivo. Dati ricaricati.';
        await _refreshOrdersSilently();
        return;
      } catch (_) {
        _errorMessage = error.message;
        return;
      }
    }
    _errorMessage = error.message;
  }

  Future<void> _refreshOrdersSilently() async {
    final currentLocationId = _locationId;
    if (currentLocationId == null) {
      return;
    }
    try {
      final page = await _gateway.listOrders(
        locationId: currentLocationId,
        status: _statusFilter,
      );
      if (_locationId == currentLocationId) {
        _orders = page.items;
        _listStatus = OrdersLoadStatus.ready;
      }
    } catch (_) {
      // The mutation response remains authoritative; list refresh can be retried.
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

  String? _normalizeNote(String? value) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }
}
