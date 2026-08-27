import 'package:fluxa_pos/core/network/backend_error.dart';
import 'package:fluxa_pos/features/hospitality/data/hospitality_api.dart';
import 'package:fluxa_pos/features/hospitality/domain/hospitality_models.dart';
import 'package:fluxa_pos/features/orders/data/orders_api.dart';
import 'package:fluxa_pos/features/orders/domain/order_models.dart';

class FakeHospitalityGateway implements HospitalityGateway {
  FakeHospitalityGateway({
    FloorSnapshot? floor,
    TableSessionDetail? session,
    List<KitchenStation>? stations,
    List<KitchenTicketSummary>? tickets,
    KitchenTicketDetail? ticketDetail,
    KitchenDispatchBatch? batch,
  }) : floor = floor ?? hospitalityFloorFixture(),
       session = session ?? tableSessionFixture(),
       stations = stations ?? [kitchenStationFixture()],
       tickets = tickets ?? [kitchenTicketFixture()],
       ticketDetail = ticketDetail ?? kitchenTicketDetailFixture(),
       batch = batch ?? kitchenBatchFixture();

  FloorSnapshot floor;
  TableSessionDetail session;
  List<KitchenStation> stations;
  List<KitchenTicketSummary> tickets;
  KitchenTicketDetail ticketDetail;
  KitchenDispatchBatch batch;
  BackendError? updateSessionError;
  BackendError? transitionError;
  BackendError? dispatchError;
  String? attachedOrderId;
  int dispatchCalls = 0;
  final List<String> dispatchBatchIds = [];

  @override
  Future<FloorSnapshot> fetchFloor(String locationId) async => floor;

  @override
  Future<TableSessionDetail> getTableSession(String sessionId) async => session;

  @override
  Future<TableSessionDetail> openTableSession({
    required String clientSessionId,
    required String tableId,
    required int guestCount,
    String? note,
  }) async => session;

  @override
  Future<TableSessionDetail> updateTableSession({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    required int guestCount,
    required String note,
  }) async {
    final error = updateSessionError;
    if (error != null) {
      throw error;
    }
    return session;
  }

  @override
  Future<TableSessionDetail> attachOrder({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    required String orderId,
  }) async {
    attachedOrderId = orderId;
    return session;
  }

  @override
  Future<TableSessionDetail> moveTableSession({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    required String tableId,
  }) async => session;

  @override
  Future<TableSessionDetail> closeTableSession({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    String? reason,
  }) async => session;

  @override
  Future<TableSessionDetail> cancelTableSession({
    required String sessionId,
    required String mutationId,
    required int expectedVersion,
    String? reason,
  }) async => session;

  @override
  Future<List<KitchenStation>> listKitchenStations(String locationId) async =>
      stations;

  @override
  Future<List<KitchenTicketSummary>> listKitchenTickets({
    required String locationId,
    String? stationId,
    KitchenTicketStatus? status,
  }) async => tickets
      .where(
        (ticket) =>
            (stationId == null || ticket.stationId == stationId) &&
            (status == null || ticket.status == status),
      )
      .toList(growable: false);

  @override
  Future<KitchenTicketDetail> getKitchenTicket(String ticketId) async =>
      ticketDetail;

  @override
  Future<KitchenDispatchBatch> dispatchOrderToKitchen({
    required String orderId,
    required String clientBatchId,
  }) async {
    dispatchCalls += 1;
    dispatchBatchIds.add(clientBatchId);
    final error = dispatchError;
    if (error != null) {
      throw error;
    }
    return batch;
  }

  @override
  Future<KitchenTicketDetail> transitionKitchenTicket({
    required String ticketId,
    required String mutationId,
    required int expectedVersion,
    required KitchenTicketStatus nextStatus,
  }) async {
    final error = transitionError;
    if (error != null) {
      throw error;
    }
    return ticketDetail;
  }
}

class FakeOrdersGateway implements OrdersGateway {
  FakeOrdersGateway({OrderDetail? order})
    : order = order ?? orderDetailFixture();

  OrderDetail order;
  OrderServiceMode? createdServiceMode;

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
    items: [order.header],
  );

  @override
  Future<OrderDetail> getOrder(String orderId) async => order;

  @override
  Future<OrderDetail> createOrder({
    required String clientOrderId,
    required String locationId,
    required OrderServiceMode serviceMode,
    String? customerNote,
  }) async {
    createdServiceMode = serviceMode;
    return order;
  }

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
  }) async => order;

  @override
  Future<OrderDetail> addManualItem({
    required String orderId,
    required String mutationId,
    required String clientItemId,
    required int expectedVersion,
    required int amountCents,
    String? description,
    String? note,
  }) async => order;

  @override
  Future<OrderDetail> updateItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
    int? quantityAmount,
    String? note,
  }) async => order;

  @override
  Future<OrderDetail> deleteItem({
    required String orderId,
    required String itemId,
    required String mutationId,
    required int expectedVersion,
  }) async => order;

  @override
  Future<OrderDetail> hold({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  }) async => order;

  @override
  Future<OrderDetail> resume({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
  }) async => order;

  @override
  Future<OrderDetail> cancelOrder({
    required String orderId,
    required String mutationId,
    required int expectedVersion,
    String? reason,
  }) async => order;
}

FloorSnapshot hospitalityFloorFixture() => FloorSnapshot.fromJson({
  'locationId': 'location-1',
  'areas': [
    {
      'id': 'area-1',
      'code': 'SALA',
      'name': 'Sala principale',
      'sortOrder': 10,
      'tables': [
        {
          'id': 'table-1',
          'code': 'T01',
          'name': 'Tavolo 1',
          'capacity': 4,
          'sortOrder': 10,
          'occupied': true,
          'session': {
            'id': 'session-1',
            'guestCount': 2,
            'openedAt': '2026-07-21T10:00:00.000Z',
            'version': 1,
            'openTotalCents': 1200,
            'orderCount': 1,
          },
        },
        {
          'id': 'table-2',
          'code': 'T02',
          'name': 'Tavolo 2',
          'capacity': 2,
          'sortOrder': 20,
          'occupied': false,
          'session': null,
        },
      ],
    },
  ],
});

TableSessionDetail tableSessionFixture() => TableSessionDetail.fromJson({
  'id': 'session-1',
  'organizationId': 'organization-1',
  'locationId': 'location-1',
  'tableId': 'table-1',
  'deviceId': 'device-1',
  'clientSessionId': 'client-session-1',
  'status': 'OPEN',
  'guestCount': 2,
  'note': 'Finestra',
  'version': 1,
  'openedAt': '2026-07-21T10:00:00.000Z',
  'closedAt': null,
  'cancelledAt': null,
  'table': {
    'id': 'table-1',
    'code': 'T01',
    'name': 'Tavolo 1',
    'capacity': 4,
    'areaId': 'area-1',
    'areaCode': 'SALA',
    'areaName': 'Sala principale',
  },
  'orders': [orderHeaderJson()],
});

KitchenStation kitchenStationFixture() => KitchenStation.fromJson({
  'id': 'station-1',
  'organizationId': 'organization-1',
  'locationId': 'location-1',
  'code': 'CUCINA',
  'name': 'Cucina',
  'sortOrder': 10,
  'status': 'ACTIVE',
});

KitchenTicketSummary kitchenTicketFixture({
  String status = 'QUEUED',
  int version = 1,
}) => KitchenTicketSummary.fromJson({
  'id': 'ticket-1',
  'organizationId': 'organization-1',
  'locationId': 'location-1',
  'orderId': 'order-1',
  'stationId': 'station-1',
  'number': 'K-20260721-0001',
  'status': status,
  'version': version,
  'tableCodeSnapshot': 'T01',
  'queuedAt': '2026-07-21T10:05:00.000Z',
});

KitchenTicketDetail kitchenTicketDetailFixture({
  String status = 'IN_PROGRESS',
  int version = 2,
}) => KitchenTicketDetail.fromJson({
  'id': 'ticket-1',
  'organizationId': 'organization-1',
  'locationId': 'location-1',
  'orderId': 'order-1',
  'stationId': 'station-1',
  'number': 'K-20260721-0001',
  'status': status,
  'version': version,
  'tableCodeSnapshot': 'T01',
  'queuedAt': '2026-07-21T10:05:00.000Z',
  'station': {'id': 'station-1', 'code': 'CUCINA', 'name': 'Cucina'},
  'items': [
    {
      'id': 'ticket-item-1',
      'orderItemId': 'order-item-1',
      'quantityAmount': 2,
      'quantityScale': 0,
      'productName': 'Pizza',
      'variantName': 'Margherita',
      'note': 'Senza basilico',
    },
  ],
});

KitchenDispatchBatch kitchenBatchFixture() => KitchenDispatchBatch.fromJson({
  'id': 'batch-1',
  'locationId': 'location-1',
  'orderId': 'order-1',
  'clientBatchId': 'client-batch-1',
  'createdAt': '2026-07-21T10:05:00.000Z',
  'tickets': [
    {
      'id': 'ticket-1',
      'organizationId': 'organization-1',
      'locationId': 'location-1',
      'orderId': 'order-1',
      'stationId': 'station-1',
      'number': 'K-20260721-0001',
      'status': 'QUEUED',
      'version': 1,
      'tableCodeSnapshot': 'T01',
      'queuedAt': '2026-07-21T10:05:00.000Z',
    },
  ],
});

OrderDetail orderDetailFixture({
  String status = 'OPEN',
  String serviceMode = 'TABLE',
}) => OrderDetail.fromJson({
  ...orderHeaderJson(status: status, serviceMode: serviceMode),
  'items': [],
  'adjustments': [],
  'vatSummaries': [],
});

Map<String, Object?> orderHeaderJson({
  String status = 'OPEN',
  String serviceMode = 'TABLE',
}) => {
  'id': 'order-1',
  'organizationId': 'organization-1',
  'locationId': 'location-1',
  'deviceId': 'device-1',
  'createdByUserId': 'user-1',
  'clientOrderId': 'client-order-1',
  'number': '20260721-0001',
  'businessDate': '2026-07-21',
  'status': status,
  'serviceMode': serviceMode,
  'customerNote': null,
  'currency': 'EUR',
  'version': 1,
  'subtotalCents': 1200,
  'discountCents': 0,
  'totalCents': 1200,
  'netTotalCents': 1091,
  'taxTotalCents': 109,
  'heldAt': null,
  'cancelledAt': null,
  'cancelReason': null,
  'createdAt': '2026-07-21T10:00:00.000Z',
  'updatedAt': '2026-07-21T10:00:00.000Z',
};
