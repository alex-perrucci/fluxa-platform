import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../device/domain/device_assignment_models.dart';
import '../domain/printing_models.dart';
import '../platform/local_printer_backend_contract.dart';
import 'printing_controller.dart';

class PrintingScreen extends ConsumerWidget {
  const PrintingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).state;
    final controller = ref.watch(printingControllerProvider);
    final location = auth.deviceAssignment?.location;
    final session = auth.session;
    if (location == null || session == null) {
      return const FluxaEmptyView(
        icon: Icons.print_disabled_outlined,
        title: 'Contesto di stampa non disponibile',
        message: 'Completa il bootstrap operativo prima di aprire la stampa.',
      );
    }
    return PrintingView(
      controller: controller,
      location: location,
      canManageJobs: _isManagerRole(session.role),
    );
  }
}

class PrintingView extends StatelessWidget {
  const PrintingView({
    required this.controller,
    required this.location,
    required this.canManageJobs,
    super.key,
  });

  final PrintingController controller;
  final OperationalLocation location;
  final bool canManageJobs;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, child) {
      if (controller.status == PrintingLoadStatus.loading &&
          controller.printers.isEmpty &&
          controller.jobs.isEmpty) {
        return const FluxaLoadingView(label: 'Caricamento stampa');
      }
      if (controller.status == PrintingLoadStatus.failure &&
          controller.printers.isEmpty &&
          controller.jobs.isEmpty) {
        return FluxaEmptyView(
          icon: Icons.cloud_off_outlined,
          title: 'Stampa non disponibile',
          message: controller.errorMessage ?? 'Riprova tra poco.',
        );
      }
      return Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Header(controller: controller, location: location),
            if (controller.errorMessage != null) ...[
              const SizedBox(height: 12),
              _MessageCard(
                message: controller.errorMessage!,
                error: true,
                onDismiss: controller.clearMessages,
              ),
            ] else if (controller.noticeMessage != null) ...[
              const SizedBox(height: 12),
              _MessageCard(
                message: controller.noticeMessage!,
                error: false,
                onDismiss: controller.clearMessages,
              ),
            ],
            const SizedBox(height: 12),
            _AgentCard(controller: controller),
            const SizedBox(height: 12),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final list = _QueuePane(controller: controller);
                  final detail = _JobDetailPane(
                    controller: controller,
                    canManageJobs: canManageJobs,
                  );
                  if (constraints.maxWidth >= 1120) {
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SizedBox(width: 430, child: list),
                        const SizedBox(width: 16),
                        Expanded(child: detail),
                      ],
                    );
                  }
                  return controller.selectedJob == null ? list : detail;
                },
              ),
            ),
          ],
        ),
      );
    },
  );
}

class _Header extends StatelessWidget {
  const _Header({required this.controller, required this.location});

  final PrintingController controller;
  final OperationalLocation location;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Stampa', style: Theme.of(context).textTheme.headlineMedium),
            Text(
              '${location.name} · ${controller.printers.length} stampanti · '
              '${controller.jobs.length} lavori visualizzati',
            ),
          ],
        ),
      ),
      IconButton.filledTonal(
        key: const Key('printing-refresh-button'),
        tooltip: 'Aggiorna stampanti e coda',
        onPressed: controller.busy ? null : controller.refresh,
        icon: controller.status == PrintingLoadStatus.loading
            ? const SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.refresh),
      ),
    ],
  );
}

class _AgentCard extends StatelessWidget {
  const _AgentCard({required this.controller});

  final PrintingController controller;

  @override
  Widget build(BuildContext context) {
    final assigned = controller.assignedPrinters;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  controller.agentEnabled
                      ? Icons.print_outlined
                      : Icons.print_disabled_outlined,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Agente di stampa Android',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(
                        controller.agentSupported
                            ? '${assigned.length} stampanti assegnate a questo dispositivo'
                            : 'Apri questa sezione nell’app Android per stampare via Wi-Fi o Bluetooth.',
                      ),
                    ],
                  ),
                ),
                Switch(
                  key: const Key('printing-agent-switch'),
                  value: controller.agentEnabled,
                  onChanged: controller.busy || !controller.agentSupported
                      ? null
                      : controller.setAgentEnabled,
                ),
                if (controller.agentPolling)
                  const Padding(
                    padding: EdgeInsets.only(left: 8),
                    child: SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
              ],
            ),
            if (controller.agentMessage != null) ...[
              const SizedBox(height: 8),
              Text(controller.agentMessage!),
            ],
            if (controller.agentSupported) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Associa ogni stampante backend a una termica Wi-Fi oppure a una stampante Bluetooth già abbinata ad Android.',
                    ),
                  ),
                  TextButton.icon(
                    key: const Key('printing-refresh-local-queues'),
                    onPressed: controller.busy
                        ? null
                        : controller.refreshLocalQueues,
                    icon: const Icon(Icons.bluetooth_searching),
                    label: const Text('Rileva Bluetooth'),
                  ),
                  const SizedBox(width: 8),
                  TextButton.icon(
                    key: const Key('printing-poll-now'),
                    onPressed:
                        controller.agentEnabled && !controller.agentPolling
                        ? controller.pollAgentNow
                        : null,
                    icon: const Icon(Icons.play_arrow),
                    label: const Text('Esegui ora'),
                  ),
                ],
              ),
              if (assigned.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text(
                    'Nessuna stampante attiva è assegnata al dispositivo corrente. '
                    'La configurazione backend va completata da un amministratore.',
                  ),
                )
              else
                ...assigned.map(
                  (printer) => Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Card.outlined(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${printer.name} · ${printer.purpose.label}',
                                    style: Theme.of(
                                      context,
                                    ).textTheme.titleSmall,
                                  ),
                                  Text(controller.connectionLabel(printer.id)),
                                ],
                              ),
                            ),
                            SizedBox(
                              width: 280,
                              child: DropdownButtonFormField<String?>(
                                key: Key('printer-bluetooth-${printer.id}'),
                                value:
                                    isBluetoothPrinterTarget(
                                      controller.queueFor(printer.id),
                                    )
                                    ? controller.queueFor(printer.id)
                                    : null,
                                decoration: const InputDecoration(
                                  labelText: 'Bluetooth abbinato',
                                  border: OutlineInputBorder(),
                                  isDense: true,
                                ),
                                items: [
                                  const DropdownMenuItem<String?>(
                                    value: null,
                                    child: Text('Nessuno'),
                                  ),
                                  ...controller.localQueues.map(
                                    (target) => DropdownMenuItem<String?>(
                                      value: target,
                                      child: Text(
                                        localPrinterTargetLabel(target),
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  ),
                                ],
                                onChanged: controller.busy
                                    ? null
                                    : (value) => controller.setQueueMapping(
                                        printer,
                                        value,
                                      ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            OutlinedButton.icon(
                              key: Key('printer-wifi-${printer.id}'),
                              onPressed: controller.busy
                                  ? null
                                  : () => _configureWifiPrinter(
                                      context,
                                      controller,
                                      printer,
                                    ),
                              icon: const Icon(Icons.wifi),
                              label: const Text('Wi-Fi'),
                            ),
                            const SizedBox(width: 8),
                            IconButton(
                              key: Key('printer-clear-${printer.id}'),
                              tooltip: 'Rimuovi connessione locale',
                              onPressed:
                                  controller.busy ||
                                      controller.queueFor(printer.id) == null
                                  ? null
                                  : () => controller.setQueueMapping(
                                      printer,
                                      null,
                                    ),
                              icon: const Icon(Icons.link_off),
                            ),
                            IconButton(
                              key: Key('printer-test-${printer.id}'),
                              tooltip: 'Accoda pagina di test',
                              onPressed: controller.busy
                                  ? null
                                  : () => controller.requestTestPage(printer),
                              icon: const Icon(Icons.description_outlined),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

Future<void> _configureWifiPrinter(
  BuildContext context,
  PrintingController controller,
  PrinterDevice printer,
) async {
  final current = controller.queueFor(printer.id);
  var initialHost = '';
  var initialPort = '9100';
  if (isWifiPrinterTarget(current)) {
    final parts = current!.split('|');
    if (parts.length == 3) {
      initialHost = parts[1];
      initialPort = parts[2];
    }
  }
  final hostController = TextEditingController(text: initialHost);
  final portController = TextEditingController(text: initialPort);
  final target = await showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text('Stampante Wi-Fi · ${printer.name}'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              key: const Key('wifi-printer-host'),
              controller: hostController,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Indirizzo IP o hostname',
                hintText: '192.168.1.50',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('wifi-printer-port'),
              controller: portController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Porta TCP',
                hintText: '9100',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'La maggior parte delle stampanti termiche ESC/POS di rete usa la porta 9100.',
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('Annulla'),
        ),
        FilledButton(
          key: const Key('save-wifi-printer'),
          onPressed: () {
            final host = hostController.text.trim();
            final port = int.tryParse(portController.text.trim());
            if (host.isEmpty || port == null || port < 1 || port > 65535) {
              return;
            }
            Navigator.pop(
              dialogContext,
              buildWifiPrinterTarget(host: host, port: port),
            );
          },
          child: const Text('Salva'),
        ),
      ],
    ),
  );
  hostController.dispose();
  portController.dispose();
  if (target != null) {
    await controller.setQueueMapping(printer, target);
  }
}

class _QueuePane extends StatelessWidget {
  const _QueuePane({required this.controller});

  final PrintingController controller;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Row(
        children: [
          Expanded(
            child: DropdownButtonFormField<String?>(
              key: const Key('print-printer-filter'),
              value: controller.printerFilterId,
              decoration: const InputDecoration(
                labelText: 'Stampante',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: [
                const DropdownMenuItem<String?>(
                  value: null,
                  child: Text('Tutte'),
                ),
                ...controller.printers.map(
                  (printer) => DropdownMenuItem<String?>(
                    value: printer.id,
                    child: Text(printer.name),
                  ),
                ),
              ],
              onChanged: controller.busy ? null : controller.setPrinterFilter,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: DropdownButtonFormField<PrintJobStatus?>(
              key: const Key('print-status-filter'),
              value: controller.statusFilter,
              decoration: const InputDecoration(
                labelText: 'Stato',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: [
                const DropdownMenuItem<PrintJobStatus?>(
                  value: null,
                  child: Text('Tutti'),
                ),
                ...PrintJobStatus.values.map(
                  (status) => DropdownMenuItem<PrintJobStatus?>(
                    value: status,
                    child: Text(status.label),
                  ),
                ),
              ],
              onChanged: controller.busy ? null : controller.setStatusFilter,
            ),
          ),
        ],
      ),
      const SizedBox(height: 12),
      Expanded(child: _JobList(controller: controller)),
    ],
  );
}

class _JobList extends StatelessWidget {
  const _JobList({required this.controller});

  final PrintingController controller;

  @override
  Widget build(BuildContext context) {
    if (controller.jobs.isEmpty) {
      return const FluxaEmptyView(
        icon: Icons.print_outlined,
        title: 'Coda vuota',
        message: 'I lavori creati per questa location compariranno qui.',
      );
    }
    return Card(
      clipBehavior: Clip.antiAlias,
      child: ListView.separated(
        key: const Key('print-jobs-list'),
        itemCount: controller.jobs.length,
        separatorBuilder: (context, index) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final job = controller.jobs[index];
          return ListTile(
            key: Key('print-job-${job.id}'),
            selected: controller.selectedJob?.id == job.id,
            leading: Icon(_documentIcon(job.documentType)),
            title: Text(job.documentType.label),
            subtitle: Text(
              '${controller.printerName(job.printerId)} · '
              '${job.attempts}/${job.maxAttempts} tentativi',
            ),
            trailing: Chip(label: Text(job.status.label)),
            onTap: controller.busy ? null : () => controller.selectJob(job.id),
          );
        },
      ),
    );
  }
}

class _JobDetailPane extends StatelessWidget {
  const _JobDetailPane({required this.controller, required this.canManageJobs});

  final PrintingController controller;
  final bool canManageJobs;

  @override
  Widget build(BuildContext context) {
    final job = controller.selectedJob;
    if (job == null) {
      return const FluxaEmptyView(
        icon: Icons.touch_app_outlined,
        title: 'Seleziona un lavoro',
        message:
            'Apri un elemento della coda per vedere documento e tentativi.',
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(_documentIcon(job.documentType)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        job.documentType.label,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      Text(
                        '${controller.printerName(job.printerId)} · v${job.version}',
                      ),
                    ],
                  ),
                ),
                Chip(label: Text(job.status.label)),
                IconButton(
                  tooltip: 'Chiudi dettaglio',
                  onPressed: controller.busy ? null : controller.closeJob,
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            if (job.lastError != null) ...[
              const SizedBox(height: 10),
              Text('Ultimo errore: ${job.lastError}'),
            ],
            const Divider(height: 24),
            Expanded(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    flex: 3,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: Theme.of(context).colorScheme.outlineVariant,
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(14),
                        child: SelectableText(
                          job.renderedText,
                          key: const Key('print-rendered-text'),
                          style: const TextStyle(fontFamily: 'monospace'),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: job.attemptHistory.isEmpty
                        ? const Center(
                            child: Text('Nessun tentativo registrato.'),
                          )
                        : ListView.separated(
                            itemCount: job.attemptHistory.length,
                            separatorBuilder: (context, index) =>
                                const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final attempt = job.attemptHistory[index];
                              return ListTile(
                                dense: true,
                                contentPadding: EdgeInsets.zero,
                                title: Text(
                                  'Tentativo ${attempt.attemptNo} · ${attempt.outcome.label}',
                                ),
                                subtitle: attempt.error == null
                                    ? null
                                    : Text(attempt.error!),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
            const Divider(height: 24),
            Wrap(
              alignment: WrapAlignment.end,
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  key: const Key('reprint-job-button'),
                  onPressed: controller.busy || !job.canReprint
                      ? null
                      : () => controller.reprintJob(job),
                  icon: const Icon(Icons.print_outlined),
                  label: const Text('Ristampa'),
                ),
                if (canManageJobs && job.status.canRetry)
                  FilledButton.tonalIcon(
                    key: const Key('retry-print-job-button'),
                    onPressed: controller.busy
                        ? null
                        : () => controller.retryJob(job),
                    icon: const Icon(Icons.replay),
                    label: const Text('Riprova'),
                  ),
                if (canManageJobs && job.status.canCancel)
                  TextButton.icon(
                    key: const Key('cancel-print-job-button'),
                    onPressed: controller.busy
                        ? null
                        : () => _cancelJob(context, controller, job),
                    icon: const Icon(Icons.cancel_outlined),
                    label: const Text('Annulla'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

Future<void> _cancelJob(
  BuildContext context,
  PrintingController controller,
  PrintJob job,
) async {
  final textController = TextEditingController();
  try {
    final reason = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Annulla lavoro di stampa'),
        content: TextField(
          key: const Key('cancel-print-job-reason'),
          controller: textController,
          maxLength: 500,
          decoration: const InputDecoration(
            labelText: 'Motivo',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Indietro'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, textController.text),
            child: const Text('Annulla lavoro'),
          ),
        ],
      ),
    );
    if (reason != null) {
      await controller.cancelJob(job, reason);
    }
  } finally {
    textController.dispose();
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({
    required this.message,
    required this.error,
    required this.onDismiss,
  });

  final String message;
  final bool error;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: Icon(error ? Icons.error_outline : Icons.check_circle_outline),
      title: Text(message),
      trailing: IconButton(
        tooltip: 'Chiudi',
        onPressed: onDismiss,
        icon: const Icon(Icons.close),
      ),
    ),
  );
}

bool _isManagerRole(String? role) =>
    role == 'OWNER' || role == 'ADMIN' || role == 'MANAGER';

IconData _documentIcon(PrintDocumentType type) => switch (type) {
  PrintDocumentType.kitchenTicket => Icons.soup_kitchen_outlined,
  PrintDocumentType.orderReceipt => Icons.receipt_long_outlined,
  PrintDocumentType.paymentReceipt => Icons.payments_outlined,
  PrintDocumentType.testPage => Icons.description_outlined,
};
