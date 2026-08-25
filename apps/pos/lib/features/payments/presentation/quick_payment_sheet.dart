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
      builder: (context) =>
          _QuickPaymentSheet(order: order, initialMethod: initialMethod),
    ) ??
    false;

class _QuickPaymentSheet extends ConsumerStatefulWidget {
  const _QuickPaymentSheet({required this.order, this.initialMethod});

  final OrderDetail order;
  final String? initialMethod;

  @override
  ConsumerState<_QuickPaymentSheet> createState() => _QuickPaymentSheetState();
}

class _QuickPaymentSheetState extends ConsumerState<_QuickPaymentSheet> {
  bool _bootstrapped = false;
  bool _finishing = false;
  bool _cashMode = false;
  bool _cardBusy = false;
  String? _requestedMethod;

  @override
  void initState() {
    super.initState();
    _requestedMethod = widget.initialMethod;
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    if (_bootstrapped || !mounted) return;
    _bootstrapped = true;
    final controller = ref.read(checkoutControllerProvider);
    await controller.bindLocation(widget.order.header.locationId);
    final opened = await controller.openForOrder(widget.order);
    if (!mounted) return;
    setState(() {});
    if (!opened) return;
    final method = _requestedMethod;
    _requestedMethod = null;
    if (method == 'cash') {
      setState(() => _cashMode = true);
    } else if (method == 'card') {
      await _startCard();
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = ref.watch(checkoutControllerProvider);
    final checkout = controller.checkout;
    final pendingCard = _pendingCard(checkout);
    final busy = controller.busy || _cardBusy;
    final theme = Theme.of(context);

    Widget body;
    if (!_bootstrapped || controller.status == CheckoutLoadStatus.loading) {
      body = const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      );
    } else if (checkout == null) {
      body = _MessageBox(
        text: controller.errorMessage ?? 'Impossibile preparare il pagamento.',
        error: true,
      );
    } else if (_finishing) {
      body = const Column(
        children: [
          Icon(Icons.check_circle, size: 64),
          SizedBox(height: 8),
          Text('Fatto'),
          SizedBox(height: 12),
          LinearProgressIndicator(),
        ],
      );
    } else if (pendingCard?.provider == PaymentProvider.externalTerminal) {
      body = _ExternalTerminalPending(
        amount: formatPaymentMoney(pendingCard!.amountCents, checkout.currency),
        busy: busy,
        onVerify: () => _verifyExternalCard(pendingCard),
      );
    } else if (pendingCard != null) {
      body = _ManualCardConfirmation(
        amount: formatPaymentMoney(pendingCard.amountCents, checkout.currency),
        busy: busy,
        onSuccess: () => _confirmManualCard(pendingCard),
        onFailure: () => _cancelManualCard(pendingCard),
      );
    } else if (_cashMode) {
      body = _CashTenderStep(
        dueCents: checkout.availableCents,
        currency: checkout.currency,
        busy: busy,
        onTendered: _payCash,
        onOther: () => _askCashTendered(checkout),
        onBack: () => setState(() => _cashMode = false),
      );
    } else {
      body = _PaymentMethodStep(
        busy: busy,
        onCash: () => setState(() => _cashMode = true),
        onCard: _startCard,
        onAdvanced: () {
          final router = GoRouter.of(context);
          Navigator.pop(context, false);
          router.push('/checkout-advanced/${widget.order.header.id}');
        },
      );
    }

    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        0,
        20,
        24 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 620),
        child: SingleChildScrollView(
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
              body,
              if (controller.noticeMessage != null && checkout != null) ...[
                const SizedBox(height: 10),
                _MessageBox(text: controller.noticeMessage!, error: false),
              ],
              if (controller.errorMessage != null && checkout != null) ...[
                const SizedBox(height: 10),
                _MessageBox(text: controller.errorMessage!, error: true),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _payCash(int tenderedCents) async {
    final controller = ref.read(checkoutControllerProvider);
    final checkout = controller.checkout;
    if (checkout == null ||
        checkout.availableCents <= 0 ||
        tenderedCents < checkout.availableCents) {
      return;
    }
    final success = await controller.addCashPayment(
      amountCents: checkout.availableCents,
      tenderedCents: tenderedCents,
    );
    if (success && mounted) await _finishIfCompleted();
  }

  Future<void> _askCashTendered(CheckoutSession checkout) async {
    final tendered = await _showTenderedDialog(
      context,
      dueCents: checkout.availableCents,
      currency: checkout.currency,
    );
    if (tendered != null && mounted) await _payCash(tendered);
  }

  Future<void> _startCard() async {
    final controller = ref.read(checkoutControllerProvider);
    final checkout = controller.checkout;
    if (checkout == null || checkout.availableCents <= 0 || _cardBusy) return;
    setState(() => _cardBusy = true);
    try {
      final outcome = await controller.startCardPayment(
        amountCents: checkout.availableCents,
      );
      if (mounted && outcome == CardPaymentFlowOutcome.approved) {
        await _finishIfCompleted();
      }
    } finally {
      if (mounted) setState(() => _cardBusy = false);
    }
  }

  Future<void> _verifyExternalCard(PaymentRecord payment) async {
    if (_cardBusy) return;
    setState(() => _cardBusy = true);
    try {
      final outcome = await ref
          .read(checkoutControllerProvider)
          .verifyExternalTerminalPayment(payment);
      if (mounted && outcome == CardPaymentFlowOutcome.approved) {
        await _finishIfCompleted();
      }
    } finally {
      if (mounted) setState(() => _cardBusy = false);
    }
  }

  Future<void> _confirmManualCard(PaymentRecord payment) async {
    final success = await ref
        .read(checkoutControllerProvider)
        .capturePayment(
          payment: payment,
          providerReference: 'POS-MANUAL-${UuidV4.generate()}',
        );
    if (success && mounted) await _finishIfCompleted();
  }

  Future<void> _cancelManualCard(PaymentRecord payment) async {
    await ref
        .read(checkoutControllerProvider)
        .cancelPayment(payment, reason: 'Pagamento non riuscito sul terminale');
  }

  Future<void> _finishIfCompleted() async {
    final checkout = ref.read(checkoutControllerProvider).checkout;
    if (checkout?.isCompleted != true || !mounted) return;
    setState(() => _finishing = true);
    await ref
        .read(posWorkflowCoordinatorProvider)
        .completePaidSale(
          locationId: widget.order.header.locationId,
          orderId: widget.order.header.id,
        );
    if (mounted) Navigator.pop(context, true);
  }

  PaymentRecord? _pendingCard(CheckoutSession? checkout) {
    if (checkout == null) return null;
    for (final payment in checkout.payments.reversed) {
      if (payment.status == PaymentStatus.pending &&
          payment.method == PaymentMethod.card) {
        return payment;
      }
    }
    return null;
  }
}

class _PaymentMethodStep extends StatelessWidget {
  const _PaymentMethodStep({
    required this.busy,
    required this.onCash,
    required this.onCard,
    required this.onAdvanced,
  });

  final bool busy;
  final VoidCallback onCash;
  final VoidCallback onCard;
  final VoidCallback onAdvanced;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Text('Come paga?', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 12),
      Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 72,
              child: FilledButton.icon(
                key: const Key('quick-payment-cash'),
                onPressed: busy ? null : onCash,
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
                onPressed: busy ? null : onCard,
                icon: const Icon(Icons.credit_card),
                label: const Text('CARTA'),
              ),
            ),
          ),
        ],
      ),
      const SizedBox(height: 10),
      TextButton.icon(
        onPressed: busy ? null : onAdvanced,
        icon: const Icon(Icons.tune),
        label: const Text('Pagamento parziale o altro'),
      ),
    ],
  );
}

class _CashTenderStep extends StatelessWidget {
  const _CashTenderStep({
    required this.dueCents,
    required this.currency,
    required this.busy,
    required this.onTendered,
    required this.onOther,
    required this.onBack,
  });

  final int dueCents;
  final String currency;
  final bool busy;
  final ValueChanged<int> onTendered;
  final VoidCallback onOther;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        'Quanto ricevi?',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.headlineSmall,
      ),
      const SizedBox(height: 14),
      SizedBox(
        height: 64,
        child: FilledButton.icon(
          key: const Key('quick-cash-exact'),
          onPressed: busy ? null : () => onTendered(dueCents),
          icon: const Icon(Icons.check_circle_outline),
          label: Text('ESATTO · ${formatPaymentMoney(dueCents, currency)}'),
        ),
      ),
      const SizedBox(height: 10),
      OutlinedButton.icon(
        onPressed: busy ? null : onOther,
        icon: const Icon(Icons.dialpad),
        label: const Text('Altro importo ricevuto'),
      ),
      TextButton(
        onPressed: busy ? null : onBack,
        child: const Text('Cambia metodo di pagamento'),
      ),
    ],
  );
}

class _ManualCardConfirmation extends StatelessWidget {
  const _ManualCardConfirmation({
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
      Text(amount, textAlign: TextAlign.center),
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

class _ExternalTerminalPending extends StatelessWidget {
  const _ExternalTerminalPending({
    required this.amount,
    required this.busy,
    required this.onVerify,
  });

  final String amount;
  final bool busy;
  final VoidCallback onVerify;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Icon(Icons.credit_card, size: 52),
      const SizedBox(height: 8),
      Text(
        'Pagamento carta da verificare',
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.headlineSmall,
      ),
      Text(amount, textAlign: TextAlign.center),
      const SizedBox(height: 10),
      const Text(
        'Fluxa mantiene la stessa operazione. Non ripassare la carta e non creare un secondo pagamento.',
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: 18),
      SizedBox(
        height: 60,
        child: FilledButton.icon(
          key: const Key('quick-payment-card-verify'),
          onPressed: busy ? null : onVerify,
          icon: const Icon(Icons.refresh),
          label: const Text('VERIFICA ESITO'),
        ),
      ),
    ],
  );
}

class _MessageBox extends StatelessWidget {
  const _MessageBox({required this.text, required this.error});

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) => Material(
    color: error
        ? Theme.of(context).colorScheme.errorContainer
        : Theme.of(context).colorScheme.secondaryContainer,
    borderRadius: BorderRadius.circular(12),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Text(text, textAlign: TextAlign.center),
    ),
  );
}

Future<int?> _showTenderedDialog(
  BuildContext context, {
  required int dueCents,
  required String currency,
}) async {
  var raw = '';
  String? error;
  return showDialog<int>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: const Text('Importo ricevuto'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Da incassare: ${formatPaymentMoney(dueCents, currency)}'),
            const SizedBox(height: 12),
            TextField(
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              onChanged: (value) => raw = value,
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.euro),
                labelText: 'Ricevuto',
                errorText: error,
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Annulla'),
          ),
          FilledButton(
            onPressed: () {
              final value = double.tryParse(raw.trim().replaceAll(',', '.'));
              final cents = value == null ? null : (value * 100).round();
              if (cents == null || cents < dueCents) {
                setState(() => error = 'L’importo ricevuto è troppo basso.');
                return;
              }
              Navigator.pop(dialogContext, cents);
            },
            child: const Text('Conferma'),
          ),
        ],
      ),
    ),
  );
}
