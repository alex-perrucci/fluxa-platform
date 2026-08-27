import '../entitlements/pos_entitlement_context.dart';

enum PosOperatorMode {
  auto('AUTO'),
  cashier('CASHIER'),
  kitchen('KITCHEN'),
  manager('MANAGER');

  const PosOperatorMode(this.wireValue);
  final String wireValue;

  static PosOperatorMode fromWire(Object? value) {
    final wire = value?.toString() ?? 'AUTO';
    return values.firstWhere(
      (mode) => mode.wireValue == wire,
      orElse: () => PosOperatorMode.auto,
    );
  }
}

enum PosSection {
  checkout,
  tables,
  orders,
  refunds,
  kitchen,
  printing,
  fiscal,
  settings,
}

class PosNavigationPolicy {
  const PosNavigationPolicy._();

  static List<PosSection> sections({
    required String? role,
    required PosOperatorMode mode,
    Set<String>? entitlements,
  }) {
    final effective = mode == PosOperatorMode.auto
        ? _modeForRole(role)
        : mode;
    final roleSections = switch (effective) {
      PosOperatorMode.cashier => const [
        PosSection.checkout,
        PosSection.tables,
        PosSection.orders,
        PosSection.printing,
        PosSection.settings,
      ],
      PosOperatorMode.kitchen => const [PosSection.kitchen],
      PosOperatorMode.manager => const [
        PosSection.checkout,
        PosSection.tables,
        PosSection.orders,
        PosSection.refunds,
        PosSection.kitchen,
        PosSection.printing,
        PosSection.fiscal,
        PosSection.settings,
      ],
      PosOperatorMode.auto => const <PosSection>[],
    };

    final effectiveEntitlements = entitlements ?? PosEntitlementContext.current;
    if (effectiveEntitlements == null) return roleSections;

    final filtered = roleSections
        .where((section) => _hasEntitlement(section, effectiveEntitlements))
        .toList(growable: false);
    return filtered.isEmpty ? const [PosSection.settings] : filtered;
  }

  static bool _hasEntitlement(
    PosSection section,
    Set<String> entitlements,
  ) => switch (section) {
    PosSection.checkout => entitlements.contains('POS_CORE'),
    PosSection.tables =>
      entitlements.contains('TABLES') &&
          entitlements.contains('TABLE_SERVICE'),
    PosSection.orders => entitlements.contains('ORDERS'),
    PosSection.refunds => entitlements.contains('PAYMENTS'),
    PosSection.kitchen =>
      entitlements.contains('KITCHEN') && entitlements.contains('KDS'),
    PosSection.printing => entitlements.contains('RECEIPT_PRINTING'),
    PosSection.fiscal => entitlements.contains('FISCAL'),
    PosSection.settings => true,
  };

  static PosOperatorMode _modeForRole(String? role) => switch (role) {
    'OWNER' || 'ADMIN' || 'MANAGER' => PosOperatorMode.manager,
    _ => PosOperatorMode.cashier,
  };
}
