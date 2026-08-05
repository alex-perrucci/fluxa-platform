import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/routing/operator_navigation_policy.dart';

void main() {
  test(
    'cashier sees only operational checkout sections and printer status',
    () {
      expect(
        PosNavigationPolicy.sections(
          role: 'CASHIER',
          mode: PosOperatorMode.cashier,
        ),
        const [
          PosSection.checkout,
          PosSection.tables,
          PosSection.orders,
          PosSection.printing,
          PosSection.settings,
        ],
      );
    },
  );

  test('kitchen device exposes only kitchen', () {
    expect(
      PosNavigationPolicy.sections(
        role: 'MANAGER',
        mode: PosOperatorMode.kitchen,
      ),
      const [PosSection.kitchen],
    );
  });

  test('manager sees the complete operational surface', () {
    expect(
      PosNavigationPolicy.sections(
        role: 'MANAGER',
        mode: PosOperatorMode.manager,
      ),
      containsAll(PosSection.values),
    );
  });

  test('auto resolves from authenticated membership role', () {
    expect(
      PosNavigationPolicy.sections(role: 'CASHIER', mode: PosOperatorMode.auto),
      isNot(contains(PosSection.fiscal)),
    );
    expect(
      PosNavigationPolicy.sections(role: 'OWNER', mode: PosOperatorMode.auto),
      contains(PosSection.fiscal),
    );
  });
}
