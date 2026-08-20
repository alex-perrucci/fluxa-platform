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
  Widget build(BuildContext context) {
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
    return LayoutBuilder(
      builder: (context, constraints) {
        final list = _QueuePane(controller: controller);
        final detail = _JobDetailPane(
          controller: controller,
          canManageJobs: canManageJobs,
        );
        final selectedPane = controller.selectedJob == null ? list : detail;
        final mobilePaneHeight = (MediaQuery.sizeOf(context).height * 0.62)
            .clamp(480.0, 680.0)
            .toDouble();
        if (constraints.maxWidth < 760) {
          return ListView(
            padding: const EdgeInsets.all(16),
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
              SizedBox(height: mobilePaneHeight, child: selectedPane),
            ],
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
                child: constraints.maxWidth >= 1120
                    ? Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          SizedBox(width: 430, child: list),
                          const SizedBox(width: 16),
                          Expanded(child: detail),
                        ],
                      )
                    : selectedPane,
              ),
            ],
          ),
        );
      },
    );
  }
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
            LayoutBuilder(
              builder: (context, constraints) {
                final compact = constraints.maxWidth < 430;
                final identity = Row(
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
                            'Agente di stampa locale',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(
                            controller.agentSupported
                                ? '${assigned.length} stampanti assegnate '
                                      'a questo dispositivo'
                                : 'La stampa locale è disponibile '
                                      'nell’app Android o Windows.',
                          ),
                        ],
                      ),
                    ),
                  ],
                );

                final controls = Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
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
                );

                if (compact) {
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      identity,
                      const SizedBox(height: 8),
                      Align(alignment: Alignment.centerRight, child: controls),
                    ],
                  );
                }

                return Row(
                  children: [
                    Expanded(child: identity),
                    controls,
                  ],
                );
              },
            ),
            if (controller.agentMessage != null) ...[
              const SizedBox(height: 8),
              Text(controller.agentMessage!),
            ],
            if (controller.agentSupported) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 520),
                    child: const Text(
                      'Associa ogni stampante backend a una termica '
                      'Wi-Fi oppure a una stampante Bluetooth già '
                      'abbinata al dispositivo.',
                    ),
                  ),
                  TextButton.icon(
                    key: const Key('printing-refresh-local-queues'),
                    onPressed: controller.busy
                        ? null
                        : controller.refreshLocalQueues,
                    icon: const Icon(Icons.bluetooth_searching),
                    label: const Text('Rileva stampanti'),
                  ),
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
                    'Nessuna stampante attiva è assegnata al '
                    'dispositivo corrente. La configurazione backend '
                    'va completata da un amministratore.',
                  ),
                )
              else
                ...assigned.map(
                  (printer) => Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: _AssignedPrinterCard(
                      controller: controller,
                      printer: printer,
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

class _AssignedPrinterCard extends StatelessWidget {
  const _AssignedPrinterCard({required this.controller, required this.printer});

  final PrintingController controller;
  final PrinterDevice printer;

  @override
  Widget build(BuildContext context) => Card.outlined(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final information = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${printer.name} · ${printer.purpose.label}',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              Text(controller.connectionLabel(printer.id)),
            ],
          );
          final bluetooth = DropdownButtonFormField<String?>(
            key: Key('printer-bluetooth-${printer.id}'),
            value: isBluetoothPrinterTarget(controller.queueFor(printer.id))
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
                : (value) => controller.setQueueMapping(printer, value),
          );
          final actions = Wrap(
            spacing: 4,
            runSpacing: 4,
            children: [
              OutlinedButton.icon(
                key: Key('printer-wifi-${printer.id}'),
                onPressed: controller.busy
                    ? null
                    : () => _configureWifiPrinter(context, controller, printer),
                icon: const Icon(Icons.wifi),
                label: const Text('Wi-Fi'),
              ),
              IconButton(
                key: Key('printer-clear-${printer.id}'),
                tooltip: 'Rimuovi connessione locale',
                onPressed:
                    controller.busy || controller.queueFor(printer.id) == null
                    ? null
                    : () => controller.setQueueMapping(printer, null),
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
          );
          if (constraints.maxWidth < 760) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                information,
                const SizedBox(height: 10),
                bluetooth,
                const SizedBox(height: 8),
                actions,
              ],
            );
          }
          return Row(
            children: [
              Expanded(child: information),
              SizedBox(width: 280, child: bluetooth),
              const SizedBox(width: 8),
              actions,
            ],
          );
        },
      ),
    ),
  );
}

Future<void> _configureWifiPrinter(
  BuildContext context,
  PrintingController controller,
  PrinterDevice printer,
) async {
  final current = controller.queueFor(printer.id);
  var hostText = '';
  var portText = '9100';
  if (isWifiPrinterTarget(current)) {
    final parts = current!.split('|');
    if (parts.length == 3) {
      hostText = parts[1];
      portText = parts[2];
    }
  }
  final target = await showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text('Stampante Wi-Fi · ${printer.name}'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              key: const Key('wifi-printer-host'),
              initialValue: hostText,
              onChanged: (value) => hostText = value,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Indirizzo IP o hostname',
                hintText: '192.168.1.50',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const Key('wifi-printer-port'),
              initialValue: portText,
              onChanged: (value) => portText = value,
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
            final host = hostText.trim();
            final port = int.tryParse(portText.trim());
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
  if (target != null) {
    await controller.setQueueMapping(printer, target);
  }
}

class _QueuePane extends StatelessWidget {
  const _QueuePane({required this.controller});

  final PrintingController controller;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final compact = constraints.maxWidth < 430;
      final printerFilter = DropdownButtonFormField<String?>(
        key: const Key('print-printer-filter'),
        value: controller.printerFilterId,
        isExpanded: true,
        decoration: const InputDecoration(
          labelText: 'Stampante',
          border: OutlineInputBorder(),
          isDense: true,
        ),
        items: [
          const DropdownMenuItem<String?>(value: null, child: Text('Tutte')),
          ...controller.printers.map(
            (printer) => DropdownMenuItem<String?>(
              value: printer.id,
              child: Text(
                printer.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
        onChanged: controller.busy ? null : controller.setPrinterFilter,
      );
      final statusFilter = DropdownButtonFormField<PrintJobStatus?>(
        key: const Key('print-status-filter'),
        value: controller.statusFilter,
        isExpanded: true,
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
              child: Text(
                status.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
        onChanged: controller.busy ? null : controller.setStatusFilter,
      );

      return Column(
        children: [
          if (compact)
            Column(
              children: [
                printerFilter,
                const SizedBox(height: 10),
                statusFilter,
              ],
            )
          else
            Row(
              children: [
                Expanded(child: printerFilter),
                const SizedBox(width: 10),
                Expanded(child: statusFilter),
              ],
            ),
          const SizedBox(height: 12),
          Expanded(child: _JobList(controller: controller)),
        ],
      );
    },
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
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 390;
          return ListView.separated(
            key: const Key('print-jobs-list'),
            itemCount: controller.jobs.length,
            separatorBuilder: (context, index) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final job = controller.jobs[index];
              return ListTile(
                key: Key('print-job-${job.id}'),
                selected: controller.selectedJob?.id == job.id,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 4,
                ),
                leading: compact ? null : Icon(_documentIcon(job.documentType)),
                title: Text(
                  job.documentType.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: compact
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${controller.printerName(job.printerId)} · '
                            '${job.attempts}/${job.maxAttempts} '
                            'tentativi',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 4),
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Chip(label: Text(job.status.label)),
                          ),
                        ],
                      )
                    : Text(
                        '${controller.printerName(job.printerId)} · '
                        '${job.attempts}/${job.maxAttempts} '
                        'tentativi',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                trailing: compact ? null : Chip(label: Text(job.status.label)),
                isThreeLine: compact,
                onTap: controller.busy
                    ? null
                    : () => controller.selectJob(job.id),
              );
            },
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
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxWidth < 620;
          if (compact) {
            return ListView(
              key: const Key('compact-print-job-detail-scroll'),
              padding: const EdgeInsets.all(16),
              children: [
                _buildHeader(context, job, compact: true),
                if (job.lastError != null) ...[
                  const SizedBox(height: 10),
                  Text('Ultimo errore: ${job.lastError}'),
                ],
                const Divider(height: 24),
                Text(
                  'Documento',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                SizedBox(height: 240, child: _renderedDocument(context, job)),
                const Divider(height: 24),
                Text(
                  'Tentativi',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                _attemptHistory(job, shrinkWrap: true),
                const Divider(height: 24),
                _actions(context, job),
              ],
            );
          }

          return Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(context, job, compact: false),
                if (job.lastError != null) ...[
                  const SizedBox(height: 10),
                  Text('Ultimo errore: ${job.lastError}'),
                ],
                const Divider(height: 24),
                Expanded(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(flex: 3, child: _renderedDocument(context, job)),
                      const SizedBox(width: 12),
                      Expanded(
                        flex: 2,
                        child: _attemptHistory(job, shrinkWrap: false),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 24),
                _actions(context, job),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildHeader(
    BuildContext context,
    PrintJob job, {
    required bool compact,
  }) {
    final identity = Row(
      children: [
        Icon(_documentIcon(job.documentType)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                job.documentType.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              Text(
                '${controller.printerName(job.printerId)} · '
                'v${job.version}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );

    if (compact) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: identity),
              IconButton(
                tooltip: 'Chiudi dettaglio',
                onPressed: controller.busy ? null : controller.closeJob,
                icon: const Icon(Icons.close),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Chip(label: Text(job.status.label)),
        ],
      );
    }

    return Row(
      children: [
        Expanded(child: identity),
        Chip(label: Text(job.status.label)),
        IconButton(
          tooltip: 'Chiudi dettaglio',
          onPressed: controller.busy ? null : controller.closeJob,
          icon: const Icon(Icons.close),
        ),
      ],
    );
  }

  Widget _renderedDocument(BuildContext context, PrintJob job) => DecoratedBox(
    decoration: BoxDecoration(
      border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
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
  );

  Widget _attemptHistory(PrintJob job, {required bool shrinkWrap}) {
    if (job.attemptHistory.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text('Nessun tentativo registrato.'),
        ),
      );
    }
    return ListView.separated(
      shrinkWrap: shrinkWrap,
      physics: shrinkWrap ? const NeverScrollableScrollPhysics() : null,
      itemCount: job.attemptHistory.length,
      separatorBuilder: (context, index) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final attempt = job.attemptHistory[index];
        return ListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          title: Text(
            'Tentativo ${attempt.attemptNo} · '
            '${attempt.outcome.label}',
          ),
          subtitle: attempt.error == null ? null : Text(attempt.error!),
        );
      },
    );
  }

  Widget _actions(BuildContext context, PrintJob job) => Align(
    alignment: Alignment.centerRight,
    child: Wrap(
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
            onPressed: controller.busy ? null : () => controller.retryJob(job),
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
  );
}

Future<void> _cancelJob(
  BuildContext context,
  PrintingController controller,
  PrintJob job,
) async {
  var reasonText = '';
  final reason = await showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Annulla lavoro di stampa'),
      content: TextFormField(
        key: const Key('cancel-print-job-reason'),
        initialValue: reasonText,
        onChanged: (value) => reasonText = value,
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
          onPressed: () => Navigator.pop(dialogContext, reasonText),
          child: const Text('Annulla lavoro'),
        ),
      ],
    ),
  );
  if (reason != null) {
    await controller.cancelJob(job, reason);
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
