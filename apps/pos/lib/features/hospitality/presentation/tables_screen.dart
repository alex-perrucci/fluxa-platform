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

class TablesScreen extends ConsumerStatefulWidget {
  const TablesScreen({super.key});

  @override
  ConsumerState<TablesScreen> createState() => _TablesScreenState();
}

class _TablesScreenState extends ConsumerState<TablesScreen> {
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
      return const FluxaLoadingView(label: 'Allineamento sala');
    }
    return TablesView(
      controller: tableController,
      orderController: orderController,
      location: location,
      canManage: _isManagerRole(authController.state.session?.role),
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

class TablesView extends StatelessWidget {
  const TablesView({
    required this.controller,
    required this.orderController,
    required this.location,
    required this.canManage,
    super.key,
  });

  final TableController controller;
  final OrderController orderController;
  final OperationalLocation location;
  final bool canManage;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, child) => Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _TablesHeader(controller: controller, location: location),
          if (controller.errorMessage != null) ...[
            const SizedBox(height: 12),
            _MessageCard(
              message: controller.errorMessage!,
              error: true,
              onDismiss: controller.clearMessages,
            ),
          ] else if (controller.noticeMessage != null) ...[
            const SizedBox(height: 12),
            _MessageCard(
              message: controller.noticeMessage!,
              error: false,
              onDismiss: controller.clearMessages,
            ),
          ],
          const SizedBox(height: 12),
          _AreaFilters(controller: controller),
          const SizedBox(height: 12),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final floor = _FloorGrid(controller: controller);
                final detail = _TableDetailPanel(
                  controller: controller,
                  orderController: orderController,
                  canManage: canManage,
                );
                if (constraints.maxWidth >= 1100) {
                  return Row(
                    children: [
                      Expanded(child: floor),
                      const SizedBox(width: 16),
                      SizedBox(width: 430, child: detail),
                    ],
                  );
                }
                if (controller.selectedTable == null) {
                  return floor;
                }
                return Column(
                  children: [
                    Expanded(child: floor),
                    const SizedBox(height: 12),
                    SizedBox(height: 410, child: detail),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    ),
  );
}

class _TablesHeader extends StatelessWidget {
  const _TablesHeader({required this.controller, required this.location});

  final TableController controller;
  final OperationalLocation location;

  @override
  Widget build(BuildContext context) {
    final tables = controller.floor?.tables ?? const <DiningTableFloor>[];
    final occupied = tables.where((table) => table.occupied).length;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Tavoli', style: Theme.of(context).textTheme.headlineMedium),
              Text('${location.name} · $occupied occupati su ${tables.length}'),
            ],
          ),
        ),
        IconButton.filledTonal(
          key: const Key('tables-refresh-button'),
          tooltip: 'Aggiorna pianta sala',
          onPressed: controller.busy ? null : controller.refreshFloor,
          icon: controller.status == FloorLoadStatus.loading
              ? const SizedBox.square(
                  dimension: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.refresh),
        ),
      ],
    );
  }
}

class _AreaFilters extends StatelessWidget {
  const _AreaFilters({required this.controller});

  final TableController controller;

  @override
  Widget build(BuildContext context) {
    if (controller.areas.isEmpty) {
      return const SizedBox.shrink();
    }
    return SizedBox(
      height: 44,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              key: const Key('tables-area-all'),
              selected: controller.selectedAreaId == null,
              label: const Text('Tutte le sale'),
              onSelected: controller.busy
                  ? null
                  : (_) => controller.selectArea(null),
            ),
          ),
          ...controller.areas.map(
            (area) => Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                key: Key('tables-area-${area.id}'),
                selected: controller.selectedAreaId == area.id,
                label: Text('${area.name} (${area.tables.length})'),
                onSelected: controller.busy
                    ? null
                    : (_) => controller.selectArea(area.id),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FloorGrid extends StatelessWidget {
  const _FloorGrid({required this.controller});

  final TableController controller;

  @override
  Widget build(BuildContext context) {
    if (controller.status == FloorLoadStatus.loading &&
        controller.floor == null) {
      return const FluxaLoadingView(label: 'Caricamento pianta sala');
    }
    if (controller.status == FloorLoadStatus.failure &&
        controller.floor == null) {
      return FluxaEmptyView(
        icon: Icons.cloud_off_outlined,
        title: 'Pianta sala non disponibile',
        message: controller.errorMessage ?? 'Riprova tra poco.',
      );
    }
    final tables = controller.visibleTables;
    if (tables.isEmpty) {
      return const FluxaEmptyView(
        icon: Icons.table_restaurant_outlined,
        title: 'Nessun tavolo configurato',
        message:
            'Un amministratore deve configurare sale e tavoli per questa location.',
      );
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = switch (constraints.maxWidth) {
          >= 1200 => 5,
          >= 900 => 4,
          >= 640 => 3,
          >= 420 => 2,
          _ => 1,
        };
        return GridView.builder(
          key: const Key('tables-floor-grid'),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: columns == 1 ? 2.1 : 1.15,
          ),
          itemCount: tables.length,
          itemBuilder: (context, index) {
            final table = tables[index];
            return _TableCard(
              table: table,
              selected: controller.selectedTableId == table.id,
              currency: 'EUR',
              onTap: controller.busy
                  ? null
                  : () async => controller.selectTable(table),
            );
          },
        );
      },
    );
  }
}

class _TableCard extends StatelessWidget {
  const _TableCard({
    required this.table,
    required this.selected,
    required this.currency,
    required this.onTap,
  });

  final DiningTableFloor table;
  final bool selected;
  final String currency;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final session = table.session;
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('table-card-${table.id}'),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
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
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  if (selected) const Icon(Icons.check_circle),
                ],
              ),
              Text('${table.code} · ${table.capacity} posti'),
              const Spacer(),
              if (session == null)
                const Text('Libero')
              else ...[
                Text(
                  '${session.guestCount} coperti · ${session.orderCount} ordini',
                ),
                const SizedBox(height: 4),
                Text(
                  formatOrderMoney(session.openTotalCents, currency),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _TableDetailPanel extends StatelessWidget {
  const _TableDetailPanel({
    required this.controller,
    required this.orderController,
    required this.canManage,
  });

  final TableController controller;
  final OrderController orderController;
  final bool canManage;

  @override
  Widget build(BuildContext context) {
    final table = controller.selectedTable;
    if (table == null) {
      return const FluxaEmptyView(
        icon: Icons.touch_app_outlined,
        title: 'Seleziona un tavolo',
        message: 'Apri un tavolo libero o gestisci una sessione già attiva.',
      );
    }
    final session = controller.selectedSession;
    if (session == null && table.occupied && controller.busy) {
      return const FluxaLoadingView(label: 'Caricamento tavolo');
    }
    if (session == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.event_seat_outlined, size: 54),
              const SizedBox(height: 12),
              Text(
                '${table.name} libero',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              Text('${table.code} · capienza ${table.capacity}'),
              const SizedBox(height: 20),
              FilledButton.icon(
                key: const Key('open-table-button'),
                onPressed: controller.busy
                    ? null
                    : () async =>
                          _showOpenTableDialog(context, controller, table),
                icon: const Icon(Icons.group_add_outlined),
                label: const Text('Apri tavolo'),
              ),
            ],
          ),
        ),
      );
    }
    return _SessionDetail(
      controller: controller,
      orderController: orderController,
      session: session,
      canManage: canManage,
    );
  }
}

class _SessionDetail extends StatelessWidget {
  const _SessionDetail({
    required this.controller,
    required this.orderController,
    required this.session,
    required this.canManage,
  });

  final TableController controller;
  final OrderController orderController;
  final TableSessionDetail session;
  final bool canManage;

  @override
  Widget build(BuildContext context) {
    final table = session.table;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
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
                        table?.name ?? 'Tavolo',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      Text(
                        '${table?.areaName ?? 'Sala'} · '
                        '${session.guestCount} coperti · v${session.version}',
                      ),
                    ],
                  ),
                ),
                Chip(label: Text(session.status.label)),
                IconButton(
                  tooltip: 'Chiudi dettaglio',
                  onPressed: controller.busy ? null : controller.closeSelection,
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            if (session.note != null) ...[
              const SizedBox(height: 8),
              Text('Nota: ${session.note}'),
            ],
            const Divider(height: 22),
            Expanded(
              child: session.orders.isEmpty
                  ? const FluxaEmptyView(
                      icon: Icons.receipt_long_outlined,
                      title: 'Nessun ordine collegato',
                      message:
                          'Crea un ordine TABLE oppure collegane uno esistente.',
                    )
                  : ListView.separated(
                      itemCount: session.orders.length,
                      separatorBuilder: (context, index) =>
                          const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final order = session.orders[index];
                        return ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(order.number),
                          subtitle: Text(
                            '${order.status.label} · '
                            '${formatOrderMoney(order.totalCents, order.currency)}',
                          ),
                          trailing: IconButton(
                            tooltip: 'Apri ordine',
                            onPressed: controller.busy
                                ? null
                                : () async {
                                    final selected = await orderController
                                        .selectOrder(order.id);
                                    if (selected && context.mounted) {
                                      context.go('/orders');
                                    }
                                  },
                            icon: const Icon(Icons.open_in_new),
                          ),
                        );
                      },
                    ),
            ),
            const Divider(height: 22),
            _SessionTotal(session: session),
            const SizedBox(height: 12),
            Wrap(
              alignment: WrapAlignment.end,
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  key: const Key('edit-table-session-button'),
                  onPressed: controller.busy
                      ? null
                      : () async => _showEditSessionDialog(
                          context,
                          controller,
                          session,
                        ),
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Modifica'),
                ),
                OutlinedButton.icon(
                  key: const Key('move-table-session-button'),
                  onPressed: controller.busy || controller.movableTables.isEmpty
                      ? null
                      : () async => _showMoveDialog(context, controller),
                  icon: const Icon(Icons.swap_horiz),
                  label: const Text('Sposta'),
                ),
                OutlinedButton.icon(
                  key: const Key('attach-table-order-button'),
                  onPressed: controller.busy
                      ? null
                      : () async => _showAttachOrderDialog(context, controller),
                  icon: const Icon(Icons.link),
                  label: const Text('Collega ordine'),
                ),
                FilledButton.tonalIcon(
                  key: const Key('new-table-order-button'),
                  onPressed: controller.busy
                      ? null
                      : () async {
                          final order = await controller.createAndAttachOrder();
                          if (order == null) {
                            return;
                          }
                          final selected = await orderController.selectOrder(
                            order.header.id,
                          );
                          if (selected && context.mounted) {
                            context.go('/home');
                          }
                        },
                  icon: const Icon(Icons.add_shopping_cart),
                  label: const Text('Nuovo ordine'),
                ),
                FilledButton.icon(
                  key: const Key('close-table-session-button'),
                  onPressed: controller.busy || session.hasBlockingOrders
                      ? null
                      : () async => _confirmCloseSession(
                          context,
                          controller,
                          cancel: false,
                        ),
                  icon: const Icon(Icons.lock_outline),
                  label: const Text('Libera tavolo'),
                ),
                if (canManage)
                  TextButton.icon(
                    key: const Key('cancel-table-session-button'),
                    onPressed: controller.busy || session.hasBlockingOrders
                        ? null
                        : () async => _confirmCloseSession(
                            context,
                            controller,
                            cancel: true,
                          ),
                    icon: const Icon(Icons.cancel_outlined),
                    label: const Text('Annulla sessione'),
                  ),
              ],
            ),
            if (session.hasBlockingOrders)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Per liberare il tavolo, tutti gli ordini devono essere pagati o annullati.',
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SessionTotal extends StatelessWidget {
  const _SessionTotal({required this.session});

  final TableSessionDetail session;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(
          '${session.orders.length} ordini collegati',
          style: Theme.of(context).textTheme.bodyLarge,
        ),
      ),
      Text(
        formatOrderMoney(session.totalCents, session.currency),
        style: Theme.of(context).textTheme.titleLarge,
      ),
    ],
  );
}

Future<void> _showOpenTableDialog(
  BuildContext context,
  TableController controller,
  DiningTableFloor table,
) async {
  var guestCountText = '1';
  var noteText = '';
  String? validationMessage;
  await showDialog<void>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: Text('Apri ${table.name}'),
        content: SizedBox(
          width: 420,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  key: const Key('table-guest-count-field'),
                  initialValue: guestCountText,
                  onChanged: (value) => guestCountText = value,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Coperti',
                    border: const OutlineInputBorder(),
                    errorText: validationMessage,
                  ),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  key: const Key('table-note-field'),
                  initialValue: noteText,
                  onChanged: (value) => noteText = value,
                  maxLength: 500,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Nota (facoltativa)',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annulla'),
          ),
          FilledButton(
            key: const Key('confirm-open-table-button'),
            onPressed: () async {
              final guestCount = int.tryParse(guestCountText.trim());
              if (guestCount == null || guestCount < 1 || guestCount > 100) {
                setState(
                  () => validationMessage =
                      'Inserisci un numero di coperti da 1 a 100.',
                );
                return;
              }
              final opened = await controller.openSession(
                table: table,
                guestCount: guestCount,
                note: noteText,
              );
              if (opened && dialogContext.mounted) {
                Navigator.pop(dialogContext);
              }
            },
            child: const Text('Apri'),
          ),
        ],
      ),
    ),
  );
}

Future<void> _showEditSessionDialog(
  BuildContext context,
  TableController controller,
  TableSessionDetail session,
) async {
  var guestCountText = session.guestCount.toString();
  var noteText = session.note ?? '';
  String? validationMessage;
  await showDialog<void>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: const Text('Modifica tavolo'),
        content: SizedBox(
          width: 420,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  initialValue: guestCountText,
                  onChanged: (value) => guestCountText = value,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Coperti',
                    border: const OutlineInputBorder(),
                    errorText: validationMessage,
                  ),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  initialValue: noteText,
                  onChanged: (value) => noteText = value,
                  maxLength: 500,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Nota',
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () async {
              final guestCount = int.tryParse(guestCountText.trim());
              if (guestCount == null || guestCount < 1 || guestCount > 100) {
                setState(
                  () => validationMessage =
                      'Inserisci un numero di coperti da 1 a 100.',
                );
                return;
              }
              final updated = await controller.updateSession(
                guestCount: guestCount,
                note: noteText,
              );
              if (updated && dialogContext.mounted) {
                Navigator.pop(dialogContext);
              }
            },
            child: const Text('Salva'),
          ),
        ],
      ),
    ),
  );
}

Future<void> _showMoveDialog(
  BuildContext context,
  TableController controller,
) async {
  DiningTableFloor? selected;
  if (controller.movableTables.isNotEmpty) {
    selected = controller.movableTables.first;
  }
  await showDialog<void>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: const Text('Sposta conto'),
        content: SizedBox(
          width: 420,
          child: DropdownButtonFormField<DiningTableFloor>(
            value: selected,
            decoration: const InputDecoration(
              labelText: 'Tavolo di destinazione',
              border: OutlineInputBorder(),
            ),
            items: controller.movableTables
                .map(
                  (table) => DropdownMenuItem(
                    value: table,
                    child: Text('${table.name} · ${table.capacity} posti'),
                  ),
                )
                .toList(growable: false),
            onChanged: (value) => setState(() => selected = value),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: selected == null
                ? null
                : () async {
                    final moved = await controller.moveSession(selected!);
                    if (moved && dialogContext.mounted) {
                      Navigator.pop(dialogContext);
                    }
                  },
            child: const Text('Sposta'),
          ),
        ],
      ),
    ),
  );
}

Future<void> _showAttachOrderDialog(
  BuildContext context,
  TableController controller,
) async {
  await controller.loadAttachableOrders();
  if (!context.mounted) {
    return;
  }
  await showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Collega ordine TABLE'),
      content: SizedBox(
        width: 520,
        height: 360,
        child: controller.attachableOrders.isEmpty
            ? const FluxaEmptyView(
                icon: Icons.link_off,
                title: 'Nessun ordine collegabile',
                message:
                    'Sono ammessi soltanto ordini TABLE aperti o in attesa.',
              )
            : ListView.separated(
                itemCount: controller.attachableOrders.length,
                separatorBuilder: (context, index) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final order = controller.attachableOrders[index];
                  return ListTile(
                    title: Text(order.number),
                    subtitle: Text(
                      '${order.status.label} · '
                      '${formatOrderMoney(order.totalCents, order.currency)}',
                    ),
                    trailing: const Icon(Icons.add_link),
                    onTap: () async {
                      final attached = await controller.attachExistingOrder(
                        order,
                      );
                      if (attached && dialogContext.mounted) {
                        Navigator.pop(dialogContext);
                      }
                    },
                  );
                },
              ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('Chiudi'),
        ),
      ],
    ),
  );
}

Future<void> _confirmCloseSession(
  BuildContext context,
  TableController controller, {
  required bool cancel,
}) async {
  var reasonText = '';
  await showDialog<void>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(cancel ? 'Annulla sessione' : 'Libera tavolo'),
      content: TextFormField(
        key: const Key('table-close-reason-field'),
        initialValue: reasonText,
        onChanged: (value) => reasonText = value,
        maxLength: 500,
        maxLines: 3,
        decoration: InputDecoration(
          labelText: cancel ? 'Motivo (facoltativo)' : 'Nota (facoltativa)',
          border: const OutlineInputBorder(),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('Indietro'),
        ),
        FilledButton(
          onPressed: () async {
            final completed = cancel
                ? await controller.cancelSession(reason: reasonText)
                : await controller.closeSession(reason: reasonText);
            if (completed && dialogContext.mounted) {
              Navigator.pop(dialogContext);
            }
          },
          child: Text(cancel ? 'Annulla sessione' : 'Libera'),
        ),
      ],
    ),
  );
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({
    required this.message,
    required this.error,
    required this.onDismiss,
  });

  final String message;
  final bool error;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: Icon(error ? Icons.error_outline : Icons.check_circle_outline),
      title: Text(message),
      trailing: IconButton(
        tooltip: 'Chiudi',
        onPressed: onDismiss,
        icon: const Icon(Icons.close),
      ),
    ),
  );
}

bool _isManagerRole(String? role) =>
    const {'OWNER', 'ADMIN', 'MANAGER'}.contains(role);
