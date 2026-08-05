import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/offline/offline_models.dart';
import '../../../core/offline/offline_sync_controller.dart';

class OfflineRecoveryScreen extends ConsumerWidget {
  const OfflineRecoveryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.watch(offlineSyncControllerProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Riconciliazione offline')),
      body: RefreshIndicator(
        onRefresh: controller.refresh,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Card(
              child: ListTile(
                leading: Icon(
                  controller.pendingCount == 0
                      ? Icons.cloud_done_outlined
                      : Icons.cloud_upload_outlined,
                ),
                title: Text(
                  '${controller.pendingCount} operazioni da verificare',
                ),
                subtitle: const Text(
                  'Pagamenti, fiscale, cucina e operazioni sensibili non '
                  'vengono mai accodati offline.',
                ),
                trailing: controller.syncing
                    ? const SizedBox.square(
                        dimension: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : IconButton(
                        onPressed: controller.syncDue,
                        icon: const Icon(Icons.sync),
                        tooltip: 'Sincronizza ora',
                      ),
              ),
            ),
            const SizedBox(height: 12),
            if (controller.operations.isEmpty)
              const Card(
                child: ListTile(
                  leading: Icon(Icons.inbox_outlined),
                  title: Text('Nessuna operazione locale'),
                  subtitle: Text('L’outbox persistente è vuoto.'),
                ),
              ),
            for (final operation in controller.operations)
              _OperationCard(operation: operation, controller: controller),
            if (controller.operations.any(
              (operation) => operation.status == OfflineOperationStatus.synced,
            ))
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: OutlinedButton.icon(
                  onPressed: controller.clearSynced,
                  icon: const Icon(Icons.cleaning_services_outlined),
                  label: const Text('Rimuovi operazioni sincronizzate'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _OperationCard extends StatelessWidget {
  const _OperationCard({required this.operation, required this.controller});

  final OfflineOperation operation;
  final OfflineSyncController controller;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: Icon(_icon(operation.status)),
      title: Text(operation.kind.name),
      subtitle: Text(
        '${operation.status.name} · tentativi ${operation.attempts}'
        '${operation.lastError == null ? '' : '\n${operation.lastError}'}',
      ),
      isThreeLine: operation.lastError != null,
      trailing: {
        OfflineOperationStatus.failed,
        OfflineOperationStatus.conflict,
      }.contains(operation.status)
          ? IconButton(
              onPressed: () => controller.retry(operation.id),
              icon: const Icon(Icons.replay),
              tooltip: 'Riprova',
            )
          : null,
    ),
  );

  IconData _icon(OfflineOperationStatus status) => switch (status) {
    OfflineOperationStatus.queued => Icons.schedule_outlined,
    OfflineOperationStatus.syncing => Icons.sync,
    OfflineOperationStatus.synced => Icons.check_circle_outline,
    OfflineOperationStatus.conflict => Icons.compare_arrows,
    OfflineOperationStatus.failed => Icons.error_outline,
  };
}
