import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../orders/domain/uuid_v4.dart';
import '../../orders/presentation/order_controller.dart';
import '../domain/payment_models.dart';
import 'checkout_controller.dart';

class FastCheckoutScreen extends ConsumerStatefulWidget {
  const FastCheckoutScreen({
    required this.orderId,
    this.quickMethod,
    super.key,
  });

  final String orderId;
  final String? quickMethod;

  @override
  ConsumerState<FastCheckoutScreen> createState() => _FastCheckoutScreenState();
}

class _FastCheckoutScreenState extends ConsumerState<FastCheckoutScreen> {
  String? _scheduledKey;
  bool _quickActionStarted = false;
  bool _finishingSale = false;

  @override
  Widget build(BuildContext context) {
    final authController = ref.watch(authControllerProvider);
    final orderController = ref.watch(orderControllerProvider);
    final checkoutController = ref.watch(checkoutControllerProvider);
    final location = authController.state.deviceAssignment?.location;
    final session = authController.state.session;

    if (location == null || session == null) {
      return const Scaffold(
        body: FluxaEmptyView(
          icon: Icons.storefront_outlined,
          title: 'Contesto operativo non disponibile',
          message: 'Completa il bootstrap del POS prima di incassare.',
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
        title: const Text('Pagamento'),
        leading: IconButton(
          tooltip: 'Torna in cassa',
          onPressed: _finishingSale ? null : () => context.go('/home'),
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: _FastCheckoutView(
        controller: checkoutController,
        orderController: orderController,
        orderId: widget.orderId,
        canRecordPayments: canRecordPayments,
        finishingSale: _finishingSale,
        onExactCash: () => _payExactCash(checkoutController, orderController),
        onStartCard: () => _startCard(checkoutController, orderController),
        onConfirmCard: (payment) =>
            _confirmCard(checkoutController, orderController, payment),
        onCancelPending: (payment) =>
            _cancelPending(checkoutController, payment),
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
      if (!mounted) {
        return;
      }
      setState(() {});
      await _runInitialQuickAction(checkoutController, orderController);
    });
  }

  Future<void> _runInitialQuickAction(
    CheckoutController checkoutController,
    OrderController orderController,
  ) async {
    if (_quickActionStarted || widget.quickMethod == null) {
      return;
    }
    _quickActionStarted = true;

    final checkout = checkoutController.checkout;
    if (checkout == null || !checkout.isOpen) {
      return;
    }

    if (widget.quickMethod == 'cash') {
      await _payExactCash(checkoutController, orderController);
      return;
    }
    if (widget.quickMethod == 'card') {
      final hasPendingCard = checkout.payments.any(
        (payment) =>
            payment.status == PaymentStatus.pending &&
            payment.method == PaymentMethod.card,
      );
      if (!hasPendingCard) {
        await _startCard(checkoutController, orderController);
      }
    }
  }

  Future<void> _payExactCash(
    CheckoutController checkoutController,
    OrderController orderController,
  ) async {
    final checkout = checkoutController.checkout;
    if (checkout == null || checkout.availableCents <= 0) {
      return;
    }
    final amount = checkout.availableCents;
    final success = await checkoutController.addCashPayment(
      amountCents: amount,
      tenderedCents: amount,
    );
    if (!success) {
      return;
    }
    await orderController.selectOrder(widget.orderId);
    await _finishIfCompleted(checkoutController, orderController);
  }

  Future<void> _startCard(
    CheckoutController checkoutController,
    OrderController orderController,
  ) async {
    final checkout = checkoutController.checkout;
    if (checkout == null || checkout.availableCents <= 0) {
      return;
    }
    final success = await checkoutController.addTerminalPayment(
      method: PaymentMethod.card,
      provider: PaymentProvider.manualTerminal,
      amountCents: checkout.availableCents,
    );
    if (success) {
      await orderController.selectOrder(widget.orderId);
    }
  }

  Future<void> _confirmCard(
    CheckoutController checkoutController,
    OrderController orderController,
    PaymentRecord payment,
  ) async {
    final success = await checkoutController.capturePayment(
      payment: payment,
      providerReference: 'POS-MANUAL-${UuidV4.generate()}',
    );
    if (!success) {
      return;
    }
    await orderController.selectOrder(widget.orderId);
    await _finishIfCompleted(checkoutController, orderController);
  }

  Future<void> _cancelPending(
    CheckoutController checkoutController,
    PaymentRecord payment,
  ) async {
    await checkoutController.cancelPayment(
      payment,
      reason: 'Pagamento annullato dal cassiere',
    );
  }

  Future<void> _finishIfCompleted(
    CheckoutController checkoutController,
    OrderController orderController,
  ) async {
    final checkout = checkoutController.checkout;
    if (checkout?.isCompleted != true || !mounted) {
      return;
    }
    setState(() => _finishingSale = true);
    await ref
        .read(posWorkflowCoordinatorProvider)
        .completePaidSale(
          locationId: checkout!.locationId,
          orderId: checkout.orderId,
        );
    if (!mounted) {
      return;
    }
    orderController.discardCurrentView();
    context.go('/home');
  }
}

class _FastCheckoutView extends StatelessWidget {
  const _FastCheckoutView({
    required this.controller,
    required this.orderController,
    required this.orderId,
    required this.canRecordPayments,
    required this.finishingSale,
    required this.onExactCash,
    required this.onStartCard,
    required this.onConfirmCard,
    required this.onCancelPending,
  });

  final CheckoutController controller;
  final OrderController orderController;
  final String orderId;
  final bool canRecordPayments;
  final bool finishingSale;
  final Future<void> Function() onExactCash;
  final Future<void> Function() onStartCard;
  final Future<void> Function(PaymentRecord payment) onConfirmCard;
  final Future<void> Function(PaymentRecord payment) onCancelPending;

  @override
  Widget build(BuildContext context) {
    final checkout = controller.checkout;
    if (controller.status == CheckoutLoadStatus.loading && checkout == null) {
      return const FluxaLoadingView(label: 'Preparazione incasso');
    }
    if (checkout == null) {
      return FluxaEmptyView(
        icon: Icons.point_of_sale_outlined,
        title: 'Incasso non disponibile',
        message: controller.errorMessage ?? 'Riprova dalla schermata Cassa.',
      );
    }

    PaymentRecord? pendingPayment;
    for (final payment in checkout.payments.reversed) {
      if (payment.status == PaymentStatus.pending) {
        pendingPayment = payment;
        break;
      }
    }

    final order = orderController.activeOrder;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 620),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    order?.header.number ?? orderId,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    formatPaymentMoney(
                      checkout.remainingCents,
                      checkout.currency,
                    ),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    checkout.isCompleted
                        ? 'Pagamento completato'
                        : 'Totale da incassare',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  if (controller.errorMessage != null) ...[
                    const SizedBox(height: 16),
                    _StatusMessage(
                      text: controller.errorMessage!,
                      error: true,
                      onClose: controller.clearMessages,
                    ),
                  ] else if (controller.noticeMessage != null) ...[
                    const SizedBox(height: 16),
                    _StatusMessage(
                      text: controller.noticeMessage!,
                      error: false,
                      onClose: controller.clearMessages,
                    ),
                  ],
                  const SizedBox(height: 24),
                  if (finishingSale)
                    const Column(
                      children: [
                        Icon(Icons.check_circle, size: 64),
                        SizedBox(height: 12),
                        Text('Vendita completata'),
                        SizedBox(height: 16),
                        LinearProgressIndicator(),
                      ],
                    )
                  else if (checkout.isCompleted) ...[
                    const Icon(Icons.check_circle, size: 64),
                    const SizedBox(height: 12),
                    Text(
                      'Fatto. Puoi iniziare subito la vendita successiva.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: () {
                        orderController.discardCurrentView();
                        context.go('/home');
                      },
                      icon: const Icon(Icons.add_shopping_cart),
                      label: const Text('NUOVA VENDITA'),
                    ),
                    TextButton(
                      onPressed: () =>
                          context.push('/checkout-advanced/$orderId'),
                      child: const Text('Dettagli / stampa / fiscale'),
                    ),
                  ] else if (!canRecordPayments)
                    const Text(
                      'Questo ruolo può consultare il pagamento ma non registrarlo.',
                      textAlign: TextAlign.center,
                    )
                  else if (pendingPayment != null) ...[
                    _CardConfirmationStep(
                      payment: pendingPayment,
                      currency: checkout.currency,
                      busy: controller.busy,
                      onConfirm: () => onConfirmCard(pendingPayment!),
                      onCancel: () => onCancelPending(pendingPayment!),
                    ),
                  ] else ...[
                    Text(
                      'Come paga il cliente?',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.icon(
                            key: const Key('fast-checkout-cash'),
                            onPressed:
                                controller.busy || checkout.availableCents <= 0
                                ? null
                                : onExactCash,
                            icon: const Icon(Icons.payments_outlined),
                            label: Text(
                              'CONTANTI\n${formatPaymentMoney(checkout.availableCents, checkout.currency)}',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: FilledButton.icon(
                            key: const Key('fast-checkout-card'),
                            onPressed:
                                controller.busy || checkout.availableCents <= 0
                                ? null
                                : onStartCard,
                            icon: const Icon(Icons.credit_card),
                            label: Text(
                              'CARTA\n${formatPaymentMoney(checkout.availableCents, checkout.currency)}',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: controller.busy
                          ? null
                          : () => context.push('/checkout-advanced/$orderId'),
                      icon: const Icon(Icons.tune),
                      label: const Text('Importo diverso / pagamento parziale'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CardConfirmationStep extends StatelessWidget {
  const _CardConfirmationStep({
    required this.payment,
    required this.currency,
    required this.busy,
    required this.onConfirm,
    required this.onCancel,
  });

  final PaymentRecord payment;
  final String currency;
  final bool busy;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Icon(Icons.credit_card, size: 52),
      const SizedBox(height: 12),
      Text(
        'La carta è stata approvata sul terminale?',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.headlineSmall,
      ),
      const SizedBox(height: 6),
      Text(
        formatPaymentMoney(payment.amountCents, currency),
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.titleLarge,
      ),
      const SizedBox(height: 20),
      FilledButton.icon(
        key: const Key('fast-checkout-confirm-card'),
        onPressed: busy ? null : onConfirm,
        icon: const Icon(Icons.check_circle_outline),
        label: const Text('SÌ, PAGAMENTO RIUSCITO'),
      ),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: busy ? null : onCancel,
        icon: const Icon(Icons.close),
        label: const Text('NO, NON È RIUSCITO'),
      ),
    ],
  );
}

class _StatusMessage extends StatelessWidget {
  const _StatusMessage({
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
