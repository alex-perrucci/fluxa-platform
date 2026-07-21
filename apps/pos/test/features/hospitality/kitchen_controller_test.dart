import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/network/backend_error.dart';
import 'package:fluxa_pos/features/hospitality/domain/hospitality_models.dart';
import 'package:fluxa_pos/features/hospitality/presentation/kitchen_controller.dart';

import 'fakes.dart';

void main() {
  test('loads stations and tickets for current location', () async {
    final controller = KitchenController(FakeHospitalityGateway());

    await controller.bindLocation('location-1');

    expect(controller.status, KitchenLoadStatus.ready);
    expect(controller.activeStations.single.name, 'Cucina');
    expect(controller.tickets.single.number, 'K-20260721-0001');
  });

  test('dispatches an order idempotently and refreshes tickets', () async {
    final gateway = FakeHospitalityGateway();
    final controller = KitchenController(gateway);

    await controller.bindLocation('location-1');
    final dispatched = await controller.dispatchOrder(
      locationId: 'location-1',
      orderId: 'order-1',
    );

    expect(dispatched, isTrue);
    expect(gateway.dispatchCalls, 1);
    expect(controller.noticeMessage, contains('Comanda'));
  });

  test('reloads ticket after optimistic concurrency conflict', () async {
    final gateway = FakeHospitalityGateway()
      ..transitionError = const BackendError(
        code: 'KITCHEN_TICKET_VERSION_CONFLICT',
        message: 'Conflitto.',
        statusCode: 409,
      );
    final controller = KitchenController(gateway);

    await controller.bindLocation('location-1');
    await controller.selectTicket('ticket-1');
    final changed = await controller.transitionTicket(
      kitchenTicketFixture(),
      KitchenTicketStatus.inProgress,
    );

    expect(changed, isFalse);
    expect(controller.selectedTicket?.ticket.id, 'ticket-1');
    expect(controller.errorMessage, contains('altro dispositivo'));
  });
}
