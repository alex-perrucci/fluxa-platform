import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/network/backend_error.dart';
import '../../../core/widgets/async_states.dart';
import '../../orders/domain/order_models.dart';
import '../../orders/domain/uuid_v4.dart';
import '../../orders/presentation/order_controller.dart';
import '../../printing/data/printing_api.dart';
import '../../printing/domain/payment_receipt_print_options.dart';
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
    final printingApi = ref.watch(printingApiProvider);
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
      body: CheckoutView(
        controller: checkoutController,
        orderController: orderController,
        orderId: widget.orderId,
        canRecordPayments: canRecordPayments,
        role: session.role,
        printingController: printingController,
        printerSelectionGateway: printingApi,
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
    if (_scheduledKey == key) return;
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
        if (opened) await orderController.selectOrder(orderId);
      }
      if (mounted) setState(() {});
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
    this.printerSelectionGateway,
    super.key,
  });

  final CheckoutController controller;
  final OrderController orderController;
  final String orderId;
  final bool canRecordPayments;
  final String? role;
  final PrintingController? printingController;
  final PaymentReceiptPrinterSelectionGateway? printerSelectionGateway;

  @override
  Widget build(BuildContext context) {
    final checkout = controller.checkout;
    final order = orderController.activeOrder;

    if (controller.status == CheckoutLoadStatus.loading && checkout == null) {
      return const FluxaLoadingView(label: 'Apertura checkout');
    }
    if (checkout == null) {
      return FluxaEmptyView(
        icon: Icons.point_of_sale_outlined,
        title: 'Checkout non disponibile',
        message:
            controller.errorMessage ??
            'Il checkout non è ancora disponibile per questo ordine.',
      );
    }

    final summary = _CheckoutSummary(
      checkout: checkout,
      order: order,
      controller: controller,
      canRecordPayments: canRecordPayments,
      role: role,
      printingController: printingController,
      printerSelectionGateway: printerSelectionGateway,
      onOrderRefresh: () => orderController.selectOrder(orderId),
      onStartNewOrder: () {
        orderController.discardCurrentView();
        context.go('/home');
      },
    );
    final payments = _PaymentsList(
      checkout: checkout,
      controller: controller,
      canRecordPayments: canRecordPayments,
      onOrderRefresh: () => orderController.selectOrder(orderId),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
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
          children: [summary, const SizedBox(height: 16), payments],
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
    required this.onStartNewOrder,
    this.printingController,
    this.printerSelectionGateway,
  });

  final CheckoutSession checkout;
  final OrderDetail? order;
  final CheckoutController controller;
  final bool canRecordPayments;
  final String? role;
  final Future<bool> Function() onOrderRefresh;
  final VoidCallback onStartNewOrder;
  final PrintingController? printingController;
  final PaymentReceiptPrinterSelectionGateway? printerSelectionGateway;

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
          Chip(label: Text(checkout.status.label)),
          if (controller.errorMessage != null)
            _MessageCard(
              message: controller.errorMessage!,
              error: true,
              onDismiss: controller.clearMessages,
            )
          else if (controller.noticeMessage != null)
            _MessageCard(
              message: controller.noticeMessage!,
              error: false,
              onDismiss: controller.clearMessages,
            ),
          const SizedBox(height: 20),
          if (checkout.isCompleted) ...[
            if (printingController != null)
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  key: const Key('print-payment-receipt-button'),
                  onPressed: printingController!.busy
                      ? null
                      : () => _printReceipt(context),
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
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                key: const Key('checkout-completed-button'),
                onPressed: onStartNewOrder,
                icon: const Icon(Icons.add_shopping_cart),
                label: const Text('Nuovo ordine'),
              ),
            ),
          ] else if (!checkout.isOpen)
            FilledButton.tonalIcon(
              onPressed: () => context.go('/orders'),
              icon: const Icon(Icons.receipt_long_outlined),
              label: const Text('Torna agli ordini'),
            )
          else if (!canRecordPayments)
            Text(
              'Il ruolo ${role ?? 'corrente'} può consultare il checkout, ma non registrare pagamenti.',
            )
          else ...[
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                key: const Key('checkout-cash-button'),
                onPressed: controller.busy || checkout.availableCents <= 0
                    ? null
                    : () => _cash(context),
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
                    : () => _terminal(context),
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
                  onPressed: controller.busy ? null : () => _cancel(context),
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

  Future<void> _printReceipt(BuildContext context) async {
    final gateway = printerSelectionGateway;
    if (gateway == null) {
      await printingController!.requestPaymentReceipt(checkout.id);
      return;
    }
    try {
      final options = await gateway.paymentReceiptOptions(checkout.id);
      if (!context.mounted) return;
      final choice = await _showPrinterDialog(context, options);
      if (choice == null) return;
      final success = choice == _defaultRouteChoice
          ? await printingController!.requestPaymentReceipt(checkout.id)
          : (await gateway.requestPaymentReceiptToPrinter(
              checkoutId: checkout.id,
              clientRequestId: UuidV4.generate(),
              printerId: choice,
            )).jobs.isNotEmpty;
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              success
                  ? 'Riepilogo pagamento accodato.'
                  : 'Nessun lavoro di stampa creato.',
            ),
          ),
        );
      }
    } on BackendError catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _cash(BuildContext context) async {
    final values = await _showCashDialog(context, checkout);
    if (values == null) return;
    final success = await controller.addCashPayment(
      amountCents: values.$1,
      tenderedCents: values.$2,
    );
    if (success) await onOrderRefresh();
  }

  Future<void> _terminal(BuildContext context) async {
    final values = await _showTerminalDialog(context, checkout);
    if (values == null) return;
    await controller.addTerminalPayment(
      method: values.$1,
      provider: values.$2,
      amountCents: values.$3,
    );
  }

  Future<void> _cancel(BuildContext context) async {
    final reason = await _showTextDialog(
      context,
      title: 'Annulla checkout',
      label: 'Motivo',
    );
    if (reason == null || reason.trim().length < 2) return;
    final success = await controller.cancelCheckout(reason);
    if (success) await onOrderRefresh();
  }
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
          Text('Pagamenti', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          if (checkout.payments.isEmpty)
            const Text('Nessun pagamento registrato.')
          else
            for (final payment in checkout.payments)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  payment.method == PaymentMethod.cash
                      ? Icons.payments_outlined
                      : Icons.credit_card,
                ),
                title: Text(
                  '${payment.method.label} · ${formatPaymentMoney(payment.amountCents, checkout.currency)}',
                ),
                subtitle: Text(
                  '${payment.provider.label} · ${payment.status.label}',
                ),
                trailing:
                    canRecordPayments && payment.status == PaymentStatus.pending
                    ? PopupMenuButton<String>(
                        onSelected: (action) =>
                            _handlePaymentAction(context, payment, action),
                        itemBuilder: (_) => const [
                          PopupMenuItem(
                            value: 'capture',
                            child: Text('Acquisisci'),
                          ),
                          PopupMenuItem(
                            value: 'cancel',
                            child: Text('Annulla'),
                          ),
                        ],
                      )
                    : null,
              ),
        ],
      ),
    ),
  );

  Future<void> _handlePaymentAction(
    BuildContext context,
    PaymentRecord payment,
    String action,
  ) async {
    if (action == 'capture') {
      final reference = await _showTextDialog(
        context,
        title: 'Acquisisci pagamento',
        label: 'Riferimento provider',
      );
      if (reference == null || reference.trim().isEmpty) return;
      final success = await controller.capturePayment(
        payment: payment,
        providerReference: reference,
      );
      if (success) await onOrderRefresh();
    } else {
      final success = await controller.cancelPayment(
        payment,
        reason: 'Annullato dal POS',
      );
      if (success) await onOrderRefresh();
    }
  }
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
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      children: [
        Expanded(child: Text(label)),
        Text(
          value,
          style: emphasized ? Theme.of(context).textTheme.titleMedium : null,
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
      trailing: IconButton(onPressed: onDismiss, icon: const Icon(Icons.close)),
    ),
  );
}

const _defaultRouteChoice = '__DEFAULT_ROUTE__';

Future<String?> _showPrinterDialog(
  BuildContext context,
  PaymentReceiptPrintOptions options,
) async {
  if (options.printers.isEmpty && !options.defaultRouteConfigured) {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Nessuna stampante disponibile'),
        content: const Text(
          'Assegna una stampante attiva a questo POS oppure configura una rotta PAYMENT_RECEIPT.',
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Chiudi'),
          ),
        ],
      ),
    );
    return null;
  }

  var selected = options.printers.isNotEmpty
      ? options.printers.first.id
      : _defaultRouteChoice;
  return showDialog<String>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: const Text('Scegli stampante'),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (options.defaultRouteConfigured)
                  RadioListTile<String>(
                    value: _defaultRouteChoice,
                    groupValue: selected,
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => selected = value);
                      }
                    },
                    title: const Text('Rotta predefinita'),
                    subtitle: const Text(
                      'Usa la configurazione amministrativa',
                    ),
                  ),
                for (final printer in options.printers)
                  RadioListTile<String>(
                    value: printer.id,
                    groupValue: selected,
                    onChanged: (value) {
                      if (value != null) {
                        setState(() => selected = value);
                      }
                    },
                    title: Text(printer.name),
                    subtitle: Text('${printer.code} · ${printer.purpose}'),
                  ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, selected),
            child: const Text('Stampa'),
          ),
        ],
      ),
    ),
  );
}

Future<(int, int)?> _showCashDialog(
  BuildContext context,
  CheckoutSession checkout,
) {
  return showDialog<(int, int)>(
    context: context,
    builder: (context) {
      var amount = moneyInputValue(checkout.availableCents);
      var tendered = moneyInputValue(checkout.availableCents);

      return AlertDialog(
        title: const Text('Pagamento in contanti'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              initialValue: amount,
              onChanged: (value) => amount = value,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Importo (€)',
                prefixText: '€ ',
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              initialValue: tendered,
              onChanged: (value) => tendered = value,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Ricevuto (€)',
                prefixText: '€ ',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () {
              try {
                final parsedAmount = parseMoneyInput(amount);
                final parsedTendered = parseMoneyInput(tendered);
                Navigator.pop(context, (parsedAmount, parsedTendered));
              } on FormatException {
                // Il dialogo rimane aperto finché entrambi gli importi non sono validi.
              }
            },
            child: const Text('Registra'),
          ),
        ],
      );
    },
  );
}

Future<(PaymentMethod, PaymentProvider, int)?> _showTerminalDialog(
  BuildContext context,
  CheckoutSession checkout,
) {
  return showDialog<(PaymentMethod, PaymentProvider, int)>(
    context: context,
    builder: (context) {
      var method = PaymentMethod.card;
      var provider = PaymentProvider.manualTerminal;
      var amount = moneyInputValue(checkout.availableCents);

      return StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Carta o altro'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<PaymentMethod>(
                value: method,
                items: const [PaymentMethod.card, PaymentMethod.other]
                    .map(
                      (value) => DropdownMenuItem(
                        value: value,
                        child: Text(value.label),
                      ),
                    )
                    .toList(growable: false),
                onChanged: (value) {
                  if (value != null) setState(() => method = value);
                },
                decoration: const InputDecoration(labelText: 'Metodo'),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<PaymentProvider>(
                value: provider,
                items:
                    const [
                          PaymentProvider.manualTerminal,
                          PaymentProvider.externalTerminal,
                        ]
                        .map(
                          (value) => DropdownMenuItem(
                            value: value,
                            child: Text(value.label),
                          ),
                        )
                        .toList(growable: false),
                onChanged: (value) {
                  if (value != null) setState(() => provider = value);
                },
                decoration: const InputDecoration(labelText: 'Provider'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                initialValue: amount,
                onChanged: (value) => amount = value,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Importo (€)',
                  prefixText: '€ ',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Annulla'),
            ),
            FilledButton(
              onPressed: () {
                try {
                  final parsed = parseMoneyInput(amount);
                  Navigator.pop(context, (method, provider, parsed));
                } on FormatException {
                  // Il dialogo rimane aperto finché l'importo non è valido.
                }
              },
              child: const Text('Registra'),
            ),
          ],
        ),
      );
    },
  );
}

Future<String?> _showTextDialog(
  BuildContext context, {
  required String title,
  required String label,
}) {
  return showDialog<String>(
    context: context,
    builder: (context) {
      var value = '';

      return AlertDialog(
        title: Text(title),
        content: TextFormField(
          onChanged: (nextValue) => value = nextValue,
          decoration: InputDecoration(labelText: label),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, value),
            child: const Text('Conferma'),
          ),
        ],
      );
    },
  );
}
