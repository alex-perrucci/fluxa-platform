import 'package:flutter/material.dart';

class FluxaLoadingView extends StatelessWidget {
  const FluxaLoadingView({super.key, this.label = 'Caricamento…'});
  final String label;

  @override
  Widget build(BuildContext context) => Center(
    child: Semantics(label: label, child: const CircularProgressIndicator()),
  );
}

class FluxaEmptyView extends StatelessWidget {
  const FluxaEmptyView({
    required this.title,
    required this.message,
    super.key,
    this.icon = Icons.inbox_outlined,
  });

  final String title;
  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 440),
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 52),
            const SizedBox(height: 16),
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(message, textAlign: TextAlign.center),
          ],
        ),
      ),
    ),
  );
}

class FluxaErrorBanner extends StatelessWidget {
  const FluxaErrorBanner({required this.message, super.key});
  final String message;

  @override
  Widget build(BuildContext context) => MaterialBanner(
    content: Text(message),
    leading: const Icon(Icons.error_outline),
    actions: const [SizedBox.shrink()],
  );
}
