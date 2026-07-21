import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/organization_selection_screen.dart';
import '../../features/device/presentation/operational_blocked_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/orders/presentation/orders_placeholder_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../widgets/async_states.dart';
import 'app_shell.dart';

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
      return '/home';
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
    StatefulShellRoute.indexedStack(
      builder: (context, state, shell) => AppShell(navigationShell: shell),
      branches: [
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/home',
              builder: (context, state) => const HomeScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/orders',
              builder: (context, state) => const OrdersPlaceholderScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          routes: [
            GoRoute(
              path: '/settings',
              builder: (context, state) => const SettingsScreen(),
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
