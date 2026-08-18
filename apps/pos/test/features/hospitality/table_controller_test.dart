import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/network/backend_error.dart';
import 'package:fluxa_pos/features/hospitality/domain/hospitality_models.dart';
import 'package:fluxa_pos/features/hospitality/presentation/table_controller.dart';
import 'package:fluxa_pos/features/orders/domain/order_models.dart';

import 'fakes.dart';

void main() {
  test('loads floor and opens occupied table detail', () async {
    final hospitality = FakeHospitalityGateway();
    final controller = TableController(hospitality, FakeOrdersGateway());

    await controller.bindLocation('location-1');
    await controller.selectTable(controller.floor!.tables.first);

    expect(controller.status, FloorLoadStatus.ready);
    expect(controller.selectedSession?.id, 'session-1');
    expect(controller.selectedTable?.code, 'T01');
  });

  test('creates a TABLE order and attaches it with current version', () async {
    final hospitality = FakeHospitalityGateway();
    final orders = FakeOrdersGateway();
    final controller = TableController(hospitality, orders);

    await controller.bindLocation('location-1');
    await controller.selectTable(controller.floor!.tables.first);
    final order = await controller.createAndAttachOrder();

    expect(order?.header.id, 'order-1');
    expect(orders.createdServiceMode, OrderServiceMode.table);
    expect(hospitality.attachedOrderId, 'order-1');
  });

  test('opens a table and creates its order in one workflow', () async {
    final hospitality = FakeHospitalityGateway();
    final orders = FakeOrdersGateway();
    final controller = TableController(hospitality, orders);

    await controller.bindLocation('location-1');
    final table = controller.floor!.tables.last;
    final order = await controller.openSessionAndCreateOrder(
      table: table,
      guestCount: 2,
    );

    expect(order?.header.id, 'order-1');
    expect(orders.createdServiceMode, OrderServiceMode.table);
    expect(hospitality.attachedOrderId, 'order-1');
    expect(controller.noticeMessage, contains('aperto con ordine'));
  });

  test('lists a COUNTER order as attachable and de-duplicates it', () async {
    final hospitality = FakeHospitalityGateway(session: _emptyTableSession());
    final orders = FakeOrdersGateway(
      order: orderDetailFixture(serviceMode: 'COUNTER'),
    );
    final controller = TableController(hospitality, orders);

    await controller.bindLocation('location-1');
    await controller.selectTable(controller.floor!.tables.first);
    await controller.loadAttachableOrders();

    expect(controller.attachableOrders, hasLength(1));
    expect(
      controller.attachableOrders.single.serviceMode,
      OrderServiceMode.counter,
    );

    final attached = await controller.attachExistingOrder(
      controller.attachableOrders.single,
    );

    expect(attached, isTrue);
    expect(controller.noticeMessage, contains('convertito in Tavolo'));
  });

  test('new order attachment does not wait for floor refresh', () async {
    final hospitality = _ControllableFloorHospitalityGateway();
    final orders = FakeOrdersGateway();
    final controller = TableController(hospitality, orders);

    await controller.bindLocation('location-1');
    await controller.selectTable(controller.floor!.tables.first);

    final reconciliation = Completer<FloorSnapshot>();
    hospitality.pendingFloorRefresh = reconciliation;

    final pendingOrder = controller.createAndAttachOrder();
    final order = await pendingOrder.timeout(const Duration(seconds: 1));

    expect(order?.header.id, 'order-1');
    expect(controller.busy, isFalse);
    expect(controller.noticeMessage, contains('collegato al tavolo'));

    reconciliation.complete(hospitality.floor);
    await Future<void>.delayed(Duration.zero);
  });

  test('existing order attachment does not wait for floor refresh', () async {
    final hospitality = _ControllableFloorHospitalityGateway();
    final orders = FakeOrdersGateway();
    final controller = TableController(hospitality, orders);

    await controller.bindLocation('location-1');
    await controller.selectTable(controller.floor!.tables.first);

    final reconciliation = Completer<FloorSnapshot>();
    hospitality.pendingFloorRefresh = reconciliation;

    final pendingAttach = controller.attachExistingOrder(orders.order.header);
    final attached = await pendingAttach.timeout(const Duration(seconds: 1));

    expect(attached, isTrue);
    expect(controller.busy, isFalse);
    expect(controller.noticeMessage, contains('collegato al tavolo'));

    reconciliation.complete(hospitality.floor);
    await Future<void>.delayed(Duration.zero);
  });

  test('reloads authoritative session after version conflict', () async {
    final hospitality = FakeHospitalityGateway()
      ..updateSessionError = const BackendError(
        code: 'TABLE_SESSION_VERSION_CONFLICT',
        message: 'Conflitto.',
        statusCode: 409,
      );
    final controller = TableController(hospitality, FakeOrdersGateway());

    await controller.bindLocation('location-1');
    await controller.selectTable(controller.floor!.tables.first);
    final updated = await controller.updateSession(
      guestCount: 3,
      note: 'Aggiornata',
    );

    expect(updated, isFalse);
    expect(controller.selectedSession?.id, 'session-1');
    expect(controller.errorMessage, contains('altro dispositivo'));
  });
}

TableSessionDetail _emptyTableSession() => TableSessionDetail.fromJson({
  'id': 'session-1',
  'organizationId': 'organization-1',
  'locationId': 'location-1',
  'tableId': 'table-1',
  'deviceId': 'device-1',
  'clientSessionId': 'client-session-1',
  'status': 'OPEN',
  'guestCount': 2,
  'note': null,
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
  'orders': [],
});

class _ControllableFloorHospitalityGateway extends FakeHospitalityGateway {
  Completer<FloorSnapshot>? pendingFloorRefresh;

  @override
  Future<FloorSnapshot> fetchFloor(String locationId) {
    final pending = pendingFloorRefresh;
    if (pending != null) {
      return pending.future;
    }
    return super.fetchFloor(locationId);
  }
}
