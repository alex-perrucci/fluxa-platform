import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/auth/presentation/auth_controller.dart';
import 'package:fluxa_pos/features/device/presentation/operational_blocked_screen.dart';

void main() {
  const cases = {
    AuthStatus.locationRequired: 'Assegnazione alla location richiesta',
    AuthStatus.assignmentRevoked: 'Assegnazione del dispositivo revocata',
    AuthStatus.locationInactive: 'Location non operativa',
    AuthStatus.deviceAssignmentMissing: 'Dispositivo non assegnato',
  };

  for (final entry in cases.entries) {
    testWidgets('renders ${entry.key.name}', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: OperationalBlockedView(
            status: entry.key,
            onRetry: () async {},
            onSettings: () {},
            onLogout: () async {},
          ),
        ),
      );

      expect(find.text(entry.value), findsOneWidget);
      expect(find.text('Riprova'), findsOneWidget);
      expect(find.text('Impostazioni tecniche'), findsOneWidget);
    });
  }
}
