import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../domain/order_models.dart';

const _cancellationRoles = <String>{'OWNER', 'ADMIN', 'MANAGER'};

bool canQuickCancelOrder(OrderHeader order, String? role) =>
    _cancellationRoles.contains(role) &&
    (order.status == OrderStatus.open || order.status == OrderStatus.held);

class OrderCancellationRequest {
  const OrderCancellationRequest({this.reason});

  final String? reason;
}

Future<bool> confirmAndCancelOrder(
  BuildContext context,
  WidgetRef ref,
  OrderHeader order, {
  bool discardCurrentView = false,
}) async {
  final role = ref.read(authControllerProvider).state.session?.role;
  if (!canQuickCancelOrder(order, role)) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Questo ordine non può essere annullato da qui.'),
        ),
      );
    }
    return false;
  }

  final request = await showOrderCancellationDialog(
    context,
    orderNumber: order.number,
  );
  if (request == null || !context.mounted) {
    return false;
  }

  final orders = ref.read(orderControllerProvider);
  if (orders.activeOrder?.header.id != order.id) {
    final selected = await orders.selectOrder(order.id);
    if (!selected || !context.mounted) {
      _showCancellationError(context, orders.errorMessage);
      return false;
    }
  }

  final active = orders.activeOrder;
  if (active == null || !canQuickCancelOrder(active.header, role)) {
    if (context.mounted) {
      _showCancellationError(
        context,
        'Lo stato dell’ordine è cambiato. Aggiorna e riprova.',
      );
    }
    return false;
  }

  final cancelled = await orders.cancelActiveOrder(reason: request.reason);
  if (!cancelled || !context.mounted) {
    if (context.mounted) {
      _showCancellationError(context, orders.errorMessage);
    }
    return false;
  }

  final workflow = ref.read(posWorkflowCoordinatorProvider);
  await workflow.reconcileCancelledOrder(
    locationId: order.locationId,
    orderId: order.id,
    serviceMode: order.serviceMode,
  );

  if (discardCurrentView) {
    orders.discardCurrentView();
  } else {
    await orders.refreshOrders();
  }

  if (!context.mounted) {
    return true;
  }

  final message = workflow.needsAttention
      ? workflow.message ?? 'Ordine annullato. Controlla lo stato del tavolo.'
      : 'Ordine ${order.number} annullato.';
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  return true;
}

Future<OrderCancellationRequest?> showOrderCancellationDialog(
  BuildContext context, {
  required String orderNumber,
}) async {
  final reasonController = TextEditingController();
  try {
    return await showDialog<OrderCancellationRequest>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Annullare ordine $orderNumber?'),
        content: SizedBox(
          width: 460,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'L’ordine verrà chiuso come annullato. Questa azione non effettua né annulla pagamenti.',
              ),
              const SizedBox(height: 16),
              TextField(
                key: const Key('order-cancellation-reason'),
                controller: reasonController,
                maxLength: 255,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Motivo (facoltativo)',
                  hintText: 'Es. cliente ha cambiato idea',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('INDIETRO'),
          ),
          FilledButton.icon(
            key: const Key('confirm-order-cancellation'),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(dialogContext).colorScheme.error,
              foregroundColor: Theme.of(dialogContext).colorScheme.onError,
            ),
            onPressed: () {
              final normalized = reasonController.text.trim();
              Navigator.pop(
                dialogContext,
                OrderCancellationRequest(
                  reason: normalized.isEmpty ? null : normalized,
                ),
              );
            },
            icon: const Icon(Icons.delete_outline),
            label: const Text('ANNULLA ORDINE'),
          ),
        ],
      ),
    );
  } finally {
    reasonController.dispose();
  }
}

void _showCancellationError(BuildContext context, String? message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(content: Text(message ?? 'Impossibile annullare l’ordine.')),
  );
}
