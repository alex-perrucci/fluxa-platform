import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../di/providers.dart';
import '../theme/fluxa_theme.dart';
import '../widgets/fluxa_brand.dart';

class AppShell extends ConsumerWidget {
  const AppShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  static const _printingDestinationIndex = 4;

  static const destinations = [
    NavigationDestination(
      icon: Icon(Icons.point_of_sale_outlined),
      selectedIcon: Icon(Icons.point_of_sale),
      label: 'Cassa',
    ),
    NavigationDestination(
      icon: Icon(Icons.table_restaurant_outlined),
      selectedIcon: Icon(Icons.table_restaurant),
      label: 'Tavoli',
    ),
    NavigationDestination(
      icon: Icon(Icons.receipt_long_outlined),
      selectedIcon: Icon(Icons.receipt_long),
      label: 'Ordini',
    ),
    NavigationDestination(
      icon: Icon(Icons.soup_kitchen_outlined),
      selectedIcon: Icon(Icons.soup_kitchen),
      label: 'Cucina',
    ),
    NavigationDestination(
      icon: Icon(Icons.print_outlined),
      selectedIcon: Icon(Icons.print),
      label: 'Stampa',
    ),
    NavigationDestination(
      icon: Icon(Icons.account_balance_outlined),
      selectedIcon: Icon(Icons.account_balance),
      label: 'Fiscale',
    ),
    NavigationDestination(
      icon: Icon(Icons.settings_outlined),
      selectedIcon: Icon(Icons.settings),
      label: 'Impostazioni',
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final body = navigationShell;

    return Scaffold(
      appBar: wide
          ? null
          : AppBar(
              title: const FluxaBrandLockup(compact: true),
              actions: const [
                Padding(
                  padding: EdgeInsets.only(right: 16),
                  child: Center(
                    child: Text(
                      'POS',
                      style: TextStyle(
                        color: FluxaPalette.goldDark,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 2,
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
                  Container(
                    width: 246,
                    decoration: const BoxDecoration(
                      color: FluxaPalette.ink,
                      border: Border(
                        right: BorderSide(color: Color(0xFF2A2B30)),
                      ),
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
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 24),
                          child: Divider(color: Color(0xFF303136)),
                        ),
                        Expanded(
                          child: NavigationRail(
                            extended: true,
                            minExtendedWidth: 246,
                            selectedIndex: navigationShell.currentIndex,
                            onDestinationSelected: (index) => _go(ref, index),
                            destinations: destinations
                                .map(
                                  (item) => NavigationRailDestination(
                                    icon: item.icon,
                                    selectedIcon: item.selectedIcon,
                                    label: Text(item.label),
                                  ),
                                )
                                .toList(growable: false),
                          ),
                        ),
                        const Padding(
                          padding: EdgeInsets.fromLTRB(24, 16, 24, 24),
                          child: Row(
                            children: [
                              Icon(
                                Icons.circle,
                                size: 9,
                                color: Color(0xFF4CCB91),
                              ),
                              SizedBox(width: 9),
                              Expanded(
                                child: Text(
                                  'Sistema operativo',
                                  style: TextStyle(
                                    color: Colors.white60,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Column(
                      children: [
                        Container(
                          height: 74,
                          padding: const EdgeInsets.symmetric(horizontal: 26),
                          decoration: const BoxDecoration(
                            color: FluxaPalette.paper,
                            border: Border(
                              bottom: BorderSide(color: FluxaPalette.line),
                            ),
                          ),
                          child: const Row(
                            children: [
                              Text(
                                'Fluxa POS',
                                style: TextStyle(
                                  color: FluxaPalette.ink,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              Spacer(),
                              Icon(
                                Icons.lock_outline,
                                size: 18,
                                color: FluxaPalette.goldDark,
                              ),
                              SizedBox(width: 8),
                              Text(
                                'Sessione protetta',
                                style: TextStyle(
                                  color: FluxaPalette.muted,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Expanded(child: body),
                      ],
                    ),
                  ),
                ],
              )
            : body,
      ),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: navigationShell.currentIndex,
              onDestinationSelected: (index) => _go(ref, index),
              destinations: destinations,
            ),
    );
  }

  void _go(WidgetRef ref, int index) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
    if (index != _printingDestinationIndex) {
      return;
    }
    final controller = ref.read(printingControllerProvider);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await controller.refresh();
    });
  }
}
