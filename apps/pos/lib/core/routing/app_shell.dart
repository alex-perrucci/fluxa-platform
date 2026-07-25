import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../di/providers.dart';

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
      appBar: AppBar(title: const Text('Fluxa POS')),
      body: wide
          ? Row(
              children: [
                NavigationRail(
                  selectedIndex: navigationShell.currentIndex,
                  onDestinationSelected: (index) => _go(ref, index),
                  labelType: NavigationRailLabelType.all,
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
                const VerticalDivider(width: 1),
                Expanded(child: body),
              ],
            )
          : body,
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
