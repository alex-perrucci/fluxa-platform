import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../orders/domain/order_models.dart';
import '../../orders/domain/uuid_v4.dart';
import '../domain/payment_models.dart';
import 'checkout_controller.dart';

Future<bool> showQuickPaymentSheet(
  BuildContext context, {
  required OrderDetail order,
  String? initialMethod,
}) async =>
    await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (context) => _QuickPaymentSheet(
        order: order,
        initialMethod: initialMethod,
      ),
    ) ??
    false;

class _QuickPaymentSheet extends ConsumerStatefulWidget {
  const _QuickPaymentSheet({required this.order, this.initialMethod});

  final OrderDetail order;
  final String? initialMethod;

  @override
  ConsumerState<_QuickPaymentSheet> createState() =>
      _QuickPaymentSheetState();
}

class _QuickPaymentSheetState extends ConsumerState<_QuickPaymentSheet> {
  bool _bootstrapped = false;
  bool _finishing = false;
  String? _requestedMethod;

  @override
  void initState() {
    super.initState();
    _requestedMethod = widget.initialMethod;
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    if (_bootstrapped || !mounted) {
      return;
    }
    _bootstrapped = true;
    final checkout = ref.read(checkoutControllerProvider);
    await checkout.bindLocation(widget.order.header.locationId);
    final opened = await checkout.openForOrder(widget.order);
    if (!mounted) {
      return;
    }
    setState(() {});
    if (!opened) {
      return;
    }
    await _runRequestedMethod();
  }

  Future<void> _runRequestedMethod() async {
    final method = _requestedMethod;
    if (method == null) {
      return;
    }
    _requestedMethod = null;
    if (method == 'cash') {
      await _payCash();
    } else if (method == 'card') {
      await _startCard();
    }
  }

  @override
  Widget build(BuildContext context) {
    final checkoutController = ref.watch(checkoutControllerProvider);
    final checkout = checkoutController.checkout;
    final pendingCard = _pendingCard(checkout);
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Pagamento',
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineSmall,
            ),
            const SizedBox(height: 6),
            Text(
              formatPaymentMoney(
                checkout?.remainingCents ?? widget.order.header.totalCents,
                checkout?.currency ?? widget.order.header.currency,
              ),
              textAlign: TextAlign.center,
              style: theme.textTheme.displaySmall?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 18),
            if (!_bootstrapped ||
                checkoutController.status == CheckoutLoadStatus.loading)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (checkout == null)
              _ErrorBox(
                text: checkoutController.errorMessage ??
                    'Impossibile preparare il pagamento.',
              )
            else if (_finishing)
              const Column(
                children: [
                  Icon(Icons.check_circle, size: 64),
                  SizedBox(height: 8),
                  Text('Fatto'),
                  SizedBox(height: 12),
                  LinearProgressIndicator(),
                ],
              )
            else if (pendingCard != null)
              _CardConfirmation(
                amount: formatPaymentMoney(
                  pendingCard.amountCents,
                  checkout.currency,
                ),
                busy: checkoutController.busy,
                onSuccess: () => _confirmCard(pendingCard),
                onFailure: () => _cancelCard(pendingCard),
              )
            else ...[
              Text(
                'Come paga?',
                textAlign: TextAlign.center,
                style: theme.textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: SizedBox(
                      height: 72,
                      child: FilledButton.icon(
                        key: const Key('quick-payment-cash'),
                        onPressed: checkoutController.busy ? null : _payCash,
                        icon: const Icon(Icons.payments_outlined),
                        label: const Text('CONTANTI'),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SizedBox(
                      height: 72,
                      child: FilledButton.icon(
                        key: const Key('quick-payment-card'),
                        onPressed: checkoutController.busy ? null : _startCard,
                        icon: const Icon(Icons.credit_card),
                        label: const Text('CARTA'),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              TextButton.icon(
                onPressed: checkoutController.busy
                    ? null
                    : () {
                        final router = GoRouter.of(context);
                        Navigator.pop(context, false);
                        router.push(
                          '/checkout-advanced/${widget.order.header.id}',
                        );
                      },
                icon: const Icon(Icons.tune),
                label: const Text('Resto, pagamento parziale o altro'),
              ),
            ],
            if (checkoutController.errorMessage != null && checkout != null) ...[
              const SizedBox(height: 10),
              _ErrorBox(text: checkoutController.errorMessage!),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _payCash() async {
    final controller = ref.read(checkoutControllerProvider);
    final checkout = controller.checkout;
    if (checkout == null || checkout.availableCents <= 0) {
      return;
    }
    final success = await controller.addCashPayment(
      amountCents: checkout.availableCents,
      tenderedCents: checkout.availableCents,
    );
    if (!success || !mounted) {
      return;
    }
    await _finishIfCompleted();
  }

  Future<void> _startCard() async {
    final controller = ref.read(checkoutControllerProvider);
    final checkout = controller.checkout;
    if (checkout == null || checkout.availableCents <= 0) {
      return;
    }
    await controller.addTerminalPayment(
      method: PaymentMethod.card,
      provider: PaymentProvider.manualTerminal,
      amountCents: checkout.availableCents,
    );
  }

  Future<void> _confirmCard(PaymentRecord payment) async {
    final controller = ref.read(checkoutControllerProvider);
    final success = await controller.capturePayment(
      payment: payment,
      providerReference: 'POS-MANUAL-${UuidV4.generate()}',
    );
    if (!success || !mounted) {
      return;
    }
    await _finishIfCompleted();
  }

  Future<void> _cancelCard(PaymentRecord payment) async {
    await ref.read(checkoutControllerProvider).cancelPayment(
      payment,
      reason: 'Pagamento non riuscito sul terminale',
    );
  }

  Future<void> _finishIfCompleted() async {
    final checkout = ref.read(checkoutControllerProvider).checkout;
    if (checkout?.isCompleted != true || !mounted) {
      return;
    }
    setState(() => _finishing = true);
    await ref.read(posWorkflowCoordinatorProvider).completePaidSale(
      locationId: widget.order.header.locationId,
      orderId: widget.order.header.id,
    );
    if (!mounted) {
      return;
    }
    Navigator.pop(context, true);
  }

  PaymentRecord? _pendingCard(CheckoutSession? checkout) {
    if (checkout == null) {
      return null;
    }
    for (final payment in checkout.payments.reversed) {
      if (payment.status == PaymentStatus.pending &&
          payment.method == PaymentMethod.card) {
        return payment;
      }
    }
    return null;
  }
}

class _CardConfirmation extends StatelessWidget {
  const _CardConfirmation({
    required this.amount,
    required this.busy,
    required this.onSuccess,
    required this.onFailure,
  });

  final String amount;
  final bool busy;
  final VoidCallback onSuccess;
  final VoidCallback onFailure;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Icon(Icons.credit_card, size: 52),
      const SizedBox(height: 8),
      Text(
        'Passa la carta sul POS bancario',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.headlineSmall,
      ),
      const SizedBox(height: 4),
      Text(
        amount,
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.titleLarge,
      ),
      const SizedBox(height: 18),
      SizedBox(
        height: 60,
        child: FilledButton.icon(
          key: const Key('quick-payment-card-success'),
          onPressed: busy ? null : onSuccess,
          icon: const Icon(Icons.check_circle_outline),
          label: const Text('PAGAMENTO RIUSCITO'),
        ),
      ),
      const SizedBox(height: 8),
      OutlinedButton.icon(
        onPressed: busy ? null : onFailure,
        icon: const Icon(Icons.close),
        label: const Text('Non è riuscito'),
      ),
    ],
  );
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).colorScheme.errorContainer,
    borderRadius: BorderRadius.circular(12),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Text(text, textAlign: TextAlign.center),
    ),
  );
}
