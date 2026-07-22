import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../orders/domain/order_models.dart';
import '../../orders/presentation/order_controller.dart';
import '../../printing/presentation/printing_controller.dart';
import '../domain/payment_models.dart';
import 'checkout_controller.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({required this.orderId, super.key});

  final String orderId;

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  String? _scheduledKey;

  @override
  Widget build(BuildContext context) {
    final authController = ref.watch(authControllerProvider);
    final orderController = ref.watch(orderControllerProvider);
    final checkoutController = ref.watch(checkoutControllerProvider);
    final printingController = ref.watch(printingControllerProvider);
    final location = authController.state.deviceAssignment?.location;
    final session = authController.state.session;

    if (location == null || session == null) {
      return const Scaffold(
        body: FluxaEmptyView(
          icon: Icons.storefront_outlined,
          title: 'Contesto operativo non disponibile',
          message: 'Completa il bootstrap del POS prima di aprire un checkout.',
        ),
      );
    }

    _scheduleBootstrap(
      checkoutController,
      orderController,
      location.id,
      widget.orderId,
    );

    final canRecordPayments = {
      'OWNER',
      'ADMIN',
      'MANAGER',
      'CASHIER',
    }.contains(session.role);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout'),
        leading: IconButton(
          tooltip: 'Torna agli ordini',
          onPressed: () => context.go('/orders'),
          icon: const Icon(Icons.arrow_back),
        ),
        actions: [
          IconButton(
            key: const Key('checkout-refresh-button'),
            tooltip: 'Aggiorna checkout',
            onPressed: checkoutController.busy
                ? null
                : () async {
                    await checkoutController.refresh();
                    await orderController.selectOrder(widget.orderId);
                  },
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: AnimatedBuilder(
        animation: Listenable.merge([checkoutController, orderController]),
        builder: (context, child) => CheckoutView(
          controller: checkoutController,
          orderController: orderController,
          orderId: widget.orderId,
          canRecordPayments: canRecordPayments,
          role: session.role,
          printingController: printingController,
        ),
      ),
    );
  }

  void _scheduleBootstrap(
    CheckoutController checkoutController,
    OrderController orderController,
    String locationId,
    String orderId,
  ) {
    final key = '$locationId:$orderId';
    if (_scheduledKey == key) {
      return;
    }
    _scheduledKey = key;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await checkoutController.bindLocation(locationId);
      if (orderController.locationId != locationId) {
        await orderController.bindLocation(locationId);
      }
      if (orderController.activeOrder?.header.id != orderId) {
        await orderController.selectOrder(orderId);
      }
      final order = orderController.activeOrder;
      if (order != null) {
        final opened = await checkoutController.openForOrder(order);
        if (opened) {
          await orderController.selectOrder(orderId);
        }
      }
      if (mounted) {
        setState(() {});
      }
    });
  }
}

class CheckoutView extends StatelessWidget {
  const CheckoutView({
    required this.controller,
    required this.orderController,
    required this.orderId,
    required this.canRecordPayments,
    required this.role,
    this.printingController,
    super.key,
  });

  final CheckoutController controller;
  final OrderController orderController;
  final String orderId;
  final bool canRecordPayments;
  final String? role;
  final PrintingController? printingController;

  @override
  Widget build(BuildContext context) {
    final checkout = controller.checkout;
    final order = orderController.activeOrder;

    if (controller.status == CheckoutLoadStatus.loading && checkout == null) {
      return const FluxaLoadingView(label: 'Apertura checkout');
    }

    if (checkout == null) {
      return _CheckoutUnavailable(
        message:
            controller.errorMessage ??
            'Il checkout non è ancora disponibile per questo ordine.',
        onRetry: () async {
          await orderController.selectOrder(orderId);
          final refreshedOrder = orderController.activeOrder;
          if (refreshedOrder != null) {
            await controller.openForOrder(refreshedOrder);
          }
        },
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final summary = _CheckoutSummary(
          checkout: checkout,
          order: order,
          controller: controller,
          canRecordPayments: canRecordPayments,
          role: role,
          onOrderRefresh: () => orderController.selectOrder(orderId),
          printingController: printingController,
        );
        final payments = _PaymentsList(
          checkout: checkout,
          controller: controller,
          canRecordPayments: canRecordPayments,
          onOrderRefresh: () => orderController.selectOrder(orderId),
        );
        if (constraints.maxWidth >= 980) {
          return Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(width: 390, child: summary),
                const SizedBox(width: 20),
                Expanded(child: payments),
              ],
            ),
          );
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            summary,
            const SizedBox(height: 16),
            SizedBox(height: 520, child: payments),
          ],
        );
      },
    );
  }
}

class _CheckoutSummary extends StatelessWidget {
  const _CheckoutSummary({
    required this.checkout,
    required this.order,
    required this.controller,
    required this.canRecordPayments,
    required this.role,
    required this.onOrderRefresh,
    this.printingController,
  });

  final CheckoutSession checkout;
  final OrderDetail? order;
  final CheckoutController controller;
  final bool canRecordPayments;
  final String? role;
  final Future<bool> Function() onOrderRefresh;
  final PrintingController? printingController;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Riepilogo', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(order?.header.number ?? checkout.orderId),
          const SizedBox(height: 16),
          _MoneyRow(
            label: 'Totale ordine',
            value: formatPaymentMoney(
              checkout.orderTotalCents,
              checkout.currency,
            ),
            emphasized: true,
          ),
          _MoneyRow(
            label: 'Acquisito',
            value: formatPaymentMoney(checkout.paidCents, checkout.currency),
          ),
          if (checkout.pendingCents > 0)
            _MoneyRow(
              label: 'In attesa terminale',
              value: formatPaymentMoney(
                checkout.pendingCents,
                checkout.currency,
              ),
            ),
          _MoneyRow(
            label: 'Residuo',
            value: formatPaymentMoney(
              checkout.remainingCents,
              checkout.currency,
            ),
            emphasized: checkout.isOpen,
          ),
          if (checkout.changeCents > 0)
            _MoneyRow(
              label: 'Resto',
              value: formatPaymentMoney(
                checkout.changeCents,
                checkout.currency,
              ),
            ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Text('Stato'),
              const SizedBox(width: 12),
              Chip(label: Text(checkout.status.label)),
            ],
          ),
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
          const SizedBox(height: 20),
          if (checkout.isCompleted) ...[
            if (printingController != null)
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  key: const Key('print-payment-receipt-button'),
                  onPressed: printingController!.busy
                      ? null
                      : () => printingController!.requestPaymentReceipt(
                          checkout.id,
                        ),
                  icon: const Icon(Icons.print_outlined),
                  label: const Text('Stampa riepilogo pagamento'),
                ),
              ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonalIcon(
                key: const Key('fiscalize-checkout-order-button'),
                onPressed: () => context.push('/fiscalize/${checkout.orderId}'),
                icon: const Icon(Icons.receipt_long_outlined),
                label: const Text('Fiscalizza con A-Cube'),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              key: const Key('checkout-completed-button'),
              onPressed: () async {
                await onOrderRefresh();
                if (context.mounted) {
                  context.go('/orders');
                }
              },
              icon: const Icon(Icons.check_circle_outline),
              label: const Text('Pagamento completato'),
            ),
          ] else if (!checkout.isOpen)
            FilledButton.tonalIcon(
              onPressed: () => context.go('/orders'),
              icon: const Icon(Icons.receipt_long_outlined),
              label: const Text('Torna agli ordini'),
            )
          else if (!canRecordPayments)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  'Il ruolo ${role ?? 'corrente'} può aprire il checkout, '
                  'ma non può registrare o finalizzare pagamenti.',
                ),
              ),
            )
          else ...[
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                key: const Key('checkout-cash-button'),
                onPressed: controller.busy || checkout.availableCents <= 0
                    ? null
                    : () async {
                        final values = await showCashPaymentDialog(
                          context,
                          checkout,
                        );
                        if (values == null) {
                          return;
                        }
                        final success = await controller.addCashPayment(
                          amountCents: values.amountCents,
                          tenderedCents: values.tenderedCents,
                        );
                        if (success) {
                          await onOrderRefresh();
                        }
                      },
                icon: const Icon(Icons.payments_outlined),
                label: const Text('Contanti'),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                key: const Key('checkout-terminal-button'),
                onPressed: controller.busy || checkout.availableCents <= 0
                    ? null
                    : () async {
                        final values = await showTerminalPaymentDialog(
                          context,
                          checkout,
                        );
                        if (values == null) {
                          return;
                        }
                        await controller.addTerminalPayment(
                          method: values.method,
                          provider: values.provider,
                          amountCents: values.amountCents,
                        );
                      },
                icon: const Icon(Icons.credit_card),
                label: const Text('Carta o altro'),
              ),
            ),
            if (checkout.canCancel) ...[
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: TextButton.icon(
                  key: const Key('cancel-checkout-button'),
                  onPressed: controller.busy
                      ? null
                      : () async {
                          final reason = await showCheckoutCancelDialog(
                            context,
                          );
                          if (reason == null) {
                            return;
                          }
                          final success = await controller.cancelCheckout(
                            reason,
                          );
                          if (success) {
                            await onOrderRefresh();
                          }
                        },
                  icon: const Icon(Icons.close),
                  label: const Text('Annulla checkout'),
                ),
              ),
            ],
          ],
        ],
      ),
    ),
  );
}

class _PaymentsList extends StatelessWidget {
  const _PaymentsList({
    required this.checkout,
    required this.controller,
    required this.canRecordPayments,
    required this.onOrderRefresh,
  });

  final CheckoutSession checkout;
  final CheckoutController controller;
  final bool canRecordPayments;
  final Future<bool> Function() onOrderRefresh;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Pagamenti',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ),
              Text('${checkout.payments.length} operazioni'),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(
            child: checkout.payments.isEmpty
                ? const FluxaEmptyView(
                    icon: Icons.account_balance_wallet_outlined,
                    title: 'Nessun pagamento',
                    message:
                        'Registra un pagamento in contanti o tramite terminale.',
                  )
                : ListView.separated(
                    key: const Key('checkout-payments-list'),
                    itemCount: checkout.payments.length,
                    separatorBuilder: (context, index) =>
                        const Divider(height: 1),
                    itemBuilder: (context, index) {
                      final payment = checkout.payments[index];
                      return _PaymentTile(
                        payment: payment,
                        currency: checkout.currency,
                        controller: controller,
                        canRecordPayments: canRecordPayments,
                        onOrderRefresh: onOrderRefresh,
                      );
                    },
                  ),
          ),
        ],
      ),
    ),
  );
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({
    required this.payment,
    required this.currency,
    required this.controller,
    required this.canRecordPayments,
    required this.onOrderRefresh,
  });

  final PaymentRecord payment;
  final String currency;
  final CheckoutController controller;
  final bool canRecordPayments;
  final Future<bool> Function() onOrderRefresh;

  @override
  Widget build(BuildContext context) {
    final subtitle = <String>[
      payment.provider.label,
      if (payment.providerReference != null) payment.providerReference!,
      if (payment.failureCode != null) payment.failureCode!,
    ].join(' · ');
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(
        payment.method == PaymentMethod.cash
            ? Icons.payments_outlined
            : Icons.credit_card,
      ),
      title: Text(
        '${payment.method.label} · '
        '${formatPaymentMoney(payment.amountCents, currency)}',
      ),
      subtitle: Text(subtitle),
      trailing:
          payment.status == PaymentStatus.pending &&
              canRecordPayments &&
              controller.checkout?.isOpen == true
          ? PopupMenuButton<String>(
              key: Key('pending-payment-actions-${payment.id}'),
              enabled: !controller.busy,
              onSelected: (action) async {
                if (action == 'capture') {
                  final values = await showCapturePaymentDialog(context);
                  if (values == null) {
                    return;
                  }
                  final success = await controller.capturePayment(
                    payment: payment,
                    providerReference: values.providerReference,
                    providerEventId: values.providerEventId,
                  );
                  if (success) {
                    await onOrderRefresh();
                  }
                } else if (action == 'fail') {
                  final values = await showFailPaymentDialog(context);
                  if (values == null) {
                    return;
                  }
                  await controller.failPayment(
                    payment: payment,
                    failureCode: values.failureCode,
                    failureMessage: values.failureMessage,
                    providerEventId: values.providerEventId,
                  );
                } else if (action == 'cancel') {
                  await controller.cancelPayment(
                    payment,
                    reason: 'Annullato dall’operatore POS',
                  );
                }
              },
              itemBuilder: (context) => const [
                PopupMenuItem(
                  value: 'capture',
                  child: Text('Conferma acquisizione'),
                ),
                PopupMenuItem(value: 'fail', child: Text('Segna come fallito')),
                PopupMenuItem(
                  value: 'cancel',
                  child: Text('Annulla pagamento'),
                ),
              ],
              child: Chip(label: Text(payment.status.label)),
            )
          : Chip(label: Text(payment.status.label)),
    );
  }
}

class _CheckoutUnavailable extends StatelessWidget {
  const _CheckoutUnavailable({required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 480),
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.point_of_sale_outlined, size: 56),
            const SizedBox(height: 16),
            Text(
              'Checkout non disponibile',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Riprova'),
            ),
            TextButton(
              onPressed: () => context.go('/orders'),
              child: const Text('Torna agli ordini'),
            ),
          ],
        ),
      ),
    ),
  );
}

class _MoneyRow extends StatelessWidget {
  const _MoneyRow({
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
      padding: const EdgeInsets.symmetric(vertical: 5),
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
      dense: true,
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

class CashPaymentInput {
  const CashPaymentInput({
    required this.amountCents,
    required this.tenderedCents,
  });

  final int amountCents;
  final int tenderedCents;
}

class TerminalPaymentInput {
  const TerminalPaymentInput({
    required this.method,
    required this.provider,
    required this.amountCents,
  });

  final PaymentMethod method;
  final PaymentProvider provider;
  final int amountCents;
}

class CapturePaymentInput {
  const CapturePaymentInput({
    required this.providerReference,
    required this.providerEventId,
  });

  final String providerReference;
  final String? providerEventId;
}

class FailPaymentInput {
  const FailPaymentInput({
    required this.failureCode,
    required this.failureMessage,
    required this.providerEventId,
  });

  final String failureCode;
  final String? failureMessage;
  final String? providerEventId;
}

Future<CashPaymentInput?> showCashPaymentDialog(
  BuildContext context,
  CheckoutSession checkout,
) async {
  final amountController = TextEditingController(
    text: moneyInputValue(checkout.availableCents),
  );
  final tenderedController = TextEditingController(
    text: moneyInputValue(checkout.availableCents),
  );
  String? validation;
  try {
    return await showDialog<CashPaymentInput>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Pagamento in contanti'),
          content: SizedBox(
            width: 420,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  key: const Key('cash-amount-field'),
                  controller: amountController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Importo applicato all’ordine',
                    prefixText: '€ ',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  key: const Key('cash-tendered-field'),
                  controller: tenderedController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Contante ricevuto',
                    prefixText: '€ ',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (validation != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    validation!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Annulla'),
            ),
            FilledButton(
              key: const Key('confirm-cash-payment-button'),
              onPressed: () {
                try {
                  final amount = parseMoneyInput(amountController.text);
                  final tendered = parseMoneyInput(tenderedController.text);
                  if (amount > checkout.availableCents) {
                    throw const FormatException(
                      'L’importo supera il residuo disponibile.',
                    );
                  }
                  if (tendered < amount) {
                    throw const FormatException(
                      'Il contante ricevuto è inferiore all’importo.',
                    );
                  }
                  Navigator.pop(
                    dialogContext,
                    CashPaymentInput(
                      amountCents: amount,
                      tenderedCents: tendered,
                    ),
                  );
                } on FormatException catch (error) {
                  setState(() => validation = error.message.toString());
                }
              },
              child: const Text('Registra'),
            ),
          ],
        ),
      ),
    );
  } finally {
    amountController.dispose();
    tenderedController.dispose();
  }
}

Future<TerminalPaymentInput?> showTerminalPaymentDialog(
  BuildContext context,
  CheckoutSession checkout,
) async {
  var method = PaymentMethod.card;
  var provider = PaymentProvider.manualTerminal;
  final amountController = TextEditingController(
    text: moneyInputValue(checkout.availableCents),
  );
  String? validation;
  try {
    return await showDialog<TerminalPaymentInput>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Pagamento tramite terminale'),
          content: SizedBox(
            width: 440,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<PaymentMethod>(
                  value: method,
                  decoration: const InputDecoration(
                    labelText: 'Metodo',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: PaymentMethod.card,
                      child: Text('Carta'),
                    ),
                    DropdownMenuItem(
                      value: PaymentMethod.other,
                      child: Text('Altro'),
                    ),
                  ],
                  onChanged: (value) {
                    if (value != null) {
                      setState(() => method = value);
                    }
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<PaymentProvider>(
                  value: provider,
                  decoration: const InputDecoration(
                    labelText: 'Provider',
                    border: OutlineInputBorder(),
                  ),
                  items: const [
                    DropdownMenuItem(
                      value: PaymentProvider.manualTerminal,
                      child: Text('Terminale manuale'),
                    ),
                    DropdownMenuItem(
                      value: PaymentProvider.externalTerminal,
                      child: Text('Terminale esterno'),
                    ),
                  ],
                  onChanged: (value) {
                    if (value != null) {
                      setState(() => provider = value);
                    }
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  key: const Key('terminal-amount-field'),
                  controller: amountController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Importo',
                    prefixText: '€ ',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (validation != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    validation!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Annulla'),
            ),
            FilledButton(
              key: const Key('confirm-terminal-payment-button'),
              onPressed: () {
                try {
                  final amount = parseMoneyInput(amountController.text);
                  if (amount > checkout.availableCents) {
                    throw const FormatException(
                      'L’importo supera il residuo disponibile.',
                    );
                  }
                  Navigator.pop(
                    dialogContext,
                    TerminalPaymentInput(
                      method: method,
                      provider: provider,
                      amountCents: amount,
                    ),
                  );
                } on FormatException catch (error) {
                  setState(() => validation = error.message.toString());
                }
              },
              child: const Text('Crea pagamento'),
            ),
          ],
        ),
      ),
    );
  } finally {
    amountController.dispose();
  }
}

Future<CapturePaymentInput?> showCapturePaymentDialog(
  BuildContext context,
) async {
  final referenceController = TextEditingController();
  final eventController = TextEditingController();
  String? validation;
  try {
    return await showDialog<CapturePaymentInput>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Conferma acquisizione'),
          content: SizedBox(
            width: 440,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  key: const Key('provider-reference-field'),
                  controller: referenceController,
                  maxLength: 200,
                  decoration: const InputDecoration(
                    labelText: 'Riferimento provider',
                    border: OutlineInputBorder(),
                  ),
                ),
                TextField(
                  controller: eventController,
                  maxLength: 200,
                  decoration: const InputDecoration(
                    labelText: 'ID evento provider (facoltativo)',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (validation != null)
                  Text(
                    validation!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Annulla'),
            ),
            FilledButton(
              onPressed: () {
                final reference = referenceController.text.trim();
                if (reference.isEmpty) {
                  setState(
                    () => validation = 'Inserisci il riferimento provider.',
                  );
                  return;
                }
                Navigator.pop(
                  dialogContext,
                  CapturePaymentInput(
                    providerReference: reference,
                    providerEventId: _optionalDialogValue(eventController.text),
                  ),
                );
              },
              child: const Text('Acquisisci'),
            ),
          ],
        ),
      ),
    );
  } finally {
    referenceController.dispose();
    eventController.dispose();
  }
}

Future<FailPaymentInput?> showFailPaymentDialog(BuildContext context) async {
  final codeController = TextEditingController();
  final messageController = TextEditingController();
  final eventController = TextEditingController();
  String? validation;
  try {
    return await showDialog<FailPaymentInput>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Pagamento fallito'),
          content: SizedBox(
            width: 440,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  key: const Key('payment-failure-code-field'),
                  controller: codeController,
                  maxLength: 80,
                  decoration: const InputDecoration(
                    labelText: 'Codice errore',
                    border: OutlineInputBorder(),
                  ),
                ),
                TextField(
                  controller: messageController,
                  maxLength: 500,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Messaggio (facoltativo)',
                    border: OutlineInputBorder(),
                  ),
                ),
                TextField(
                  controller: eventController,
                  maxLength: 200,
                  decoration: const InputDecoration(
                    labelText: 'ID evento provider (facoltativo)',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (validation != null)
                  Text(
                    validation!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Annulla'),
            ),
            FilledButton(
              onPressed: () {
                final code = codeController.text.trim();
                if (code.isEmpty) {
                  setState(() => validation = 'Inserisci il codice errore.');
                  return;
                }
                Navigator.pop(
                  dialogContext,
                  FailPaymentInput(
                    failureCode: code,
                    failureMessage: _optionalDialogValue(
                      messageController.text,
                    ),
                    providerEventId: _optionalDialogValue(eventController.text),
                  ),
                );
              },
              child: const Text('Conferma fallimento'),
            ),
          ],
        ),
      ),
    );
  } finally {
    codeController.dispose();
    messageController.dispose();
    eventController.dispose();
  }
}

Future<String?> showCheckoutCancelDialog(BuildContext context) async {
  final reasonController = TextEditingController();
  String? validation;
  try {
    return await showDialog<String>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Annulla checkout'),
          content: TextField(
            key: const Key('checkout-cancel-reason-field'),
            controller: reasonController,
            maxLength: 500,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: 'Motivo',
              errorText: validation,
              border: const OutlineInputBorder(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Indietro'),
            ),
            FilledButton(
              onPressed: () {
                final reason = reasonController.text.trim();
                if (reason.length < 3) {
                  setState(() => validation = 'Inserisci almeno 3 caratteri.');
                  return;
                }
                Navigator.pop(dialogContext, reason);
              },
              child: const Text('Annulla checkout'),
            ),
          ],
        ),
      ),
    );
  } finally {
    reasonController.dispose();
  }
}

String? _optionalDialogValue(String value) {
  final normalized = value.trim();
  return normalized.isEmpty ? null : normalized;
}
