import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import 'offline_cashier_screen.dart';
import 'operator_cashier_screen.dart';

class ResilientCashierScreen extends ConsumerWidget {
  const ResilientCashierScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final catalog = ref.watch(catalogControllerProvider);
    final orders = ref.watch(orderControllerProvider);

    if (!catalog.offlineMode || catalog.snapshot == null) {
      return const OperatorCashierScreen();
    }

    // Never convert an already-started online order into an offline sale. A
    // lost response could make its server state ambiguous and automatic
    // fallback would risk duplicates. Offline mode starts only between sales.
    if (orders.hasCurrentOrder) {
      return _OfflineTransitionGuard(
        onRetry: () async {
          await Future.wait([
            catalog.refresh(),
            orders.refreshOperationalState(),
          ]);
        },
      );
    }

    return const OfflineCashierScreen();
  }
}

class _OfflineTransitionGuard extends StatelessWidget {
  const _OfflineTransitionGuard({required this.onRetry});

  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 560),
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.sync_problem_outlined, size: 58),
            const SizedBox(height: 16),
            Text(
              'Vendita online da verificare',
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 10),
            const Text(
              'La rete è caduta mentre esiste già una vendita online. Fluxa non la trasforma automaticamente in offline: così non rischia di creare un doppio ordine o un doppio incasso.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('RIPROVA CONNESSIONE'),
            ),
            const SizedBox(height: 10),
            const FluxaEmptyView(
              icon: Icons.shield_outlined,
              title: 'Nessun addebito automatico',
              message:
                  'Quando la connessione torna, verifica la vendita esistente e poi continua normalmente.',
            ),
          ],
        ),
      ),
    ),
  );
}
