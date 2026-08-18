import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AdvancedModeFrame extends StatelessWidget {
  const AdvancedModeFrame({
    super.key,
    required this.simplePath,
    required this.child,
    this.label = 'Modalità avanzata',
  });

  final String simplePath;
  final Widget child;
  final String label;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Material(
        color: Theme.of(context).colorScheme.secondaryContainer,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final message = Row(
                children: [
                  const Icon(Icons.admin_panel_settings_outlined),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          label,
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                        const Text(
                          'Qui trovi le funzioni di gestione e dettaglio. Puoi tornare in qualsiasi momento al flusso semplice.',
                        ),
                      ],
                    ),
                  ),
                ],
              );
              final backButton = FilledButton.tonalIcon(
                key: const Key('return-to-simple-mode'),
                onPressed: () => context.go(simplePath),
                icon: const Icon(Icons.arrow_back),
                label: const Text('TORNA ALLA MODALITÀ SEMPLICE'),
              );

              if (constraints.maxWidth < 760) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [message, const SizedBox(height: 8), backButton],
                );
              }

              return Row(
                children: [
                  Expanded(child: message),
                  const SizedBox(width: 16),
                  backButton,
                ],
              );
            },
          ),
        ),
      ),
      Expanded(child: child),
    ],
  );
}
