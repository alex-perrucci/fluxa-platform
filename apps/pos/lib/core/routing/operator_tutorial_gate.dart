import 'package:flutter/material.dart';

import 'operator_navigation_policy.dart';

class OperatorTutorialGate extends StatefulWidget {
  const OperatorTutorialGate({
    required this.mode,
    required this.child,
    super.key,
  });

  final PosOperatorMode mode;
  final Widget child;

  @override
  State<OperatorTutorialGate> createState() => _OperatorTutorialGateState();
}

class _OperatorTutorialGateState extends State<OperatorTutorialGate> {
  static final Set<PosOperatorMode> _shownModes = {};

  @override
  void initState() {
    super.initState();
    if (_shownModes.add(widget.mode)) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _showTutorial());
    }
  }

  Future<void> _showTutorial() async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(_title(widget.mode)),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Text(_message(widget.mode)),
        ),
        actions: [
          FilledButton(
            key: const Key('operator-tutorial-close'),
            onPressed: () => Navigator.pop(context),
            child: const Text('Inizia'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;

  String _title(PosOperatorMode mode) => switch (mode) {
    PosOperatorMode.cashier => 'Modalità Cassa',
    PosOperatorMode.kitchen => 'Modalità Cucina',
    PosOperatorMode.manager => 'Modalità Manager',
    PosOperatorMode.auto => 'Fluxa POS',
  };

  String _message(PosOperatorMode mode) => switch (mode) {
    PosOperatorMode.cashier =>
      'Usa Cassa per cercare o leggere un barcode, Tavoli per il servizio, Ordini per recuperare le vendite e Stampa per controllare lo stato della stampante. F1–F5 aprono rapidamente le sezioni visibili.',
    PosOperatorMode.kitchen =>
      'Questo terminale è dedicato alla cucina. Visualizza e aggiorna le comande senza accesso alle configurazioni amministrative.',
    PosOperatorMode.manager =>
      'Hai accesso alle sezioni operative avanzate, inclusi rimborsi e fiscale. Device, stampanti e profilo fiscale si configurano nel Control Center web.',
    PosOperatorMode.auto =>
      'Le sezioni disponibili vengono determinate dal ruolo dell’utente autenticato.',
  };
}
