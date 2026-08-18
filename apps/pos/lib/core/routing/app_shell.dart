import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../di/providers.dart';
import '../theme/fluxa_theme.dart';
import '../widgets/fluxa_brand.dart';
import 'operator_navigation_policy.dart';
import 'operator_tutorial_gate.dart';

class AppShell extends ConsumerWidget {
  const AppShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  static const _allDestinations = <_PosDestination>[
    _PosDestination(
      branchIndex: 0,
      section: PosSection.checkout,
      icon: Icons.point_of_sale_outlined,
      selectedIcon: Icons.point_of_sale,
      label: 'Cassa',
    ),
    _PosDestination(
      branchIndex: 1,
      section: PosSection.tables,
      icon: Icons.table_restaurant_outlined,
      selectedIcon: Icons.table_restaurant,
      label: 'Tavoli',
    ),
    _PosDestination(
      branchIndex: 2,
      section: PosSection.orders,
      icon: Icons.receipt_long_outlined,
      selectedIcon: Icons.receipt_long,
      label: 'Ordini',
    ),
    _PosDestination(
      branchIndex: 3,
      section: PosSection.refunds,
      icon: Icons.undo_outlined,
      selectedIcon: Icons.undo,
      label: 'Rimborsi',
    ),
    _PosDestination(
      branchIndex: 4,
      section: PosSection.kitchen,
      icon: Icons.soup_kitchen_outlined,
      selectedIcon: Icons.soup_kitchen,
      label: 'Cucina',
    ),
    _PosDestination(
      branchIndex: 5,
      section: PosSection.printing,
      icon: Icons.print_outlined,
      selectedIcon: Icons.print,
      label: 'Stampa',
    ),
    _PosDestination(
      branchIndex: 6,
      section: PosSection.fiscal,
      icon: Icons.account_balance_outlined,
      selectedIcon: Icons.account_balance,
      label: 'Fiscale',
    ),
    _PosDestination(
      branchIndex: 7,
      section: PosSection.settings,
      icon: Icons.settings_outlined,
      selectedIcon: Icons.settings,
      label: 'Diagnostica',
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).state;
    final deviceMode = auth.deviceAssignment?.assignment.operatorMode;
    final mode = PosOperatorMode.fromWire(deviceMode?.wireValue);
    final allowed = PosNavigationPolicy.sections(
      role: auth.session?.role,
      mode: mode,
    );
    final destinations = _allDestinations
        .where((item) => allowed.contains(item.section))
        .toList(growable: false);
    final visibleIndex = destinations.indexWhere(
      (item) => item.branchIndex == navigationShell.currentIndex,
    );
    final selectedIndex = visibleIndex < 0 ? 0 : visibleIndex;
    final wide = MediaQuery.sizeOf(context).width >= 900;

    return OperatorTutorialGate(
      mode: mode,
      child: Shortcuts(
        shortcuts: const {
          SingleActivator(LogicalKeyboardKey.f1): _NavigateIntent(0),
          SingleActivator(LogicalKeyboardKey.f2): _NavigateIntent(1),
          SingleActivator(LogicalKeyboardKey.f3): _NavigateIntent(2),
          SingleActivator(LogicalKeyboardKey.f4): _NavigateIntent(3),
          SingleActivator(LogicalKeyboardKey.f5): _NavigateIntent(4),
        },
        child: Actions(
          actions: {
            _NavigateIntent: CallbackAction<_NavigateIntent>(
              onInvoke: (intent) {
                if (intent.visibleIndex < destinations.length) {
                  _go(ref, destinations[intent.visibleIndex].branchIndex);
                }
                return null;
              },
            ),
          },
          child: Focus(
            autofocus: true,
            child: Scaffold(
              appBar: wide
                  ? null
                  : AppBar(
                      title: const FluxaBrandLockup(compact: true),
                      actions: [
                        Padding(
                          padding: const EdgeInsets.only(right: 16),
                          child: Center(
                            child: Text(
                              mode.wireValue,
                              style: const TextStyle(
                                color: FluxaPalette.goldDark,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.5,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
              body: SafeArea(
                top: wide,
                child: wide
                    ? Row(
                        children: [
                          _DesktopNavigation(
                            destinations: destinations,
                            selectedIndex: selectedIndex,
                            onSelected: (index) =>
                                _go(ref, destinations[index].branchIndex),
                            mode: mode,
                          ),
                          Expanded(child: navigationShell),
                        ],
                      )
                    : navigationShell,
              ),
              bottomNavigationBar: wide
                  ? null
                  : NavigationBar(
                      selectedIndex: selectedIndex,
                      onDestinationSelected: (index) =>
                          _go(ref, destinations[index].branchIndex),
                      destinations: destinations
                          .map(
                            (item) => NavigationDestination(
                              icon: Icon(item.icon),
                              selectedIcon: Icon(item.selectedIcon),
                              label: item.label,
                            ),
                          )
                          .toList(growable: false),
                    ),
            ),
          ),
        ),
      ),
    );
  }

  void _go(WidgetRef ref, int branchIndex) {
    navigationShell.goBranch(
      branchIndex,
      initialLocation: branchIndex == navigationShell.currentIndex,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await _refreshBranch(ref, branchIndex);
    });
  }

  Future<void> _refreshBranch(WidgetRef ref, int branchIndex) async {
    final locationId = ref
        .read(authControllerProvider)
        .state
        .deviceAssignment
        ?.location
        ?.id;
    if (locationId == null) {
      return;
    }

    switch (branchIndex) {
      case 0:
      case 2:
        final controller = ref.read(orderControllerProvider);
        if (controller.locationId != locationId) {
          await controller.bindLocation(locationId);
        } else {
          await controller.refreshOperationalState();
        }
        return;
      case 1:
        final controller = ref.read(tableControllerProvider);
        if (controller.locationId != locationId) {
          await controller.bindLocation(locationId);
        } else {
          await controller.refreshOperationalState();
        }
        return;
      case 4:
        final controller = ref.read(kitchenControllerProvider);
        if (controller.locationId != locationId) {
          await controller.bindLocation(locationId);
        } else {
          await controller.refresh();
        }
        return;
      case 5:
        await ref.read(printingControllerProvider).refresh();
        return;
      case 6:
        final controller = ref.read(fiscalControllerProvider);
        if (controller.locationId != locationId) {
          await controller.bindLocation(locationId);
        } else {
          await controller.refresh(silent: true);
        }
        return;
      default:
        return;
    }
  }
}

class _DesktopNavigation extends StatelessWidget {
  const _DesktopNavigation({
    required this.destinations,
    required this.selectedIndex,
    required this.onSelected,
    required this.mode,
  });

  final List<_PosDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onSelected;
  final PosOperatorMode mode;

  @override
  Widget build(BuildContext context) => Container(
    width: 246,
    decoration: const BoxDecoration(
      color: FluxaPalette.ink,
      border: Border(right: BorderSide(color: Color(0xFF2A2B30))),
    ),
    child: Column(
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(24, 28, 24, 20),
          child: Align(
            alignment: Alignment.centerLeft,
            child: FluxaBrandLockup(reversed: true),
          ),
        ),
        Expanded(
          child: NavigationRail(
            extended: true,
            minExtendedWidth: 246,
            selectedIndex: selectedIndex,
            onDestinationSelected: onSelected,
            destinations: destinations
                .map(
                  (item) => NavigationRailDestination(
                    icon: Icon(item.icon),
                    selectedIcon: Icon(item.selectedIcon),
                    label: Text(item.label),
                  ),
                )
                .toList(growable: false),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Text(
            '${mode.wireValue} · F1–F5 navigazione rapida',
            style: const TextStyle(color: Colors.white60, fontSize: 12),
          ),
        ),
      ],
    ),
  );
}

class _PosDestination {
  const _PosDestination({
    required this.branchIndex,
    required this.section,
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });

  final int branchIndex;
  final PosSection section;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

class _NavigateIntent extends Intent {
  const _NavigateIntent(this.visibleIndex);
  final int visibleIndex;
}
