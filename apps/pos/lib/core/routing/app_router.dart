import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/organization_selection_screen.dart';
import '../../features/catalog/presentation/fast_cashier_screen.dart';
import '../../features/catalog/presentation/operator_cashier_screen.dart';
import '../../features/device/presentation/operational_blocked_screen.dart';
import '../../features/fiscal/presentation/fiscal_screen.dart';
import '../../features/fiscal/presentation/fiscalize_screen.dart';
import '../../features/fiscal/presentation/operator_fiscal_screen.dart';
import '../../features/hospitality/presentation/fast_tables_screen.dart';
import '../../features/hospitality/presentation/kitchen_screen.dart';
import '../../features/hospitality/presentation/operator_tables_screen.dart';
import '../../features/hospitality/presentation/tables_screen.dart';
import '../../features/orders/presentation/operator_orders_screen.dart';
import '../../features/orders/presentation/orders_screen.dart';
import '../../features/payments/presentation/checkout_screen.dart';
import '../../features/payments/presentation/fast_checkout_screen.dart';
import '../../features/payments/presentation/refunds_screen.dart';
import '../../features/printing/presentation/operator_printing_screen.dart';
import '../../features/printing/presentation/printer_setup_screen.dart';
import '../../features/printing/presentation/printing_screen.dart';
import '../../features/settings/presentation/operator_diagnostics_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../widgets/async_states.dart';
import 'app_shell.dart';
import 'operator_navigation_policy.dart';

GoRouter buildAppRouter(AuthController authController) => GoRouter(
  initialLocation: '/bootstrap',
  refreshListenable: authController,
  redirect: (context, state) {
    final status = authController.state.status;
    final location = state.matchedLocation;

    if (status == AuthStatus.bootstrapping) {
      return location == '/bootstrap' ? null : '/bootstrap';
    }
    if (status == AuthStatus.unauthenticated) {
      return location == '/login' ? null : '/login';
    }
    if (status == AuthStatus.organizationRequired) {
      return location == '/select-organization' ? null : '/select-organization';
    }
    if (status.isOperationallyBlocked) {
      if (location == '/operational-setup' || location == '/settings') {
        return null;
      }
      return '/operational-setup';
    }
    if (location == '/bootstrap' ||
        location == '/login' ||
        location == '/select-organization' ||
        location == '/operational-setup') {
      return _operatorHome(authController);
    }

    final allowed = _allowedPaths(authController);
    final shellRoot = _shellRoot(location);
    if (shellRoot != null && !allowed.contains(shellRoot)) {
      return _operatorHome(authController);
    }
    return null;
  },
  routes: [
    GoRoute(
      path: '/bootstrap',
      builder: (context, state) =>
          const Scaffold(body: FluxaLoadingView(label: 'Avvio Fluxa')),
    ),
    GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
    GoRoute(
      path: '/select-organization',
      builder: (context, state) => const OrganizationSelectionScreen(),
    ),
    GoRoute(
      path: '/operational-setup',
      builder: (context, state) => const OperationalBlockedScreen(),
    ),
    GoRoute(
      path: '/printer-setup',
      builder: (context, state) => const PrinterSetupScreen(),
    ),
    GoRoute(
      path: '/fiscalize/:orderId',
      builder: (context, state) =>
          FiscalizeScreen(orderId: state.pathParameters['orderId']!),
    ),
    GoRoute(
      path: '/checkout/:orderId',
      builder: (context, state) => FastCheckoutScreen(
        orderId: state.pathParameters['orderId']!,
        quickMethod: state.uri.queryParameters['quick'],
      ),
    ),
    GoRoute(
      path: '/checkout-advanced/:orderId',
      builder: (context, state) =>
          CheckoutScreen(orderId: state.pathParameters['orderId']!),
    ),
    StatefulShellRoute.indexedStack(
      builder: (context, state, shell) => AppShell(navigationShell: shell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/home',
              builder: (context, state) => const OperatorCashierScreen(),
              routes: [
                GoRoute(
                  path: 'manage',
                  builder: (context, state) => const FastCashierScreen(),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/tables',
              builder: (context, state) => const OperatorTablesScreen(),
              routes: [
                GoRoute(
                  path: 'manage',
                  builder: (context, state) => const TablesScreen(),
                ),
                GoRoute(
                  path: 'legacy-fast',
                  builder: (context, state) => const FastTablesScreen(),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/orders',
              builder: (context, state) => const OperatorOrdersScreen(),
              routes: [
                GoRoute(
                  path: 'manage',
                  builder: (context, state) => const OrdersScreen(),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/refunds',
              builder: (context, state) => const RefundsScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/kitchen',
              builder: (context, state) => const KitchenScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/printing',
              builder: (context, state) => const OperatorPrintingScreen(),
              routes: [
                GoRoute(
                  path: 'manage',
                  builder: (context, state) => const PrintingScreen(),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/fiscal',
              builder: (context, state) => const OperatorFiscalScreen(),
              routes: [
                GoRoute(
                  path: 'manage',
                  builder: (context, state) => const FiscalScreen(),
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/settings',
              builder: (context, state) => const OperatorDiagnosticsScreen(),
              routes: [
                GoRoute(
                  path: 'manage',
                  builder: (context, state) => const SettingsScreen(),
                ),
              ],
            ),
          ],
        ),
      ],
    ),
  ],
  errorBuilder: (context, state) => Scaffold(
    appBar: AppBar(title: const Text('Errore di navigazione')),
    body: FluxaEmptyView(
      icon: Icons.route_outlined,
      title: 'Pagina non disponibile',
      message: state.error?.toString() ?? 'Percorso non riconosciuto.',
    ),
  ),
);

Set<String> _allowedPaths(AuthController controller) {
  final state = controller.state;
  final mode = PosOperatorMode.fromWire(
    state.deviceAssignment?.assignment.operatorMode.wireValue,
  );
  final sections = PosNavigationPolicy.sections(
    role: state.session?.role,
    mode: mode,
  );
  const paths = {
    PosSection.checkout: '/home',
    PosSection.tables: '/tables',
    PosSection.orders: '/orders',
    PosSection.refunds: '/refunds',
    PosSection.kitchen: '/kitchen',
    PosSection.printing: '/printing',
    PosSection.fiscal: '/fiscal',
    PosSection.settings: '/settings',
  };
  return sections.map((section) => paths[section]!).toSet();
}

String _operatorHome(AuthController controller) {
  final allowed = _allowedPaths(controller);
  const priority = [
    '/home',
    '/kitchen',
    '/tables',
    '/orders',
    '/printing',
    '/settings',
  ];
  return priority.firstWhere(allowed.contains, orElse: () => '/settings');
}

String? _shellRoot(String location) {
  const roots = {
    '/home',
    '/tables',
    '/orders',
    '/refunds',
    '/kitchen',
    '/printing',
    '/fiscal',
    '/settings',
  };
  for (final root in roots) {
    if (location == root || location.startsWith('$root/')) {
      return root;
    }
  }
  return null;
}
