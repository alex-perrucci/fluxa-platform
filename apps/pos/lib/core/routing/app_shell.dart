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
      group: _DestinationGroup.operational,
      icon: Icons.point_of_sale_outlined,
      selectedIcon: Icons.point_of_sale,
      label: 'Cassa',
      description: 'Vendi e incassa',
    ),
    _PosDestination(
      branchIndex: 1,
      section: PosSection.tables,
      group: _DestinationGroup.operational,
      icon: Icons.table_restaurant_outlined,
      selectedIcon: Icons.table_restaurant,
      label: 'Tavoli',
      description: 'Apri e continua i tavoli',
    ),
    _PosDestination(
      branchIndex: 2,
      section: PosSection.orders,
      group: _DestinationGroup.operational,
      icon: Icons.receipt_long_outlined,
      selectedIcon: Icons.receipt_long,
      label: 'Ordini',
      description: 'Ritrova le vendite',
    ),
    _PosDestination(
      branchIndex: 4,
      section: PosSection.kitchen,
      group: _DestinationGroup.operational,
      icon: Icons.soup_kitchen_outlined,
      selectedIcon: Icons.soup_kitchen,
      label: 'Cucina',
      description: 'Comande da preparare',
    ),
    _PosDestination(
      branchIndex: 6,
      section: PosSection.fiscal,
      group: _DestinationGroup.management,
      icon: Icons.account_balance_outlined,
      selectedIcon: Icons.account_balance,
      label: 'Fiscale',
      description: 'Stato documenti fiscali',
    ),
    _PosDestination(
      branchIndex: 5,
      section: PosSection.printing,
      group: _DestinationGroup.management,
      icon: Icons.print_outlined,
      selectedIcon: Icons.print,
      label: 'Stampa',
      description: 'Stampanti e code',
    ),
    _PosDestination(
      branchIndex: 3,
      section: PosSection.refunds,
      group: _DestinationGroup.management,
      icon: Icons.undo_outlined,
      selectedIcon: Icons.undo,
      label: 'Rimborsi',
      description: 'Resi e storni',
    ),
    _PosDestination(
      branchIndex: 7,
      section: PosSection.settings,
      group: _DestinationGroup.management,
      icon: Icons.settings_outlined,
      selectedIcon: Icons.settings,
      label: 'Diagnostica',
      description: 'Dispositivo e assistenza',
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
                              _modeLabel(mode),
                              style: const TextStyle(
                                color: FluxaPalette.goldDark,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.2,
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
                  : _MobileNavigation(
                      destinations: destinations,
                      currentBranchIndex: navigationShell.currentIndex,
                      onSelectedBranch: (branchIndex) => _go(ref, branchIndex),
                    ),
            ),
          ),
        ),
      ),
    );
  }

  static String _modeLabel(PosOperatorMode mode) => switch (mode) {
    PosOperatorMode.cashier => 'CASSA',
    PosOperatorMode.kitchen => 'CUCINA',
    PosOperatorMode.manager => 'GESTIONE',
    PosOperatorMode.auto => 'AUTO',
  };

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
  Widget build(BuildContext context) {
    final selectedBranch = destinations.isEmpty
        ? -1
        : destinations[selectedIndex].branchIndex;
    final operational = destinations
        .where((item) => item.group == _DestinationGroup.operational)
        .toList(growable: false);
    final management = destinations
        .where((item) => item.group == _DestinationGroup.management)
        .toList(growable: false);

    return Container(
      width: 270,
      decoration: const BoxDecoration(
        color: FluxaPalette.ink,
        border: Border(right: BorderSide(color: Color(0xFF2A2B30))),
      ),
      child: Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(24, 28, 24, 18),
            child: Align(
              alignment: Alignment.centerLeft,
              child: FluxaBrandLockup(reversed: true),
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              children: [
                if (operational.isNotEmpty) ...[
                  const _NavigationGroupLabel('LAVORO'),
                  for (final destination in operational)
                    _DesktopDestinationTile(
                      destination: destination,
                      selected: destination.branchIndex == selectedBranch,
                      onTap: () => onSelected(destinations.indexOf(destination)),
                    ),
                ],
                if (management.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  const _NavigationGroupLabel('CONTROLLO E GESTIONE'),
                  for (final destination in management)
                    _DesktopDestinationTile(
                      destination: destination,
                      selected: destination.branchIndex == selectedBranch,
                      onTap: () => onSelected(destinations.indexOf(destination)),
                    ),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 22),
            child: Text(
              '${AppShell._modeLabel(mode)} · F1–F5 scorciatoie',
              style: const TextStyle(color: Colors.white60, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _DesktopDestinationTile extends StatelessWidget {
  const _DesktopDestinationTile({
    required this.destination,
    required this.selected,
    required this.onTap,
  });

  final _PosDestination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Material(
      color: selected ? const Color(0xFF303033) : Colors.transparent,
      borderRadius: BorderRadius.circular(12),
      child: ListTile(
        selected: selected,
        selectedColor: FluxaPalette.goldDark,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        leading: Icon(selected ? destination.selectedIcon : destination.icon),
        title: Text(
          destination.label,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          destination.description,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: selected ? Colors.white70 : Colors.white54,
            fontSize: 12,
          ),
        ),
        textColor: Colors.white,
        iconColor: Colors.white70,
        onTap: onTap,
      ),
    ),
  );
}

class _NavigationGroupLabel extends StatelessWidget {
  const _NavigationGroupLabel(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
    child: Text(
      label,
      style: const TextStyle(
        color: Colors.white38,
        fontSize: 11,
        fontWeight: FontWeight.w800,
        letterSpacing: 1.2,
      ),
    ),
  );
}

class _MobileNavigation extends StatelessWidget {
  const _MobileNavigation({
    required this.destinations,
    required this.currentBranchIndex,
    required this.onSelectedBranch,
  });

  final List<_PosDestination> destinations;
  final int currentBranchIndex;
  final ValueChanged<int> onSelectedBranch;

  @override
  Widget build(BuildContext context) {
    if (destinations.length <= 5) {
      final selectedIndex = destinations.indexWhere(
        (item) => item.branchIndex == currentBranchIndex,
      );
      return NavigationBar(
        selectedIndex: selectedIndex < 0 ? 0 : selectedIndex,
        onDestinationSelected: (index) =>
            onSelectedBranch(destinations[index].branchIndex),
        destinations: destinations
            .map(
              (item) => NavigationDestination(
                icon: Icon(item.icon),
                selectedIcon: Icon(item.selectedIcon),
                label: item.label,
              ),
            )
            .toList(growable: false),
      );
    }

    final primary = destinations.take(4).toList(growable: false);
    final secondary = destinations.skip(4).toList(growable: false);
    final selectedPrimary = primary.indexWhere(
      (item) => item.branchIndex == currentBranchIndex,
    );
    final selectedIndex = selectedPrimary >= 0 ? selectedPrimary : 4;

    return NavigationBar(
      selectedIndex: selectedIndex,
      onDestinationSelected: (index) {
        if (index < primary.length) {
          onSelectedBranch(primary[index].branchIndex);
          return;
        }
        _showMore(context, secondary);
      },
      destinations: [
        ...primary.map(
          (item) => NavigationDestination(
            icon: Icon(item.icon),
            selectedIcon: Icon(item.selectedIcon),
            label: item.label,
          ),
        ),
        const NavigationDestination(
          icon: Icon(Icons.grid_view_outlined),
          selectedIcon: Icon(Icons.grid_view),
          label: 'Altro',
        ),
      ],
    );
  }

  Future<void> _showMore(
    BuildContext context,
    List<_PosDestination> secondary,
  ) async {
    final selected = await showModalBottomSheet<_PosDestination>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Altre sezioni',
                    style: Theme.of(sheetContext).textTheme.titleLarge,
                  ),
                ),
              ),
              for (final destination in secondary)
                ListTile(
                  leading: Icon(
                    destination.branchIndex == currentBranchIndex
                        ? destination.selectedIcon
                        : destination.icon,
                  ),
                  title: Text(destination.label),
                  subtitle: Text(destination.description),
                  trailing: const Icon(Icons.chevron_right),
                  selected: destination.branchIndex == currentBranchIndex,
                  onTap: () => Navigator.pop(sheetContext, destination),
                ),
            ],
          ),
        ),
      ),
    );
    if (selected != null) {
      onSelectedBranch(selected.branchIndex);
    }
  }
}

enum _DestinationGroup { operational, management }

class _PosDestination {
  const _PosDestination({
    required this.branchIndex,
    required this.section,
    required this.group,
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.description,
  });

  final int branchIndex;
  final PosSection section;
  final _DestinationGroup group;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final String description;
}

class _NavigateIntent extends Intent {
  const _NavigateIntent(this.visibleIndex);
  final int visibleIndex;
}
