# Fluxa Phase 1 stabilization and in-app administration

This change set closes the first manual-test regressions and adds an operational
administration page inside the Flutter POS.

## Regression fixes

- the order-status filter immediately closes a detail that no longer matches;
- the order list is visible on mobile after changing filters;
- paid and cancelled orders expose a clear `Nuovo ordine` action;
- the completed checkout returns to a clean register state;
- redundant controller listeners were removed from Orders and Checkout;
- the global error fallback no longer depends on inherited theme state while a
  failed subtree is being deactivated;
- the printing page becomes vertically scrollable on phones;
- Bluetooth discovery and assigned-printer controls wrap responsively.

## Administration page

Owners, administrators and managers can open **Impostazioni → Amministrazione**.
The page supports creation of:

- organization members;
- merchants and locations;
- VAT rates, categories, products, price lists and prices;
- dining areas, tables, kitchen stations and category routing;
- backend printers assigned to the current device;
- a sandbox MOCK fiscal profile.

The guided demo setup creates a coherent test configuration using stable codes,
reusing existing records when they already exist.
