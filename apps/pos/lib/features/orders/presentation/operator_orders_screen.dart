import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../fiscal/domain/fiscal_models.dart';
import '../../fiscal/presentation/fiscal_controller.dart';
import '../domain/order_models.dart';
import 'order_controller.dart';

enum _OrderBucket { active, completedToday }

class OperatorOrdersScreen extends ConsumerStatefulWidget {
  const OperatorOrdersScreen({super.key});

  @override
  ConsumerState<OperatorOrdersScreen> createState() =>
      _OperatorOrdersScreenState();
}

class _OperatorOrdersScreenState extends ConsumerState<OperatorOrdersScreen> {
  _OrderBucket _bucket = _OrderBucket.active;
  String? _scheduledLocationId;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).state;
    final orders = ref.watch(orderControllerProvider);
    final fiscal = ref.watch(fiscalControllerProvider);
    final location = auth.deviceAssignment?.location;

    if (location == null) {
      return const FluxaEmptyView(
        icon: Icons.receipt_long_outlined,
        title: 'Ordini non disponibili',
        message: 'Questa postazione non è ancora associata a una sede.',
      );
    }

    _scheduleLoad(location.id, orders, fiscal);
    if (orders.locationId != location.id) {
      return const FluxaLoadingView(label: 'Caricamento ordini');
    }

    final visible = _filteredOrders(orders.orders);
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
                      'Ordini',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const Text(
                      'Apri una vendita e Fluxa ti porta al prossimo passo.',
                    ),
                  ],
                ),
              ),
              TextButton.icon(
                onPressed: () => context.go('/orders/manage'),
                icon: const Icon(Icons.tune),
                label: const Text('Dettagli e filtri'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          SegmentedButton<_OrderBucket>(
            segments: const [
              ButtonSegment(
                value: _OrderBucket.active,
                icon: Icon(Icons.pending_actions),
                label: Text('DA COMPLETARE'),
              ),
              ButtonSegment(
                value: _OrderBucket.completedToday,
                icon: Icon(Icons.check_circle_outline),
                label: Text('CONCLUSI OGGI'),
              ),
            ],
            selected: {_bucket},
            onSelectionChanged: (values) =>
                setState(() => _bucket = values.first),
          ),
          if (orders.errorMessage != null) ...[
            const SizedBox(height: 10),
            Material(
              color: Theme.of(context).colorScheme.errorContainer,
              borderRadius: BorderRadius.circular(12),
              child: ListTile(
                title: Text(orders.errorMessage!),
                trailing: IconButton(
                  onPressed: orders.clearMessages,
                  icon: const Icon(Icons.close),
                ),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Expanded(
            child:
                orders.listStatus == OrdersLoadStatus.loading &&
                    orders.orders.isEmpty
                ? const FluxaLoadingView(label: 'Aggiornamento ordini')
                : visible.isEmpty
                ? FluxaEmptyView(
                    icon: _bucket == _OrderBucket.active
                        ? Icons.task_alt
                        : Icons.history,
                    title: _bucket == _OrderBucket.active
                        ? 'Niente da completare'
                        : 'Nessuna vendita conclusa oggi',
                    message: _bucket == _OrderBucket.active
                        ? 'Tutto a posto.'
                        : 'Le vendite concluse oggi compariranno qui.',
                  )
                : ListView.separated(
                    itemCount: visible.length,
                    separatorBuilder: (context, index) =>
                        const SizedBox(height: 8),
                    itemBuilder: (context, index) => _OrderCard(
                      order: visible[index],
                      fiscal: fiscal,
                      onTap: () => _openOrder(
                        context,
                        visible[index],
                        orders,
                        fiscal,
                        location.id,
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  void _scheduleLoad(
    String locationId,
    OrderController orders,
    FiscalController fiscal,
  ) {
    if (_scheduledLocationId == locationId &&
        orders.locationId == locationId &&
        orders.statusFilter == null) {
      return;
    }
    _scheduledLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (orders.locationId == locationId) {
        await orders.setStatusFilter(null);
        await orders.refreshOperationalState();
      } else {
        await orders.bindLocation(locationId);
      }
      if (fiscal.locationId == locationId) {
        await fiscal.refresh(silent: true);
      } else {
        await fiscal.bindLocation(locationId);
      }
      if (mounted) setState(() {});
    });
  }

  List<OrderHeader> _filteredOrders(List<OrderHeader> orders) {
    if (_bucket == _OrderBucket.active) {
      return orders
          .where(
            (order) =>
                order.status == OrderStatus.open ||
                order.status == OrderStatus.held ||
                order.status == OrderStatus.awaitingPayment,
          )
          .toList(growable: false);
    }

    final now = DateTime.now();
    final today =
        '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    return orders
        .where(
          (order) =>
              order.businessDate == today &&
              (order.status == OrderStatus.paid ||
                  order.status == OrderStatus.cancelled),
        )
        .toList(growable: false);
  }

  Future<void> _openOrder(
    BuildContext context,
    OrderHeader order,
    OrderController orders,
    FiscalController fiscal,
    String locationId,
  ) async {
    if (order.status == OrderStatus.held) {
      final resumed = await orders.resumeOrder(order.id);
      if (resumed && context.mounted) context.go('/home');
      return;
    }

    final selected = await orders.selectOrder(order.id);
    if (!selected || !context.mounted) return;

    if (order.status == OrderStatus.open) {
      context.go('/home');
      return;
    }
    if (order.status == OrderStatus.awaitingPayment) {
      context.push('/checkout/${order.id}');
      return;
    }
    if (order.status == OrderStatus.paid) {
      await _showPaidOrder(context, order, fiscal, locationId);
      return;
    }

    context.go('/orders/manage');
  }

  Future<void> _showPaidOrder(
    BuildContext context,
    OrderHeader order,
    FiscalController fiscal,
    String locationId,
  ) async {
    if (fiscal.locationId == locationId) {
      await fiscal.refresh(silent: true);
    } else {
      await fiscal.bindLocation(locationId);
    }
    if (!context.mounted) return;

    final document = fiscal.documentForOrder(order.id);
    await showModalBottomSheet<void>(
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
                order.number,
                style: Theme.of(sheetContext).textTheme.headlineSmall,
              ),
              Text(formatOrderMoney(order.totalCents, order.currency)),
              const SizedBox(height: 16),
              _FiscalResult(document: document),
              const SizedBox(height: 16),
              if (document == null)
                FilledButton.icon(
                  onPressed: () async {
                    await ref
                        .read(posWorkflowCoordinatorProvider)
                        .recoverFiscalDocument(
                          locationId: locationId,
                          orderId: order.id,
                        );
                    if (sheetContext.mounted) Navigator.pop(sheetContext);
                  },
                  icon: const Icon(Icons.receipt_long_outlined),
                  label: const Text('RECUPERA SCONTRINO'),
                )
              else
                FilledButton.tonalIcon(
                  onPressed: () {
                    Navigator.pop(sheetContext);
                    context.go('/fiscal');
                  },
                  icon: const Icon(Icons.receipt_long_outlined),
                  label: const Text('APRI SCONTRINO FISCALE'),
                ),
              TextButton.icon(
                onPressed: () {
                  Navigator.pop(sheetContext);
                  context.go('/orders/manage');
                },
                icon: const Icon(Icons.tune),
                label: const Text('Dettaglio completo ordine'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({
    required this.order,
    required this.fiscal,
    required this.onTap,
  });

  final OrderHeader order;
  final FiscalController fiscal;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final action = switch (order.status) {
      OrderStatus.open => 'Continua vendita',
      OrderStatus.held => 'Riprendi vendita',
      OrderStatus.awaitingPayment => 'Continua pagamento',
      OrderStatus.paid => _paidLabel(fiscal.documentForOrder(order.id)),
      OrderStatus.cancelled => 'Annullato',
    };
    return Card(
      clipBehavior: Clip.antiAlias,
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        title: Text(
          order.number,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        subtitle: Text('${order.serviceMode.label} · $action'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              formatOrderMoney(order.totalCents, order.currency),
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(width: 6),
            const Icon(Icons.chevron_right),
          ],
        ),
        onTap: onTap,
      ),
    );
  }

  String _paidLabel(FiscalDocument? document) {
    if (document == null) return 'Scontrino da verificare';
    return switch (document.status) {
      FiscalDocumentStatus.issued => 'Scontrino emesso',
      FiscalDocumentStatus.queued ||
      FiscalDocumentStatus.processing ||
      FiscalDocumentStatus.retry => 'Scontrino in elaborazione',
      _ => 'Scontrino da controllare',
    };
  }
}

class _FiscalResult extends StatelessWidget {
  const _FiscalResult({required this.document});

  final FiscalDocument? document;

  @override
  Widget build(BuildContext context) {
    final icon = document == null
        ? Icons.warning_amber
        : document!.status == FiscalDocumentStatus.issued
        ? Icons.verified_outlined
        : document!.status.isPending
        ? Icons.hourglass_top
        : Icons.error_outline;
    final text = document == null
        ? 'Pagamento completato · scontrino da recuperare'
        : document!.status == FiscalDocumentStatus.issued
        ? 'Pagamento completato · scontrino fiscale emesso'
        : document!.status.isPending
        ? 'Pagamento completato · scontrino in elaborazione'
        : 'Pagamento completato · controlla lo scontrino fiscale';
    return Material(
      color: Theme.of(context).colorScheme.secondaryContainer,
      borderRadius: BorderRadius.circular(12),
      child: ListTile(leading: Icon(icon), title: Text(text)),
    );
  }
}
