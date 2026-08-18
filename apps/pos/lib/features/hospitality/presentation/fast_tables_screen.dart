import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../device/domain/device_assignment_models.dart';
import '../../orders/domain/order_models.dart';
import '../../orders/presentation/order_controller.dart';
import '../domain/hospitality_models.dart';
import 'table_controller.dart';

class FastTablesScreen extends ConsumerStatefulWidget {
  const FastTablesScreen({super.key});

  @override
  ConsumerState<FastTablesScreen> createState() => _FastTablesScreenState();
}

class _FastTablesScreenState extends ConsumerState<FastTablesScreen> {
  String? _scheduledTableLocationId;
  String? _scheduledOrderLocationId;

  @override
  Widget build(BuildContext context) {
    final authController = ref.watch(authControllerProvider);
    final tableController = ref.watch(tableControllerProvider);
    final orderController = ref.watch(orderControllerProvider);
    final location = authController.state.deviceAssignment?.location;

    if (location == null) {
      return const FluxaEmptyView(
        icon: Icons.table_restaurant_outlined,
        title: 'Location non disponibile',
        message: 'Completa il contesto operativo prima di aprire la sala.',
      );
    }

    _scheduleTableBind(tableController, location.id);
    _scheduleOrderBind(orderController, location.id);
    if (tableController.locationId != location.id ||
        orderController.locationId != location.id) {
      return const FluxaLoadingView(label: 'Apertura sala');
    }

    return _FastTablesView(
      controller: tableController,
      orderController: orderController,
      location: location,
    );
  }

  void _scheduleTableBind(TableController controller, String locationId) {
    if (controller.locationId == locationId ||
        _scheduledTableLocationId == locationId) {
      return;
    }
    _scheduledTableLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await controller.bindLocation(locationId);
      } finally {
        if (mounted && _scheduledTableLocationId == locationId) {
          setState(() => _scheduledTableLocationId = null);
        }
      }
    });
  }

  void _scheduleOrderBind(OrderController controller, String locationId) {
    if (controller.locationId == locationId ||
        _scheduledOrderLocationId == locationId) {
      return;
    }
    _scheduledOrderLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await controller.bindLocation(locationId);
      } finally {
        if (mounted && _scheduledOrderLocationId == locationId) {
          setState(() => _scheduledOrderLocationId = null);
        }
      }
    });
  }
}

class _FastTablesView extends StatelessWidget {
  const _FastTablesView({
    required this.controller,
    required this.orderController,
    required this.location,
  });

  final TableController controller;
  final OrderController orderController;
  final OperationalLocation location;

  @override
  Widget build(BuildContext context) {
    final tables = controller.floor?.tables ?? const <DiningTableFloor>[];
    final occupied = tables.where((table) => table.occupied).length;

    if (controller.status == FloorLoadStatus.loading &&
        controller.floor == null) {
      return const FluxaLoadingView(label: 'Caricamento tavoli');
    }
    if (controller.status == FloorLoadStatus.failure &&
        controller.floor == null) {
      return FluxaEmptyView(
        icon: Icons.cloud_off_outlined,
        title: 'Sala non disponibile',
        message: controller.errorMessage ?? 'Riprova tra poco.',
      );
    }

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Tavoli',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    Text(
                      '${location.name} · $occupied occupati su ${tables.length}',
                    ),
                  ],
                ),
              ),
              PopupMenuButton<String>(
                tooltip: 'Opzioni tavoli',
                onSelected: (value) async {
                  if (value == 'manage') {
                    context.go('/tables/manage');
                  } else if (value == 'refresh') {
                    await controller.refreshOperationalState();
                  }
                },
                itemBuilder: (context) => const [
                  PopupMenuItem(
                    value: 'manage',
                    child: ListTile(
                      leading: Icon(Icons.tune),
                      title: Text('Gestisci tavoli'),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                  PopupMenuItem(
                    value: 'refresh',
                    child: ListTile(
                      leading: Icon(Icons.refresh),
                      title: Text('Aggiorna'),
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                ],
                child: const Chip(
                  avatar: Icon(Icons.tune, size: 18),
                  label: Text('Opzioni'),
                ),
              ),
            ],
          ),
          if (controller.errorMessage != null) ...[
            const SizedBox(height: 10),
            _TableMessage(
              text: controller.errorMessage!,
              error: true,
              onClose: controller.clearMessages,
            ),
          ] else if (controller.noticeMessage != null) ...[
            const SizedBox(height: 10),
            _TableMessage(
              text: controller.noticeMessage!,
              error: false,
              onClose: controller.clearMessages,
            ),
          ],
          if (controller.areas.isNotEmpty) ...[
            const SizedBox(height: 10),
            SizedBox(
              height: 42,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: const Text('Tutte'),
                      selected: controller.selectedAreaId == null,
                      onSelected: controller.busy
                          ? null
                          : (_) => controller.selectArea(null),
                    ),
                  ),
                  ...controller.areas.map(
                    (area) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(area.name),
                        selected: controller.selectedAreaId == area.id,
                        onSelected: controller.busy
                            ? null
                            : (_) => controller.selectArea(area.id),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          Expanded(
            child: controller.visibleTables.isEmpty
                ? const FluxaEmptyView(
                    icon: Icons.table_restaurant_outlined,
                    title: 'Nessun tavolo',
                    message: 'Configura i tavoli dalla gestione avanzata.',
                  )
                : LayoutBuilder(
                    builder: (context, constraints) {
                      final columns = switch (constraints.maxWidth) {
                        >= 1200 => 5,
                        >= 900 => 4,
                        >= 620 => 3,
                        >= 400 => 2,
                        _ => 1,
                      };
                      return GridView.builder(
                        key: const Key('fast-tables-grid'),
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: columns,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          childAspectRatio: columns == 1 ? 2.5 : 1.25,
                        ),
                        itemCount: controller.visibleTables.length,
                        itemBuilder: (context, index) {
                          final table = controller.visibleTables[index];
                          return _FastTableCard(
                            table: table,
                            busy: controller.busy,
                            onTap: () => _openTable(
                              context,
                              controller,
                              orderController,
                              table,
                            ),
                          );
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _FastTableCard extends StatelessWidget {
  const _FastTableCard({
    required this.table,
    required this.busy,
    required this.onTap,
  });

  final DiningTableFloor table;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final session = table.session;
    final theme = Theme.of(context);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('fast-table-${table.id}'),
        onTap: busy ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    table.occupied
                        ? Icons.people_alt
                        : Icons.table_restaurant_outlined,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      table.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleLarge,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: table.occupied
                          ? theme.colorScheme.primaryContainer
                          : theme.colorScheme.secondaryContainer,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      table.occupied ? 'OCCUPATO' : 'LIBERO',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
              Text('${table.code} · ${table.capacity} posti'),
              const Spacer(),
              if (session == null) ...[
                Text(
                  'Tocca per aprire',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                const Text('Scegli i coperti e inizi subito l’ordine.'),
              ] else ...[
                Text(
                  '${session.guestCount} coperti · ${session.orderCount} ordini',
                ),
                const SizedBox(height: 4),
                Text(
                  formatOrderMoney(session.openTotalCents, 'EUR'),
                  style: theme.textTheme.titleLarge,
                ),
                const SizedBox(height: 4),
                Text(
                  'Tocca per continuare',
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

Future<void> _openTable(
  BuildContext context,
  TableController controller,
  OrderController orderController,
  DiningTableFloor table,
) async {
  if (!table.occupied) {
    final guestCount = await _pickGuestCount(context, table);
    if (guestCount == null || !context.mounted) {
      return;
    }
    final order = await controller.openSessionAndCreateOrder(
      table: table,
      guestCount: guestCount,
    );
    if (order == null) {
      return;
    }
    final selected = await orderController.selectOrder(order.header.id);
    if (selected && context.mounted) {
      context.go('/home');
    }
    return;
  }

  await controller.selectTable(table);
  if (!context.mounted) {
    return;
  }
  final session = controller.selectedSession;
  if (session == null) {
    return;
  }

  final actionableOrders = session.orders
      .where(
        (order) =>
            order.status == OrderStatus.open ||
            order.status == OrderStatus.held ||
            order.status == OrderStatus.awaitingPayment,
      )
      .toList(growable: false);

  if (actionableOrders.length == 1) {
    await _openOrder(context, orderController, actionableOrders.single);
    return;
  }

  await _showOccupiedTableActions(
    context,
    controller,
    orderController,
    session,
    actionableOrders,
  );
}

Future<int?> _pickGuestCount(
  BuildContext context,
  DiningTableFloor table,
) async {
  final choice = await showModalBottomSheet<int>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Quanti siete?',
              style: Theme.of(sheetContext).textTheme.headlineSmall,
            ),
            Text('${table.name} · ${table.capacity} posti'),
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (var guests = 1; guests <= 6; guests += 1)
                  SizedBox(
                    width: 72,
                    height: 58,
                    child: FilledButton(
                      key: Key('fast-guests-$guests'),
                      onPressed: () => Navigator.pop(sheetContext, guests),
                      child: Text(
                        '$guests',
                        style: Theme.of(sheetContext).textTheme.titleLarge,
                      ),
                    ),
                  ),
                SizedBox(
                  height: 58,
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(sheetContext, 0),
                    child: const Text('7+'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );

  if (choice == null) {
    return null;
  }
  if (choice > 0) {
    return choice;
  }
  if (!context.mounted) {
    return null;
  }
  return _askGuestCount(context);
}

Future<int?> _askGuestCount(BuildContext context) async {
  var value = '';
  String? errorText;
  return showDialog<int>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: const Text('Quanti siete?'),
        content: TextField(
          autofocus: true,
          keyboardType: TextInputType.number,
          onChanged: (next) => value = next,
          decoration: InputDecoration(
            labelText: 'Numero persone',
            errorText: errorText,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () {
              final guests = int.tryParse(value.trim());
              if (guests == null || guests < 1 || guests > 100) {
                setState(() => errorText = 'Inserisci un valore da 1 a 100.');
                return;
              }
              Navigator.pop(dialogContext, guests);
            },
            child: const Text('APRI TAVOLO'),
          ),
        ],
      ),
    ),
  );
}

Future<void> _showOccupiedTableActions(
  BuildContext context,
  TableController controller,
  OrderController orderController,
  TableSessionDetail session,
  List<OrderHeader> actionableOrders,
) async {
  final canClose = !session.hasBlockingOrders;
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              session.table?.name ?? 'Tavolo',
              style: Theme.of(sheetContext).textTheme.headlineSmall,
            ),
            Text('${session.guestCount} coperti'),
            const SizedBox(height: 16),
            if (actionableOrders.isNotEmpty) ...[
              Text(
                'Cosa vuoi continuare?',
                style: Theme.of(sheetContext).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 260),
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: actionableOrders.length,
                  separatorBuilder: (context, index) =>
                      const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final order = actionableOrders[index];
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(_orderActionIcon(order.status)),
                      title: Text(order.number),
                      subtitle: Text(_orderActionLabel(order.status)),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            formatOrderMoney(order.totalCents, order.currency),
                          ),
                          const SizedBox(width: 6),
                          const Icon(Icons.chevron_right),
                        ],
                      ),
                      onTap: () async {
                        Navigator.pop(sheetContext);
                        await _openOrder(context, orderController, order);
                      },
                    );
                  },
                ),
              ),
              const SizedBox(height: 12),
            ] else if (canClose) ...[
              Material(
                color: Theme.of(sheetContext).colorScheme.secondaryContainer,
                borderRadius: BorderRadius.circular(12),
                child: const Padding(
                  padding: EdgeInsets.all(14),
                  child: Text(
                    'Non ci sono ordini da completare. Il tavolo può essere liberato.',
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (canClose && actionableOrders.isEmpty) ...[
              FilledButton.icon(
                key: const Key('fast-table-close'),
                onPressed: controller.busy
                    ? null
                    : () async {
                        final closed = await controller.closeSession();
                        if (closed && sheetContext.mounted) {
                          Navigator.pop(sheetContext);
                        }
                      },
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('LIBERA TAVOLO'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                key: const Key('fast-table-new-order'),
                onPressed: controller.busy
                    ? null
                    : () => _createNewTableOrder(
                        context,
                        sheetContext,
                        controller,
                        orderController,
                      ),
                icon: const Icon(Icons.add_shopping_cart),
                label: const Text('Aggiungi un altro ordine'),
              ),
            ] else ...[
              OutlinedButton.icon(
                key: const Key('fast-table-new-order'),
                onPressed: controller.busy
                    ? null
                    : () => _createNewTableOrder(
                        context,
                        sheetContext,
                        controller,
                        orderController,
                      ),
                icon: const Icon(Icons.add_shopping_cart),
                label: const Text('Nuovo ordine sul tavolo'),
              ),
              if (canClose) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: controller.busy
                      ? null
                      : () async {
                          final closed = await controller.closeSession();
                          if (closed && sheetContext.mounted) {
                            Navigator.pop(sheetContext);
                          }
                        },
                  icon: const Icon(Icons.check_circle_outline),
                  label: const Text('Libera tavolo'),
                ),
              ],
            ],
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: () {
                Navigator.pop(sheetContext);
                context.go('/tables/manage');
              },
              icon: const Icon(Icons.tune),
              label: const Text('Gestione avanzata tavolo'),
            ),
          ],
        ),
      ),
    ),
  );
}

Future<void> _createNewTableOrder(
  BuildContext context,
  BuildContext sheetContext,
  TableController controller,
  OrderController orderController,
) async {
  final order = await controller.createAndAttachOrder();
  if (order == null) {
    return;
  }
  if (sheetContext.mounted) {
    Navigator.pop(sheetContext);
  }
  final selected = await orderController.selectOrder(order.header.id);
  if (selected && context.mounted) {
    context.go('/home');
  }
}

String _orderActionLabel(OrderStatus status) => switch (status) {
  OrderStatus.awaitingPayment => 'Vai al pagamento',
  OrderStatus.held => 'Riprendi ordine',
  _ => 'Continua ordine',
};

IconData _orderActionIcon(OrderStatus status) => switch (status) {
  OrderStatus.awaitingPayment => Icons.payments_outlined,
  OrderStatus.held => Icons.play_arrow,
  _ => Icons.shopping_cart_outlined,
};

Future<void> _openOrder(
  BuildContext context,
  OrderController controller,
  OrderHeader order,
) async {
  if (order.status == OrderStatus.held) {
    final resumed = await controller.resumeOrder(order.id);
    if (resumed && context.mounted) {
      context.go('/home');
    }
    return;
  }

  final selected = await controller.selectOrder(order.id);
  if (!selected || !context.mounted) {
    return;
  }
  if (order.status == OrderStatus.awaitingPayment) {
    context.push('/checkout/${order.id}');
  } else {
    context.go('/home');
  }
}

class _TableMessage extends StatelessWidget {
  const _TableMessage({
    required this.text,
    required this.error,
    required this.onClose,
  });

  final String text;
  final bool error;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) => Material(
    color: error
        ? Theme.of(context).colorScheme.errorContainer
        : Theme.of(context).colorScheme.secondaryContainer,
    borderRadius: BorderRadius.circular(8),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          Expanded(child: Text(text)),
          IconButton(
            onPressed: onClose,
            icon: const Icon(Icons.close, size: 18),
          ),
        ],
      ),
    ),
  );
}
