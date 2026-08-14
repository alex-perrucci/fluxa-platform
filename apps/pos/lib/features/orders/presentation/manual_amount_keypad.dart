import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'order_controller.dart';

Future<void> showManualAmountKeypad(
  BuildContext context, {
  required OrderController controller,
  required String currency,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (context) =>
      _ManualAmountKeypad(controller: controller, currency: currency),
);

class _ManualAmountKeypad extends StatefulWidget {
  const _ManualAmountKeypad({required this.controller, required this.currency});

  final OrderController controller;
  final String currency;

  @override
  State<_ManualAmountKeypad> createState() => _ManualAmountKeypadState();
}

class _ManualAmountKeypadState extends State<_ManualAmountKeypad> {
  static const _maxCents = 100000000;

  final _descriptionController = TextEditingController();
  int _amountCents = 0;
  bool _submitting = false;

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + bottomInset),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Importo libero',
                      style: theme.textTheme.headlineSmall,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Chiudi',
                    onPressed: _submitting
                        ? null
                        : () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Inserisci il prezzo senza creare prima un prodotto nel catalogo.',
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 16,
                ),
                decoration: BoxDecoration(
                  border: Border.all(color: theme.colorScheme.outlineVariant),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  _money(_amountCents, widget.currency),
                  key: const Key('manual-amount-display'),
                  textAlign: TextAlign.right,
                  style: theme.textTheme.displaySmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const Key('manual-amount-description'),
                controller: _descriptionController,
                maxLength: 180,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(
                  labelText: 'Descrizione (facoltativa)',
                  hintText: 'Es. consumazione, servizio, articolo vario',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 4),
              _Keypad(
                enabled: !_submitting,
                onDigit: _appendDigit,
                onDoubleZero: _appendDoubleZero,
                onBackspace: _backspace,
                onClear: _clear,
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                key: const Key('manual-amount-add-button'),
                onPressed: _canSubmit ? () => _submit(checkout: false) : null,
                icon: const Icon(Icons.add_shopping_cart),
                label: const Text('Aggiungi all’ordine'),
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
                key: const Key('manual-amount-checkout-button'),
                onPressed: _canSubmit ? () => _submit(checkout: true) : null,
                icon: _submitting
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.payments_outlined),
                label: const Text('Aggiungi e vai al pagamento'),
              ),
              if (widget.controller.errorMessage case final message?) ...[
                const SizedBox(height: 12),
                Text(
                  message,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: theme.colorScheme.error),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  bool get _canSubmit => !_submitting && _amountCents > 0;

  void _appendDigit(int digit) {
    setState(() {
      final next = (_amountCents * 10) + digit;
      if (next <= _maxCents) _amountCents = next;
    });
  }

  void _appendDoubleZero() {
    setState(() {
      final next = _amountCents * 100;
      if (next <= _maxCents) _amountCents = next;
    });
  }

  void _backspace() => setState(() => _amountCents ~/= 10);

  void _clear() => setState(() => _amountCents = 0);

  Future<void> _submit({required bool checkout}) async {
    if (!_canSubmit) return;
    setState(() => _submitting = true);
    widget.controller.clearMessages();
    final success = await widget.controller.addManualItem(
      amountCents: _amountCents,
      description: _descriptionController.text,
    );
    if (!mounted) return;
    if (!success) {
      setState(() => _submitting = false);
      return;
    }

    final orderId = widget.controller.activeOrder?.header.id;
    final router = GoRouter.of(context);
    Navigator.of(context).pop();
    if (checkout && orderId != null) {
      router.push('/checkout/$orderId');
    }
  }

  String _money(int cents, String currency) =>
      '${(cents / 100).toStringAsFixed(2).replaceAll('.', ',')} $currency';
}

class _Keypad extends StatelessWidget {
  const _Keypad({
    required this.enabled,
    required this.onDigit,
    required this.onDoubleZero,
    required this.onBackspace,
    required this.onClear,
  });

  final bool enabled;
  final ValueChanged<int> onDigit;
  final VoidCallback onDoubleZero;
  final VoidCallback onBackspace;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final entries = <_KeypadEntry>[
      for (final digit in [7, 8, 9, 4, 5, 6, 1, 2, 3])
        _KeypadEntry('$digit', () => onDigit(digit)),
      _KeypadEntry('C', onClear),
      _KeypadEntry('0', () => onDigit(0)),
      _KeypadEntry('00', onDoubleZero),
    ];
    return Column(
      children: [
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 3,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 2.2,
          children: entries
              .map(
                (entry) => FilledButton.tonal(
                  onPressed: enabled ? entry.onPressed : null,
                  child: Text(
                    entry.label,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
              )
              .toList(growable: false),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: enabled ? onBackspace : null,
            icon: const Icon(Icons.backspace_outlined),
            label: const Text('Cancella ultima cifra'),
          ),
        ),
      ],
    );
  }
}

class _KeypadEntry {
  const _KeypadEntry(this.label, this.onPressed);

  final String label;
  final VoidCallback onPressed;
}
