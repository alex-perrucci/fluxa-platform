import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

class AppFailureWidget extends StatelessWidget {
  const AppFailureWidget({super.key, this.debugMessage});

  final String? debugMessage;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: const Color(0xFFF8F6FC),
    child: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: _FailureContent(debugMessage: debugMessage),
          ),
        ),
      ),
    ),
  );
}

class _FailureContent extends StatelessWidget {
  const _FailureContent({required this.debugMessage});

  final String? debugMessage;

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.ltr,
      child: DefaultTextStyle(
        style: const TextStyle(
          color: Color(0xFF24212A),
          fontSize: 16,
          height: 1.35,
        ),
        textAlign: TextAlign.center,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 52, color: Color(0xFF24212A)),
            const SizedBox(height: 18),
            const Text(
              'Fluxa non può mostrare questa schermata',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            const Text(
              'Torna alla schermata precedente oppure riavvia l’app. '
              'L’errore è stato registrato nei log di diagnostica.',
            ),
            if (kDebugMode && debugMessage != null) ...[
              const SizedBox(height: 18),
              SelectableText(
                debugMessage!,
                style: const TextStyle(fontSize: 13, fontFamily: 'monospace'),
              ),
            ],
          ],
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
