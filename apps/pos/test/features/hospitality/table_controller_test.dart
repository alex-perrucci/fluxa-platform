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

  test('new order attachment does not wait for floor refresh', () async {
    final hospitality = _ControllableFloorHospitalityGateway();
    final orders = FakeOrdersGateway();
    final controller = TableController(hospitality, orders);

    await controller.bindLocation('location-1');
    await controller.selectTable(controller.floor!.tables.first);

    final reconciliation = Completer<FloorSnapshot>();
    hospitality.pendingFloorRefresh = reconciliation;

    final order = await controller
        .createAndAttachOrder()
        .timeout(const Duration(seconds: 1));

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

    final attached = await controller
        .attachExistingOrder(orders.order.header)
        .timeout(const Duration(seconds: 1));

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
