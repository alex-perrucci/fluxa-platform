import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('transient dialog files do not own external text controllers', () {
    const paths = <String>[
      'lib/features/orders/presentation/order_composer.dart',
      'lib/features/hospitality/presentation/tables_screen.dart',
      'lib/features/payments/presentation/checkout_screen.dart',
      'lib/features/printing/presentation/printing_screen.dart',
      'lib/features/fiscal/presentation/fiscal_screen.dart',
      'lib/features/admin/presentation/admin_screen.dart',
    ];

    for (final path in paths) {
      final source = File(path).readAsStringSync();
      expect(
        source,
        isNot(contains('TextEditingController(')),
        reason:
            '$path must keep transient form values inside the dialog route subtree.',
      );
    }
  });
}
