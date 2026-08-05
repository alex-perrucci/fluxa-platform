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
  }) {
    final effective = mode == PosOperatorMode.auto ? _modeForRole(role) : mode;
    return switch (effective) {
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
      PosOperatorMode.auto => const [],
    };
  }

  static PosOperatorMode _modeForRole(String? role) => switch (role) {
    'OWNER' || 'ADMIN' || 'MANAGER' => PosOperatorMode.manager,
    _ => PosOperatorMode.cashier,
  };
}
