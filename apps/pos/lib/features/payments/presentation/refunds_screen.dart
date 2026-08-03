import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/network/backend_error.dart';
import '../../../core/widgets/async_states.dart';
import '../../orders/domain/uuid_v4.dart';
import '../domain/payment_models.dart';
import '../domain/refund_models.dart';

class RefundsScreen extends ConsumerStatefulWidget {
  const RefundsScreen({super.key});

  @override
  ConsumerState<RefundsScreen> createState() => _RefundsScreenState();
}

class _RefundsScreenState extends ConsumerState<RefundsScreen> {
  final _paymentController = TextEditingController();
  final _amountController = TextEditingController();
  final _reasonController = TextEditingController();
  final _providerReferenceController = TextEditingController();
  RefundQuote? _quote;
  bool _busy = false;
  String? _message;
  bool _error = false;

  @override
  void dispose() {
    _paymentController.dispose();
    _amountController.dispose();
    _reasonController.dispose();
    _providerReferenceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(authControllerProvider).state.session?.role;
    final allowed = {'OWNER', 'ADMIN', 'MANAGER'}.contains(role);
    if (!allowed) {
      return const FluxaEmptyView(
        icon: Icons.lock_outline,
        title: 'Rimborsi non autorizzati',
        message: 'Questa operazione richiede un ruolo elevato.',
      );
    }

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('Rimborsi', style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 4),
        const Text(
          'La quota rimborsabile viene sempre ricalcolata dal backend prima della conferma.',
        ),
        const SizedBox(height: 20),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _paymentController,
                  decoration: const InputDecoration(
                    labelText: 'ID pagamento',
                    hintText: 'UUID della transazione',
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  key: const Key('refund-load-quote-button'),
                  onPressed: _busy ? null : _loadQuote,
                  icon: const Icon(Icons.calculate_outlined),
                  label: const Text('Calcola quota rimborsabile'),
                ),
              ],
            ),
          ),
        ),
        if (_quote case final quote?) ...[
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Quota disponibile',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  _MoneyLine(
                    label: 'Pagamento acquisito',
                    value: formatPaymentMoney(
                      quote.capturedCents,
                      quote.currency,
                    ),
                  ),
                  _MoneyLine(
                    label: 'Già rimborsato',
                    value: formatPaymentMoney(
                      quote.refundedCents,
                      quote.currency,
                    ),
                  ),
                  if (quote.pendingRefundCents > 0)
                    _MoneyLine(
                      label: 'Rimborsi in attesa',
                      value: formatPaymentMoney(
                        quote.pendingRefundCents,
                        quote.currency,
                      ),
                    ),
                  _MoneyLine(
                    label: 'Ancora rimborsabile',
                    value: formatPaymentMoney(
                      quote.refundableCents,
                      quote.currency,
                    ),
                    emphasized: true,
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _amountController,
                    decoration: const InputDecoration(
                      labelText: 'Importo rimborso',
                    ),
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _reasonController,
                    decoration: const InputDecoration(labelText: 'Motivo'),
                    maxLength: 500,
                  ),
                  if (quote.method == 'CARD') ...[
                    const SizedBox(height: 12),
                    TextField(
                      controller: _providerReferenceController,
                      decoration: const InputDecoration(
                        labelText: 'Riferimento terminale/provider',
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    key: const Key('refund-submit-button'),
                    onPressed: _busy || quote.refundableCents <= 0
                        ? null
                        : _submit,
                    icon: const Icon(Icons.undo),
                    label: const Text('Conferma rimborso'),
                  ),
                ],
              ),
            ),
          ),
        ],
        if (_message != null) ...[
          const SizedBox(height: 16),
          Card(
            color: _error
                ? Theme.of(context).colorScheme.errorContainer
                : Theme.of(context).colorScheme.secondaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_message!),
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _loadQuote() async {
    final paymentId = _paymentController.text.trim();
    if (paymentId.isEmpty) {
      _show('Inserisci l’ID del pagamento.', error: true);
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final quote = await ref.read(refundsApiProvider).quote(paymentId);
      setState(() {
        _quote = quote;
        _amountController.text = moneyInputValue(quote.refundableCents);
        _message = quote.fullyRefunded
            ? 'Pagamento già completamente rimborsato.'
            : null;
        _error = false;
      });
    } on BackendError catch (error) {
      _show(error.message, error: true);
    } on FormatException {
      _show('Risposta quota rimborso non valida.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    final quote = _quote;
    if (quote == null) return;
    int amountCents;
    try {
      amountCents = parseMoneyInput(_amountController.text);
    } on FormatException catch (error) {
      _show(error.message, error: true);
      return;
    }
    final reason = _reasonController.text.trim();
    if (reason.isEmpty) {
      _show('Il motivo del rimborso è obbligatorio.', error: true);
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final result = await ref
          .read(refundsApiProvider)
          .create(
            paymentId: quote.paymentId,
            clientRefundId: UuidV4.generate(),
            amountCents: amountCents,
            reason: reason,
            providerReference: _providerReferenceController.text.trim(),
          );
      setState(() {
        _quote = result.quote;
        _amountController.text = moneyInputValue(result.quote.refundableCents);
        _message =
            'Rimborso ${result.refund.status}. Residuo ${formatPaymentMoney(result.quote.refundableCents, result.quote.currency)}.';
        _error = false;
      });
    } on BackendError catch (error) {
      _show(error.message, error: true);
      await _loadQuote();
    } on FormatException {
      _show('Risposta rimborso non valida.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _show(String message, {required bool error}) {
    if (!mounted) return;
    setState(() {
      _message = message;
      _error = error;
    });
  }
}

class _MoneyLine extends StatelessWidget {
  const _MoneyLine({
    required this.label,
    required this.value,
    this.emphasized = false,
  });

  final String label;
  final String value;
  final bool emphasized;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      children: [
        Expanded(child: Text(label)),
        Text(
          value,
          style: emphasized
              ? Theme.of(context).textTheme.titleMedium
              : Theme.of(context).textTheme.bodyMedium,
        ),
      ],
    ),
  );
}
