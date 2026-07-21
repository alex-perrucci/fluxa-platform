import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../auth/presentation/auth_controller.dart';

class OperationalBlockedScreen extends ConsumerWidget {
  const OperationalBlockedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.watch(authControllerProvider);
    return OperationalBlockedView(
      status: controller.state.status,
      errorMessage: controller.state.errorMessage,
      busy: controller.state.busy,
      onRetry: controller.refreshOperationalContext,
      onSettings: () => context.go('/settings'),
      onLogout: controller.logout,
    );
  }
}

class OperationalBlockedView extends StatelessWidget {
  const OperationalBlockedView({
    required this.status,
    required this.onRetry,
    required this.onSettings,
    required this.onLogout,
    this.errorMessage,
    this.busy = false,
    super.key,
  });

  final AuthStatus status;
  final String? errorMessage;
  final bool busy;
  final Future<void> Function() onRetry;
  final VoidCallback onSettings;
  final Future<void> Function() onLogout;

  @override
  Widget build(BuildContext context) {
    final presentation = _presentation(status);
    return Scaffold(
      appBar: AppBar(title: const Text('Fluxa POS')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 620),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(presentation.icon, size: 56),
                    const SizedBox(height: 18),
                    Text(
                      presentation.title,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      errorMessage ?? presentation.message,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      alignment: WrapAlignment.center,
                      children: [
                        FilledButton.icon(
                          onPressed: busy ? null : onRetry,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Riprova'),
                        ),
                        OutlinedButton.icon(
                          onPressed: onSettings,
                          icon: const Icon(Icons.settings_outlined),
                          label: const Text('Impostazioni tecniche'),
                        ),
                        TextButton.icon(
                          onPressed: busy ? null : onLogout,
                          icon: const Icon(Icons.logout),
                          label: const Text('Esci'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  _OperationalPresentation _presentation(AuthStatus status) => switch (status) {
    AuthStatus.locationRequired => const _OperationalPresentation(
      icon: Icons.add_location_alt_outlined,
      title: 'Assegnazione alla location richiesta',
      message:
          'Il dispositivo è riconosciuto, ma un amministratore deve assegnarlo a una location prima di usare il POS.',
    ),
    AuthStatus.assignmentRevoked => const _OperationalPresentation(
      icon: Icons.phonelink_erase_outlined,
      title: 'Assegnazione del dispositivo revocata',
      message:
          'Le funzioni operative sono bloccate. Contatta un amministratore per riattivare il dispositivo.',
    ),
    AuthStatus.locationInactive => const _OperationalPresentation(
      icon: Icons.location_disabled_outlined,
      title: 'Location non operativa',
      message:
          'La location assegnata è inattiva o non più valida. È necessario un intervento amministrativo.',
    ),
    AuthStatus.deviceAssignmentMissing => const _OperationalPresentation(
      icon: Icons.link_off_outlined,
      title: 'Dispositivo non assegnato',
      message:
          'Non esiste un’assegnazione del dispositivo per l’organizzazione corrente.',
    ),
    _ => const _OperationalPresentation(
      icon: Icons.sync_problem_outlined,
      title: 'Contesto operativo non disponibile',
      message:
          'Fluxa non riesce a verificare la location operativa. Riprova o controlla la configurazione tecnica.',
    ),
  };
}

class _OperationalPresentation {
  const _OperationalPresentation({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;
}
