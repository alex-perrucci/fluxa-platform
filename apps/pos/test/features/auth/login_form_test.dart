import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/auth/presentation/login_screen.dart';

void main() {
  testWidgets('validates fields and submits credentials', (tester) async {
    String? email;
    String? password;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LoginForm(
            onSubmit: (valueEmail, valuePassword) async {
              email = valueEmail;
              password = valuePassword;
            },
          ),
        ),
      ),
    );

    await tester.tap(find.byKey(const Key('loginButton')));
    await tester.pump();
    expect(find.text('Inserisci un indirizzo email valido.'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('emailField')),
      'cashier@example.com',
    );
    await tester.enterText(
      find.byKey(const Key('passwordField')),
      'password123',
    );
    await tester.tap(find.byKey(const Key('loginButton')));
    await tester.pump();

    expect(email, 'cashier@example.com');
    expect(password, 'password123');
  });
}
