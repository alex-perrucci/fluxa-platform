import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/entitlements/pos_entitlement_context.dart';
import 'package:fluxa_pos/core/routing/operator_navigation_policy.dart';

void main() {
  tearDown(PosEntitlementContext.clear);

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

  test('START removes tables and kitchen while preserving checkout', () {
    PosEntitlementContext.replace({
      'POS_CORE',
      'ORDERS',
      'PAYMENTS',
      'RECEIPT_PRINTING',
      'FISCAL',
    });

    final sections = PosNavigationPolicy.sections(
      role: 'OWNER',
      mode: PosOperatorMode.manager,
    );

    expect(sections, contains(PosSection.checkout));
    expect(sections, contains(PosSection.orders));
    expect(sections, contains(PosSection.printing));
    expect(sections, isNot(contains(PosSection.tables)));
    expect(sections, isNot(contains(PosSection.kitchen)));
  });

  test('SALA enables tables but keeps kitchen unavailable', () {
    PosEntitlementContext.replace({
      'POS_CORE',
      'ORDERS',
      'PAYMENTS',
      'RECEIPT_PRINTING',
      'FISCAL',
      'TABLES',
      'TABLE_SERVICE',
      'FLOOR_PLAN',
    });

    final sections = PosNavigationPolicy.sections(
      role: 'OWNER',
      mode: PosOperatorMode.manager,
    );

    expect(sections, contains(PosSection.tables));
    expect(sections, isNot(contains(PosSection.kitchen)));
  });

  test('PRO enables kitchen KDS in addition to SALA capabilities', () {
    PosEntitlementContext.replace({
      'POS_CORE',
      'ORDERS',
      'PAYMENTS',
      'RECEIPT_PRINTING',
      'FISCAL',
      'TABLES',
      'TABLE_SERVICE',
      'FLOOR_PLAN',
      'KITCHEN',
      'KDS',
      'KITCHEN_ROUTING',
      'KITCHEN_PRINTING',
    });

    final sections = PosNavigationPolicy.sections(
      role: 'OWNER',
      mode: PosOperatorMode.manager,
    );

    expect(sections, contains(PosSection.tables));
    expect(sections, contains(PosSection.kitchen));
  });
}
