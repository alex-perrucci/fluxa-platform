import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../orders/domain/order_models.dart';
import '../../orders/presentation/order_controller.dart';
import '../domain/hospitality_models.dart';
import 'table_controller.dart';

class OperatorTablesScreen extends ConsumerStatefulWidget {
  const OperatorTablesScreen({super.key});

  @override
  ConsumerState<OperatorTablesScreen> createState() =>
      _OperatorTablesScreenState();
}

class _OperatorTablesScreenState extends ConsumerState<OperatorTablesScreen> {
  String? _scheduledLocationId;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).state;
    final tables = ref.watch(tableControllerProvider);
    final orders = ref.watch(orderControllerProvider);
    final location = auth.deviceAssignment?.location;

    if (location == null) {
      return const FluxaEmptyView(
        icon: Icons.table_restaurant_outlined,
        title: 'Tavoli non disponibili',
        message: 'Questa postazione non è ancora associata a una sede.',
      );
    }

    _scheduleLoad(location.id, tables, orders);
    if (tables.locationId != location.id || orders.locationId != location.id) {
      return const FluxaLoadingView(label: 'Apertura tavoli');
    }
    if (tables.status == FloorLoadStatus.loading && tables.floor == null) {
      return const FluxaLoadingView(label: 'Caricamento tavoli');
    }
    if (tables.floor == null) {
      return FluxaEmptyView(
        icon: Icons.cloud_off_outlined,
        title: 'Sala non disponibile',
        message: tables.errorMessage ?? 'Aggiorna e riprova.',
      );
    }

    return _TablesWorkspace(tables: tables, orders: orders);
  }

  void _scheduleLoad(
    String locationId,
    TableController tables,
    OrderController orders,
  ) {
    if (_scheduledLocationId == locationId &&
        tables.locationId == locationId &&
        orders.locationId == locationId) {
      return;
    }
    _scheduledLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future.wait([
        tables.locationId == locationId
            ? tables.refreshOperationalState()
            : tables.bindLocation(locationId),
        orders.locationId == locationId
            ? orders.refreshOperationalState()
            : orders.bindLocation(locationId),
      ]);
      if (mounted) setState(() {});
    });
  }
}

class _TablesWorkspace extends StatelessWidget {
  const _TablesWorkspace({required this.tables, required this.orders});

  final TableController tables;
  final OrderController orders;

  @override
  Widget build(BuildContext context) {
    final visible = tables.visibleTables;
    final occupied = (tables.floor?.tables ?? const <DiningTableFloor>[])
        .where((table) => table.occupied)
        .length;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
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
                    Text('$occupied occupati · tocca il tavolo e continua'),
                  ],
                ),
              ),
              TextButton.icon(
                onPressed: () => context.go('/tables/manage'),
                icon: const Icon(Icons.tune),
                label: const Text('Gestione'),
              ),
            ],
          ),
          if (tables.errorMessage != null) ...[
            const SizedBox(height: 8),
            Material(
              color: Theme.of(context).colorScheme.errorContainer,
              borderRadius: BorderRadius.circular(12),
              child: ListTile(
                title: Text(tables.errorMessage!),
                trailing: IconButton(
                  onPressed: tables.clearMessages,
                  icon: const Icon(Icons.close),
                ),
              ),
            ),
          ],
          if (tables.areas.isNotEmpty) ...[
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
                      selected: tables.selectedAreaId == null,
                      onSelected: tables.busy
                          ? null
                          : (_) => tables.selectArea(null),
                    ),
                  ),
                  ...tables.areas.map(
                    (area) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(area.name),
                        selected: tables.selectedAreaId == area.id,
                        onSelected: tables.busy
                            ? null
                            : (_) => tables.selectArea(area.id),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          Expanded(
            child: visible.isEmpty
                ? const FluxaEmptyView(
                    icon: Icons.table_restaurant_outlined,
                    title: 'Nessun tavolo',
                    message: 'Configura la sala dalla Gestione tavoli.',
                  )
                : LayoutBuilder(
                    builder: (context, constraints) {
                      final columns = switch (constraints.maxWidth) {
                        >= 1180 => 5,
                        >= 860 => 4,
                        >= 580 => 3,
                        >= 380 => 2,
                        _ => 1,
                      };
                      return GridView.builder(
                        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: columns,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          childAspectRatio: columns == 1 ? 2.8 : 1.3,
                        ),
                        itemCount: visible.length,
                        itemBuilder: (context, index) => _TableCard(
                          table: visible[index],
                          busy: tables.busy,
                          onTap: () => _openTable(
                            context,
                            visible[index],
                            tables,
                            orders,
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class _TableCard extends StatelessWidget {
  const _TableCard({
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
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('operator-table-${table.id}'),
        onTap: busy ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      table.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  Chip(label: Text(table.occupied ? 'OCCUPATO' : 'LIBERO')),
                ],
              ),
              Text('${table.capacity} posti'),
              const Spacer(),
              if (session == null)
                Text(
                  'TOCCA PER APRIRE',
                  style: Theme.of(context).textTheme.titleMedium,
                )
              else ...[
                Text('${session.guestCount} persone'),
                Text(
                  formatOrderMoney(session.openTotalCents, 'EUR'),
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 2),
                const Text('TOCCA PER CONTINUARE'),
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
  DiningTableFloor table,
  TableController tables,
  OrderController orders,
) async {
  if (!table.occupied) {
    final guests = await _pickGuests(context, table);
    if (guests == null || !context.mounted) return;
    final order = await tables.openSessionAndCreateOrder(
      table: table,
      guestCount: guests,
    );
    if (order == null) return;
    final selected = await orders.selectOrder(order.header.id);
    if (selected && context.mounted) context.go('/home');
    return;
  }

  await tables.selectTable(table);
  if (!context.mounted) return;
  final session = tables.selectedSession;
  if (session == null) return;

  final actionable = session.orders
      .where(
        (order) =>
            order.status == OrderStatus.open ||
            order.status == OrderStatus.held ||
            order.status == OrderStatus.awaitingPayment,
      )
      .toList(growable: false);

  if (actionable.length == 1) {
    await _continueOrder(context, actionable.single, orders);
    return;
  }
  if (actionable.length > 1) {
    await _chooseLegacyOrder(context, actionable, orders);
    return;
  }

  if (!session.hasBlockingOrders) {
    final close = await showModalBottomSheet<bool>(
      context: context,
      showDragHandle: true,
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
              const SizedBox(height: 8),
              const Text('Il conto è concluso. Puoi liberare il tavolo.'),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () => Navigator.pop(sheetContext, true),
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('LIBERA TAVOLO'),
              ),
              TextButton.icon(
                onPressed: () {
                  Navigator.pop(sheetContext, false);
                  context.go('/tables/manage');
                },
                icon: const Icon(Icons.tune),
                label: const Text('Gestione avanzata'),
              ),
            ],
          ),
        ),
      ),
    );
    if (close == true) await tables.closeSession();
  }
}

Future<int?> _pickGuests(BuildContext context, DiningTableFloor table) async {
  final choice = await showModalBottomSheet<int>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Quanti siete?',
              style: Theme.of(sheetContext).textTheme.headlineSmall,
            ),
            Text(table.name),
            const SizedBox(height: 14),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (var value = 1; value <= 6; value += 1)
                  SizedBox(
                    width: 72,
                    height: 58,
                    child: FilledButton(
                      onPressed: () => Navigator.pop(sheetContext, value),
                      child: Text('$value'),
                    ),
                  ),
                SizedBox(
                  height: 58,
                  child: OutlinedButton(
                    onPressed: () => Navigator.pop(sheetContext, 7),
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
  if (choice == null || choice <= 6) return choice;
  if (!context.mounted) return null;

  var raw = '';
  return showDialog<int>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Numero persone'),
      content: TextField(
        autofocus: true,
        keyboardType: TextInputType.number,
        onChanged: (value) => raw = value,
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('Annulla'),
        ),
        FilledButton(
          onPressed: () {
            final value = int.tryParse(raw.trim());
            if (value != null && value > 0 && value <= 100) {
              Navigator.pop(dialogContext, value);
            }
          },
          child: const Text('APRI'),
        ),
      ],
    ),
  );
}

Future<void> _chooseLegacyOrder(
  BuildContext context,
  List<OrderHeader> orders,
  OrderController controller,
) async {
  final selected = await showModalBottomSheet<OrderHeader>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Ci sono più conti aperti',
              style: Theme.of(sheetContext).textTheme.titleLarge,
            ),
            const Text(
              'È una situazione eccezionale: scegli quale continuare.',
            ),
            const SizedBox(height: 8),
            ...orders.map(
              (order) => ListTile(
                title: Text(order.number),
                subtitle: Text(order.status.label),
                trailing: Text(
                  formatOrderMoney(order.totalCents, order.currency),
                ),
                onTap: () => Navigator.pop(sheetContext, order),
              ),
            ),
          ],
        ),
      ),
    ),
  );
  if (selected != null && context.mounted) {
    await _continueOrder(context, selected, controller);
  }
}

Future<void> _continueOrder(
  BuildContext context,
  OrderHeader order,
  OrderController controller,
) async {
  if (order.status == OrderStatus.held) {
    final resumed = await controller.resumeOrder(order.id);
    if (resumed && context.mounted) context.go('/home');
    return;
  }
  final selected = await controller.selectOrder(order.id);
  if (!selected || !context.mounted) return;
  if (order.status == OrderStatus.awaitingPayment) {
    context.push('/checkout/${order.id}');
  } else {
    context.go('/home');
  }
}
