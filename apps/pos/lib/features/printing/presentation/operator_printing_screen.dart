import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../domain/printing_models.dart';
import 'printing_controller.dart';

class OperatorPrintingScreen extends ConsumerWidget {
  const OperatorPrintingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).state;
    final controller = ref.watch(printingControllerProvider);
    final location = auth.deviceAssignment?.location;
    final session = auth.session;

    if (location == null || session == null) {
      return const FluxaEmptyView(
        icon: Icons.print_disabled_outlined,
        title: 'Stampa non disponibile',
        message: 'Questa postazione non è ancora pronta per la stampa.',
      );
    }

    if (controller.status == PrintingLoadStatus.loading &&
        controller.printers.isEmpty) {
      return const FluxaLoadingView(label: 'Controllo stampanti');
    }

    final assigned = controller.assignedPrinters;
    final failedJobs = controller.jobs
        .where((job) => job.status == PrintJobStatus.failed)
        .toList(growable: false);
    final waitingJobs = controller.jobs
        .where(
          (job) =>
              job.status == PrintJobStatus.queued ||
              job.status == PrintJobStatus.claimed,
        )
        .toList(growable: false);
    final connected = assigned
        .where((printer) => controller.queueFor(printer.id)?.isNotEmpty == true)
        .toList(growable: false);
    final allReady =
        assigned.isNotEmpty &&
        connected.length == assigned.length &&
        failedJobs.isEmpty &&
        controller.errorMessage == null;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Stampa', style: Theme.of(context).textTheme.headlineMedium),
                  const Text('Controlla in un attimo se la postazione è pronta.'),
                ],
              ),
            ),
            TextButton.icon(
              onPressed: () => context.go('/printing/manage'),
              icon: const Icon(Icons.tune),
              label: const Text('Gestione avanzata'),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _PrintingSummary(
          ready: allReady,
          assignedCount: assigned.length,
          connectedCount: connected.length,
          failedCount: failedJobs.length,
          waitingCount: waitingJobs.length,
          errorMessage: controller.errorMessage,
        ),
        const SizedBox(height: 14),
        if (assigned.isEmpty)
          Card(
            child: ListTile(
              leading: const Icon(Icons.warning_amber),
              title: const Text('Nessuna stampante assegnata'),
              subtitle: const Text(
                'Apri Gestione avanzata per collegare le stampanti di questa postazione.',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.go('/printing/manage'),
            ),
          )
        else
          ...assigned.map(
            (printer) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _PrinterCard(
                printer: printer,
                connected: controller.queueFor(printer.id)?.isNotEmpty == true,
                connection: controller.connectionLabel(printer.id),
                busy: controller.busy,
                onTest: () => controller.requestTestPage(printer),
              ),
            ),
          ),
        if (failedJobs.isNotEmpty) ...[
          const SizedBox(height: 6),
          Card(
            child: ListTile(
              leading: Icon(
                Icons.error_outline,
                color: Theme.of(context).colorScheme.error,
              ),
              title: Text('${failedJobs.length} stampe non riuscite'),
              subtitle: const Text('Apri la gestione per riprovare o vedere il motivo.'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.go('/printing/manage'),
            ),
          ),
        ],
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: controller.busy ? null : controller.refresh,
          icon: const Icon(Icons.refresh),
          label: const Text('Controlla adesso'),
        ),
      ],
    );
  }
}

class _PrintingSummary extends StatelessWidget {
  const _PrintingSummary({
    required this.ready,
    required this.assignedCount,
    required this.connectedCount,
    required this.failedCount,
    required this.waitingCount,
    required this.errorMessage,
  });

  final bool ready;
  final int assignedCount;
  final int connectedCount;
  final int failedCount;
  final int waitingCount;
  final String? errorMessage;

  @override
  Widget build(BuildContext context) {
    final title = ready ? 'STAMPANTI PRONTE' : 'CONTROLLA LA STAMPA';
    final detail = errorMessage ??
        (assignedCount == 0
            ? 'Nessuna stampante assegnata a questa postazione.'
            : '$connectedCount/$assignedCount collegate · $waitingCount in coda · $failedCount con errore');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Icon(
              ready ? Icons.verified_outlined : Icons.print_disabled_outlined,
              size: 48,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 4),
                  Text(detail),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PrinterCard extends StatelessWidget {
  const _PrinterCard({
    required this.printer,
    required this.connected,
    required this.connection,
    required this.busy,
    required this.onTest,
  });

  final PrinterDevice printer;
  final bool connected;
  final String connection;
  final bool busy;
  final VoidCallback onTest;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Icon(connected ? Icons.print : Icons.print_disabled_outlined, size: 36),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(printer.name, style: Theme.of(context).textTheme.titleMedium),
                Text('${printer.purpose.label} · ${connected ? 'Pronta' : 'Da collegare'}'),
                if (connected)
                  Text(
                    connection,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
          ),
          OutlinedButton.icon(
            onPressed: !connected || busy ? null : onTest,
            icon: const Icon(Icons.description_outlined),
            label: const Text('Prova'),
          ),
        ],
      ),
    ),
  );
}
