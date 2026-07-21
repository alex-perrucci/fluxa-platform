import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/device/domain/device_assignment_models.dart';
import 'package:fluxa_pos/features/hospitality/presentation/kitchen_controller.dart';
import 'package:fluxa_pos/features/hospitality/presentation/kitchen_screen.dart';
import 'package:fluxa_pos/features/hospitality/presentation/table_controller.dart';
import 'package:fluxa_pos/features/hospitality/presentation/tables_screen.dart';
import 'package:fluxa_pos/features/orders/presentation/order_controller.dart';

import 'fakes.dart';

void main() {
  const location = OperationalLocation(
    id: 'location-1',
    code: 'PARMA',
    name: 'Parma Centro',
    timezone: 'Europe/Rome',
    status: 'ACTIVE',
  );

  testWidgets('shows floor tables and occupancy', (tester) async {
    final orders = FakeOrdersGateway();
    final tableController = TableController(FakeHospitalityGateway(), orders);
    final orderController = OrderController(orders);
    await tableController.bindLocation('location-1');
    await orderController.bindLocation('location-1');

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: TablesView(
            controller: tableController,
            orderController: orderController,
            location: location,
            canManage: false,
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Tavolo 1'), findsOneWidget);
    expect(find.text('Tavolo 2'), findsOneWidget);
    expect(find.textContaining('2 coperti'), findsOneWidget);
  });

  testWidgets('shows kitchen tickets and stations', (tester) async {
    final controller = KitchenController(FakeHospitalityGateway());
    await controller.bindLocation('location-1');

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: KitchenView(
            controller: controller,
            location: location,
            canCancel: false,
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('K-20260721-0001'), findsOneWidget);
    expect(find.text('Cucina'), findsWidgets);
    expect(
      find.descendant(
        of: find.byKey(const Key('kitchen-ticket-ticket-1')),
        matching: find.text('In coda'),
      ),
      findsOneWidget,
    );
  });
}
