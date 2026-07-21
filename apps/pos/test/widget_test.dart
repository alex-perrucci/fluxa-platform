import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/widgets/async_states.dart';

void main() {
  testWidgets('renders the shared empty state', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: FluxaEmptyView(
            title: 'Nessun dato',
            message: 'Contenuto non disponibile.',
          ),
        ),
      ),
    );

    expect(find.text('Nessun dato'), findsOneWidget);
    expect(find.text('Contenuto non disponibile.'), findsOneWidget);
  });
}
