import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/catalog/presentation/cashier_responsive_layout.dart';

void main() {
  group('CashierLayoutPolicy', () {
    test('uses side by side layout only when content is wide enough', () {
      expect(
        CashierLayoutPolicy.useSideBySide(
          const BoxConstraints(maxWidth: 979, maxHeight: 900),
        ),
        isFalse,
      );
      expect(
        CashierLayoutPolicy.useSideBySide(
          const BoxConstraints(maxWidth: 980, maxHeight: 900),
        ),
        isTrue,
      );
    });

    test('reserves enough height for an active order footer and item list', () {
      expect(
        CashierLayoutPolicy.stackedOrderHeight(hasActiveContent: true),
        390,
      );
      expect(
        CashierLayoutPolicy.stackedOrderHeight(hasActiveContent: false),
        210,
      );
    });

    test('short viewports scroll instead of crushing the order pane', () {
      expect(
        CashierLayoutPolicy.needsOuterScroll(
          const BoxConstraints(maxWidth: 390, maxHeight: 680),
          orderPaneHeight: 390,
        ),
        isTrue,
      );
      expect(
        CashierLayoutPolicy.needsOuterScroll(
          const BoxConstraints(maxWidth: 820, maxHeight: 900),
          orderPaneHeight: 390,
        ),
        isFalse,
      );
    });

    test('primary actions stack only on narrow phone panes', () {
      expect(CashierLayoutPolicy.stackPrimaryActions(390), isTrue);
      expect(CashierLayoutPolicy.stackPrimaryActions(430), isFalse);
    });
  });

  testWidgets('short phone workspace keeps order and catalog reachable', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 680);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: CashierResponsiveWorkspace(
            hasActiveContent: true,
            orderPane: ColoredBox(
              key: Key('order-pane'),
              color: Colors.black,
            ),
            catalogPane: ColoredBox(
              key: Key('catalog-pane'),
              color: Colors.white,
            ),
          ),
        ),
      ),
    );

    expect(find.byKey(const Key('cashier-responsive-scroll')), findsOneWidget);
    expect(find.byKey(const Key('order-pane')), findsOneWidget);
    expect(find.byKey(const Key('catalog-pane')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tablet viewport uses a stable stacked layout', (tester) async {
    tester.view.physicalSize = const Size(820, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: CashierResponsiveWorkspace(
            hasActiveContent: true,
            orderPane: ColoredBox(color: Colors.black),
            catalogPane: ColoredBox(color: Colors.white),
          ),
        ),
      ),
    );

    expect(find.byKey(const Key('cashier-responsive-scroll')), findsNothing);
    expect(find.byType(Row), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('desktop viewport keeps catalog and order side by side', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: CashierResponsiveWorkspace(
            hasActiveContent: true,
            orderPane: ColoredBox(
              key: Key('order-pane-wide'),
              color: Colors.black,
            ),
            catalogPane: ColoredBox(
              key: Key('catalog-pane-wide'),
              color: Colors.white,
            ),
          ),
        ),
      ),
    );

    final catalogRight = tester.getTopRight(
      find.byKey(const Key('catalog-pane-wide')),
    );
    final orderLeft = tester.getTopLeft(
      find.byKey(const Key('order-pane-wide')),
    );
    expect(orderLeft.dx, greaterThan(catalogRight.dx));
    expect(tester.takeException(), isNull);
  });
}
