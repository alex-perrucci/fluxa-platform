import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/hospitality/domain/hospitality_models.dart';

import 'fakes.dart';

void main() {
  test('parses the floor occupancy summary', () {
    final floor = hospitalityFloorFixture();

    expect(floor.locationId, 'location-1');
    expect(floor.areas, hasLength(1));
    expect(floor.tables, hasLength(2));
    expect(floor.tables.first.occupied, isTrue);
    expect(floor.tables.first.session?.openTotalCents, 1200);
    expect(floor.tables.last.occupied, isFalse);
  });

  test('parses a table session with attached TABLE orders', () {
    final session = tableSessionFixture();

    expect(session.status, TableSessionStatus.open);
    expect(session.table?.code, 'T01');
    expect(session.orders.single.serviceMode.wireValue, 'TABLE');
    expect(session.totalCents, 1200);
    expect(session.hasBlockingOrders, isTrue);
  });

  test('parses kitchen station, ticket items and dispatch batch', () {
    final detail = kitchenTicketDetailFixture();
    final batch = kitchenBatchFixture();

    expect(detail.ticket.status, KitchenTicketStatus.inProgress);
    expect(detail.station?.name, 'Cucina');
    expect(detail.items.single.displayName, 'Pizza · Margherita');
    expect(detail.items.single.displayQuantity, '2');
    expect(batch.tickets.single.status, KitchenTicketStatus.queued);
  });
}
