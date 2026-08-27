class PosEntitlementContext {
  const PosEntitlementContext._();

  static Set<String>? _current;

  static Set<String>? get current => _current;

  static void replace(Iterable<String>? entitlements) {
    _current = entitlements == null
        ? null
        : Set<String>.unmodifiable(entitlements);
  }

  static void clear() {
    _current = null;
  }
}
