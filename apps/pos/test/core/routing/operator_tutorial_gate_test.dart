import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/routing/operator_navigation_policy.dart';
import 'package:fluxa_pos/core/routing/operator_tutorial_gate.dart';

void main() {
  testWidgets('long cashier tutorial fits a small display', (tester) async {
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      const MaterialApp(
        home: OperatorTutorialGate(
          mode: PosOperatorMode.cashier,
          child: Scaffold(body: Text('Cassa pronta')),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Modalità Cassa'), findsOneWidget);
    expect(find.text('Inizia'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
