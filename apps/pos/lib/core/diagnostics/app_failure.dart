import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

class AppFailureWidget extends StatelessWidget {
  const AppFailureWidget({super.key, this.debugMessage});

  final String? debugMessage;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.surface,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48),
                const SizedBox(height: 16),
                Text(
                  'Fluxa non può avviarsi correttamente',
                  style: Theme.of(context).textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Verifica la connessione e la configurazione dell’app, quindi riavviala.',
                  textAlign: TextAlign.center,
                ),
                if (kDebugMode && debugMessage != null) ...[
                  const SizedBox(height: 16),
                  SelectableText(debugMessage!, textAlign: TextAlign.center),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class BootstrapFailureApp extends StatelessWidget {
  const BootstrapFailureApp({super.key, this.debugMessage});

  final String? debugMessage;

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    home: Scaffold(body: AppFailureWidget(debugMessage: debugMessage)),
  );
}
