import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../device/domain/device_assignment_models.dart';
import '../../printing/presentation/printing_controller.dart';
import '../../hospitality/presentation/kitchen_controller.dart';
import '../domain/order_models.dart';
import 'order_controller.dart';

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  String? _scheduledLocationId;
  String? _scheduledKitchenLocationId;

  @override
  Widget build(BuildContext context) {
    final authController = ref.watch(authControllerProvider);
    final orderController = ref.read(orderControllerProvider);
    final kitchenController = ref.watch(kitchenControllerProvider);
    final printingController = ref.watch(printingControllerProvider);
    final location = authController.state.deviceAssignment?.location;
    if (location == null) {
      return const FluxaEmptyView(
        icon: Icons.storefront_outlined,
        title: 'Location non disponibile',
        message: 'Completa il contesto operativo prima di aprire gli ordini.',
      );
    }
    _scheduleBind(orderController, location.id);
    _scheduleKitchenBind(kitchenController, location.id);
    if (orderController.locationId != location.id ||
        kitchenController.locationId != location.id) {
      return const FluxaLoadingView(label: 'Allineamento ordini');
    }
    return OrdersView(
      controller: orderController,
      kitchenController: kitchenController,
      printingController: printingController,
      location: location,
    );
  }

  void _scheduleBind(OrderController controller, String locationId) {
    if (controller.locationId == locationId ||
        _scheduledLocationId == locationId) {
      return;
    }
    _scheduledLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await controller.bindLocation(locationId);
      } finally {
        if (mounted && _scheduledLocationId == locationId) {
          setState(() => _scheduledLocationId = null);
        }
      }
    });
  }

  void _scheduleKitchenBind(KitchenController controller, String locationId) {
    if (controller.locationId == locationId ||
        _scheduledKitchenLocationId == locationId) {
      return;
    }
    _scheduledKitchenLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await controller.bindLocation(locationId);
      } finally {
        if (mounted && _scheduledKitchenLocationId == locationId) {
          setState(() => _scheduledKitchenLocationId = null);
        }
      }
    });
  }
}

class OrdersView extends StatelessWidget {
  const OrdersView({
    required this.controller,
    required this.kitchenController,
    this.printingController,
    required this.location,
    super.key,
  });

  final OrderController controller;
  final KitchenController kitchenController;
  final PrintingController? printingController;
  final OperationalLocation location;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, child) => Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _OrdersHeader(controller: controller, location: location),
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
          _StatusFilters(controller: controller),
          const SizedBox(height: 12),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final list = _OrdersList(controller: controller);
                final detail = _OrderDetailPane(
                  controller: controller,
                  kitchenController: kitchenController,
                  printingController: printingController,
                  locationId: location.id,
                );
                if (constraints.maxWidth >= 980) {
                  return Row(
                    children: [
                      SizedBox(width: 420, child: list),
                      const VerticalDivider(width: 24),
                      Expanded(child: detail),
                    ],
                  );
                }
                return controller.activeOrder == null ? list : detail;
              },
            ),
          ),
        ],
      ),
    ),
  );
}

class _OrdersHeader extends StatelessWidget {
  const _OrdersHeader({required this.controller, required this.location});

  final OrderController controller;
  final OperationalLocation location;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Ordini', style: Theme.of(context).textTheme.headlineMedium),
            Text('${location.name} · ${controller.orders.length} visualizzati'),
          ],
        ),
      ),
      IconButton.filledTonal(
        key: const Key('orders-refresh-button'),
        tooltip: 'Aggiorna ordini',
        onPressed: controller.busy ? null : controller.refreshOrders,
        icon: controller.listStatus == OrdersLoadStatus.loading
            ? const SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.refresh),
      ),
    ],
  );
}

class _StatusFilters extends StatelessWidget {
  const _StatusFilters({required this.controller});

  final OrderController controller;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 44,
    child: ListView(
      scrollDirection: Axis.horizontal,
      children: [
        Padding(
          padding: const EdgeInsets.only(right: 8),
          child: FilterChip(
            key: const Key('orders-filter-all'),
            selected: controller.statusFilter == null,
            label: const Text('Tutti'),
            onSelected: controller.busy
                ? null
                : (_) async => controller.setStatusFilter(null),
          ),
        ),
        ...OrderStatus.values.map(
          (status) => Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              key: Key('orders-filter-${status.wireValue}'),
              selected: controller.statusFilter == status,
              label: Text(status.label),
              onSelected: controller.busy
                  ? null
                  : (_) async => controller.setStatusFilter(status),
            ),
          ),
        ),
      ],
    ),
  );
}

class _OrdersList extends StatelessWidget {
  const _OrdersList({required this.controller});

  final OrderController controller;

  @override
  Widget build(BuildContext context) {
    if (controller.listStatus == OrdersLoadStatus.loading &&
        controller.orders.isEmpty) {
      return const FluxaLoadingView(label: 'Caricamento ordini');
    }
    if (controller.listStatus == OrdersLoadStatus.failure &&
        controller.orders.isEmpty) {
      return FluxaEmptyView(
        icon: Icons.cloud_off_outlined,
        title: 'Ordini non disponibili',
        message: controller.errorMessage ?? 'Riprova tra poco.',
      );
    }
    if (controller.orders.isEmpty) {
      return const FluxaEmptyView(
        icon: Icons.receipt_long_outlined,
        title: 'Nessun ordine',
        message: 'Gli ordini creati per questa location compariranno qui.',
      );
    }
    return Card(
      clipBehavior: Clip.antiAlias,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 390;
          return ListView.separated(
            key: const Key('orders-list'),
            itemCount: controller.orders.length,
            separatorBuilder: (context, index) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final order = controller.orders[index];
              final selected = controller.activeOrder?.header.id == order.id;
              final amount = formatOrderMoney(order.totalCents, order.currency);
              return ListTile(
                key: Key('order-row-${order.id}'),
                selected: selected,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                leading: compact
                    ? null
                    : CircleAvatar(child: Text(order.number.split('-').last)),
                title: Text(
                  order.number,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: compact
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${order.serviceMode.label} · '
                            'v${order.version} · $amount',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: _StatusChip(status: order.status),
                          ),
                        ],
                      )
                    : Text(
                        '${order.serviceMode.label} · '
                        'v${order.version} · $amount',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                trailing: compact ? null : _StatusChip(status: order.status),
                isThreeLine: compact,
                onTap: controller.busy
                    ? null
                    : () async => controller.selectOrder(order.id),
              );
            },
          );
        },
      ),
    );
  }
}

class _OrderDetailPane extends StatelessWidget {
  const _OrderDetailPane({
    required this.controller,
    required this.kitchenController,
    this.printingController,
    required this.locationId,
  });

  final OrderController controller;
  final KitchenController kitchenController;
  final PrintingController? printingController;
  final String locationId;

  @override
  Widget build(BuildContext context) {
    final order = controller.activeOrder;
    if (order == null) {
      return const FluxaEmptyView(
        icon: Icons.touch_app_outlined,
        title: 'Seleziona un ordine',
        message: 'Apri un ordine per visualizzare righe, stato e totali.',
      );
    }
    return Card(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 600;
          if (compact) {
            return ListView(
              key: const Key('compact-order-detail-scroll'),
              padding: const EdgeInsets.all(16),
              children: [
                _buildHeader(context, order, compact: true),
                if (order.header.customerNote != null) ...[
                  const SizedBox(height: 12),
                  Text('Nota: ${order.header.customerNote}'),
                ],
                const Divider(height: 24),
                if (order.items.isEmpty)
                  const SizedBox(
                    height: 160,
                    child: FluxaEmptyView(
                      icon: Icons.shopping_cart_outlined,
                      title: 'Ordine vuoto',
                      message: 'Aggiungi prodotti dalla schermata Cassa.',
                    ),
                  )
                else
                  ...order.items.map(
                    (item) => Column(
                      children: [
                        _buildItemTile(order, item, compact: true),
                        const Divider(height: 1),
                      ],
                    ),
                  ),
                const Divider(height: 24),
                ..._buildTotals(order),
                const SizedBox(height: 16),
                _buildActions(context, order),
              ],
            );
          }

          return Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(context, order, compact: false),
                if (order.header.customerNote != null) ...[
                  const SizedBox(height: 12),
                  Text('Nota: ${order.header.customerNote}'),
                ],
                const Divider(height: 24),
                Expanded(
                  child: order.items.isEmpty
                      ? const FluxaEmptyView(
                          icon: Icons.shopping_cart_outlined,
                          title: 'Ordine vuoto',
                          message: 'Aggiungi prodotti dalla schermata Cassa.',
                        )
                      : ListView.separated(
                          itemCount: order.items.length,
                          separatorBuilder: (context, index) =>
                              const Divider(height: 1),
                          itemBuilder: (context, index) => _buildItemTile(
                            order,
                            order.items[index],
                            compact: false,
                          ),
                        ),
                ),
                const Divider(height: 24),
                ..._buildTotals(order),
                const SizedBox(height: 16),
                _buildActions(context, order),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildHeader(
    BuildContext context,
    OrderDetail order, {
    required bool compact,
  }) {
    final identity = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          order.header.number,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        Text(
          '${order.header.serviceMode.label} · '
          '${order.header.businessDate} · '
          'versione ${order.header.version}',
        ),
      ],
    );

    if (compact) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: identity),
              IconButton(
                tooltip: 'Chiudi dettaglio',
                onPressed: controller.busy
                    ? null
                    : controller.discardCurrentView,
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          const SizedBox(height: 6),
          _StatusChip(status: order.header.status),
        ],
      );
    }

    return Row(
      children: [
        Expanded(child: identity),
        _StatusChip(status: order.header.status),
        IconButton(
          tooltip: 'Chiudi dettaglio',
          onPressed: controller.busy ? null : controller.discardCurrentView,
          icon: const Icon(Icons.close),
        ),
      ],
    );
  }

  Widget _buildItemTile(
    OrderDetail order,
    OrderItem item, {
    required bool compact,
  }) {
    final unit = formatOrderMoney(item.unitPriceCents, order.header.currency);
    final total = formatOrderMoney(item.finalGrossCents, order.header.currency);
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(
        item.displayName,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        compact
            ? '${item.displayQuantity} × $unit · $total'
            : '${item.displayQuantity} × $unit',
      ),
      trailing: compact ? null : Text(total),
    );
  }

  List<Widget> _buildTotals(OrderDetail order) => [
    _TotalRow(
      label: 'Subtotale',
      value: formatOrderMoney(
        order.header.subtotalCents,
        order.header.currency,
      ),
    ),
    if (order.header.discountCents > 0)
      _TotalRow(
        label: 'Sconti',
        value:
            '-${formatOrderMoney(order.header.discountCents, order.header.currency)}',
      ),
    _TotalRow(
      label: 'Totale',
      value: formatOrderMoney(order.header.totalCents, order.header.currency),
      emphasized: true,
    ),
  ];

  Widget _buildActions(BuildContext context, OrderDetail order) => Align(
    alignment: Alignment.centerRight,
    child: Wrap(
      alignment: WrapAlignment.end,
      spacing: 8,
      runSpacing: 8,
      children: [
        if (printingController != null)
          OutlinedButton.icon(
            key: const Key('print-order-receipt-button'),
            onPressed: controller.busy || printingController!.busy
                ? null
                : () async {
                    final printed = await printingController!
                        .requestOrderReceipt(order.header.id);
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          printed
                              ? printingController!.noticeMessage ??
                                    'Riepilogo ordine accodato.'
                              : printingController!.errorMessage ??
                                    'Stampa non riuscita.',
                        ),
                      ),
                    );
                  },
            icon: const Icon(Icons.print_outlined),
            label: const Text('Stampa riepilogo'),
          ),
        if (order.header.status == OrderStatus.paid)
          FilledButton.tonalIcon(
            key: const Key('fiscalize-paid-order-button'),
            onPressed: controller.busy
                ? null
                : () => context.push('/fiscalize/${order.header.id}'),
            icon: const Icon(Icons.receipt_long_outlined),
            label: const Text('Fiscalizza'),
          ),
        if ((order.header.status == OrderStatus.open ||
                order.header.status == OrderStatus.held) &&
            order.items.isNotEmpty)
          OutlinedButton.icon(
            key: const Key('send-order-kitchen-button'),
            onPressed: controller.busy || kitchenController.busy
                ? null
                : () async {
                    final sent = await kitchenController.dispatchOrder(
                      locationId: locationId,
                      orderId: order.header.id,
                    );
                    if (!context.mounted) return;
                    final message = sent
                        ? kitchenController.noticeMessage ??
                              'Ordine inviato in cucina.'
                        : kitchenController.errorMessage ??
                              'Invio cucina non riuscito.';
                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(SnackBar(content: Text(message)));
                  },
            icon: const Icon(Icons.soup_kitchen_outlined),
            label: const Text('Invia in cucina'),
          ),
        if (order.header.status == OrderStatus.held)
          FilledButton.icon(
            key: const Key('resume-order-button'),
            onPressed: controller.busy
                ? null
                : () async {
                    final resumed = await controller.resumeOrder(
                      order.header.id,
                    );
                    if (resumed && context.mounted) {
                      context.go('/home');
                    }
                  },
            icon: const Icon(Icons.play_arrow),
            label: const Text('Riprendi in cassa'),
          )
        else if (order.header.status == OrderStatus.open) ...[
          OutlinedButton.icon(
            key: const Key('open-order-in-register-button'),
            onPressed: controller.busy ? null : () => context.go('/home'),
            icon: const Icon(Icons.point_of_sale),
            label: const Text('Apri in cassa'),
          ),
          FilledButton.icon(
            key: const Key('checkout-selected-order-button'),
            onPressed: controller.busy || order.items.isEmpty
                ? null
                : () => context.push('/checkout/${order.header.id}'),
            icon: const Icon(Icons.payments_outlined),
            label: const Text('Incassa'),
          ),
        ] else if (order.header.status == OrderStatus.awaitingPayment)
          FilledButton.icon(
            key: const Key('continue-selected-checkout-button'),
            onPressed: controller.busy
                ? null
                : () => context.push('/checkout/${order.header.id}'),
            icon: const Icon(Icons.payments_outlined),
            label: const Text('Continua pagamento'),
          ),
      ],
    ),
  );
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final OrderStatus status;

  @override
  Widget build(BuildContext context) => Chip(label: Text(status.label));
}

class _TotalRow extends StatelessWidget {
  const _TotalRow({
    required this.label,
    required this.value,
    this.emphasized = false,
  });

  final String label;
  final String value;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final style = emphasized
        ? Theme.of(context).textTheme.titleLarge
        : Theme.of(context).textTheme.bodyLarge;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(value, style: style),
        ],
      ),
    );
  }
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
