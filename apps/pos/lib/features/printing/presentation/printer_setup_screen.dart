// dart format off
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../domain/printing_models.dart';

class PrinterSetupScreen extends ConsumerStatefulWidget {
  const PrinterSetupScreen({super.key});

  @override
  ConsumerState<PrinterSetupScreen> createState() => _PrinterSetupScreenState();
}

class _PrinterSetupScreenState extends ConsumerState<PrinterSetupScreen> {
  bool _busy = false;
  String? _error;
  String? _notice;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).state;
    final printing = ref.watch(printingControllerProvider);
    final session = auth.session;
    final location = auth.deviceAssignment?.location;
    final canManage = {'OWNER', 'ADMIN', 'MANAGER'}.contains(session?.role);

    if (session == null || location == null) {
      return const Scaffold(
        body: FluxaEmptyView(
          icon: Icons.print_disabled_outlined,
          title: 'Configurazione stampanti non disponibile',
          message: 'Completa prima il contesto operativo del POS.',
        ),
      );
    }

    if (!canManage) {
      return Scaffold(
        appBar: AppBar(
          title: const Text('Configura stampanti'),
          leading: IconButton(
            onPressed: () => context.pop(),
            icon: const Icon(Icons.arrow_back),
          ),
        ),
        body: const FluxaEmptyView(
          icon: Icons.lock_outline,
          title: 'Permessi insufficienti',
          message:
              'La configurazione è riservata a proprietari, amministratori e manager.',
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Configura stampanti'),
        leading: IconButton(
          onPressed: () => context.pop(),
          icon: const Icon(Icons.arrow_back),
        ),
        actions: [
          IconButton(
            tooltip: 'Aggiorna',
            onPressed: _busy ? null : printing.refresh,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Stampanti del POS',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${location.name} · crea qui la stampante logica e assegnala a questo dispositivo. '
                    'Il collegamento Wi-Fi/Bluetooth e la pagina di test restano nella sezione Stampa.',
                  ),
                  const SizedBox(height: 14),
                  FilledButton.icon(
                    onPressed: _busy
                        ? null
                        : () => _createPrinter(
                            locationId: location.id,
                            deviceId: session.device.id,
                          ),
                    icon: const Icon(Icons.add),
                    label: const Text('Nuova stampante'),
                  ),
                ],
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: const Icon(Icons.error_outline),
                title: const Text('Operazione non completata'),
                subtitle: Text(_error!),
              ),
            ),
          ],
          if (_notice != null) ...[
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: const Icon(Icons.check_circle_outline),
                title: const Text('Configurazione aggiornata'),
                subtitle: Text(_notice!),
              ),
            ),
          ],
          const SizedBox(height: 12),
          for (final printer in printing.printers)
            _PrinterCard(
              printer: printer,
              currentDeviceId: session.device.id,
              busy: _busy,
              onAssign: () => _updatePrinter(
                printer,
                agentDeviceId: session.device.id,
                notice: 'Stampante assegnata a questo POS.',
              ),
              onConfigure: () => _configurePrinter(printer),
              onToggle: () => _updatePrinter(
                printer,
                status: printer.status == PrinterStatus.active
                    ? 'DISABLED'
                    : 'ACTIVE',
                notice: printer.status == PrinterStatus.active
                    ? 'Stampante disabilitata.'
                    : 'Stampante riattivata.',
              ),
            ),
          if (printing.printers.isEmpty)
            const Card(
              child: ListTile(
                leading: Icon(Icons.print_outlined),
                title: Text('Nessuna stampante configurata'),
                subtitle: Text('Crea la prima stampante per questo POS.'),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _createPrinter({
    required String locationId,
    required String deviceId,
  }) async {
    final values = await _showPrinterDialog(context);
    if (values == null) return;
    await _run(() async {
      await ref
          .read(printerSetupApiProvider)
          .create(
            locationId: locationId,
            agentDeviceId: deviceId,
            code: values.code,
            name: values.name,
            purpose: values.purpose,
            paperWidthMm: values.paperWidthMm,
          );
      await ref.read(printingControllerProvider).refresh();
    }, 'Stampante creata. Ora completa Wi-Fi/Bluetooth nella sezione Stampa.');
  }

  Future<void> _configurePrinter(PrinterDevice printer) async {
    final values = await _showPrinterConfigurationDialog(context, printer);
    if (values == null) return;
    await _run(() async {
      await ref
          .read(printerSetupApiProvider)
          .update(
            printer.id,
            paperWidthMm: values.paperWidthMm,
            supportsCut: values.supportsCut,
          );
      await ref.read(printingControllerProvider).refresh();
    }, 'Formato stampante aggiornato a ${values.paperWidthMm} mm.');
  }

  Future<void> _updatePrinter(
    PrinterDevice printer, {
    String? agentDeviceId,
    String? status,
    required String notice,
  }) async {
    await _run(() async {
      await ref
          .read(printerSetupApiProvider)
          .update(
            printer.id,
            agentDeviceId: agentDeviceId,
            status: status,
          );
      await ref.read(printingControllerProvider).refresh();
    }, notice);
  }

  Future<void> _run(Future<void> Function() action, String notice) async {
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      await action();
      if (mounted) setState(() => _notice = notice);
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _PrinterCard extends StatelessWidget {
  const _PrinterCard({
    required this.printer,
    required this.currentDeviceId,
    required this.busy,
    required this.onAssign,
    required this.onConfigure,
    required this.onToggle,
  });

  final PrinterDevice printer;
  final String currentDeviceId;
  final bool busy;
  final VoidCallback onAssign;
  final VoidCallback onConfigure;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final assignedHere = printer.agentDeviceId == currentDeviceId;
    final configuredWidth = printer.paperWidthMm <= 58 ? 58 : 80;
    return Card(
      child: ListTile(
        leading: Icon(
          printer.status == PrinterStatus.active
              ? Icons.print
              : Icons.print_disabled,
        ),
        title: Text('${printer.name} · ${printer.code}'),
        subtitle: Text(
          '${printer.purpose.label} · $configuredWidth mm · ${printer.charactersPerLine} caratteri · '
          '${printer.status.label} · '
          '${assignedHere ? 'assegnata a questo POS' : printer.agentDeviceId == null ? 'non assegnata' : 'assegnata a un altro POS'}',
        ),
        trailing: Wrap(
          spacing: 6,
          children: [
            OutlinedButton.icon(
              onPressed: busy ? null : onConfigure,
              icon: const Icon(Icons.straighten),
              label: const Text('Formato'),
            ),
            if (!assignedHere)
              OutlinedButton(
                onPressed: busy ? null : onAssign,
                child: const Text('Assegna qui'),
              ),
            OutlinedButton(
              onPressed: busy ? null : onToggle,
              child: Text(
                printer.status == PrinterStatus.active
                    ? 'Disabilita'
                    : 'Riattiva',
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PrinterValues {
  const _PrinterValues({
    required this.code,
    required this.name,
    required this.purpose,
    required this.paperWidthMm,
  });

  final String code;
  final String name;
  final String purpose;
  final int paperWidthMm;
}

class _PrinterConfigurationValues {
  const _PrinterConfigurationValues({
    required this.paperWidthMm,
    required this.supportsCut,
  });

  final int paperWidthMm;
  final bool supportsCut;
}

Future<_PrinterValues?> _showPrinterDialog(BuildContext context) {
  var code = '';
  var name = '';
  var purpose = 'RECEIPT';
  var paperWidthMm = 80;
  return showDialog<_PrinterValues>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setDialogState) => AlertDialog(
        title: const Text('Nuova stampante'),
        content: SizedBox(
          width: 440,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                decoration: const InputDecoration(labelText: 'Codice'),
                onChanged: (value) => setDialogState(() => code = value),
              ),
              TextField(
                decoration: const InputDecoration(labelText: 'Nome'),
                onChanged: (value) => setDialogState(() => name = value),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: purpose,
                decoration: const InputDecoration(labelText: 'Utilizzo'),
                items: const [
                  DropdownMenuItem(
                    value: 'RECEIPT',
                    child: Text('Ricevute'),
                  ),
                  DropdownMenuItem(
                    value: 'KITCHEN',
                    child: Text('Cucina'),
                  ),
                  DropdownMenuItem(
                    value: 'LABEL',
                    child: Text('Etichette'),
                  ),
                  DropdownMenuItem(
                    value: 'GENERIC',
                    child: Text('Generica'),
                  ),
                ],
                onChanged: (value) =>
                    setDialogState(() => purpose = value ?? purpose),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<int>(
                value: paperWidthMm,
                decoration: const InputDecoration(
                  labelText: 'Larghezza carta',
                  helperText: 'Fluxa adatta automaticamente il layout fiscale.',
                ),
                items: const [
                  DropdownMenuItem(value: 58, child: Text('58 mm')),
                  DropdownMenuItem(value: 80, child: Text('80 mm')),
                ],
                onChanged: (value) => setDialogState(
                  () => paperWidthMm = value ?? paperWidthMm,
                ),
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
            onPressed: code.trim().isEmpty || name.trim().length < 2
                ? null
                : () => Navigator.pop(
                    dialogContext,
                    _PrinterValues(
                      code: code,
                      name: name,
                      purpose: purpose,
                      paperWidthMm: paperWidthMm,
                    ),
                  ),
            child: const Text('Crea'),
          ),
        ],
      ),
    ),
  );
}

Future<_PrinterConfigurationValues?> _showPrinterConfigurationDialog(
  BuildContext context,
  PrinterDevice printer,
) {
  var paperWidthMm = printer.paperWidthMm <= 58 ? 58 : 80;
  var supportsCut = printer.supportsCut;
  return showDialog<_PrinterConfigurationValues>(
    context: context,
    builder: (dialogContext) => StatefulBuilder(
      builder: (context, setDialogState) => AlertDialog(
        title: Text('Formato · ${printer.name}'),
        content: SizedBox(
          width: 420,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<int>(
                value: paperWidthMm,
                decoration: const InputDecoration(
                  labelText: 'Larghezza carta',
                  helperText: '58 mm = 32 caratteri · 80 mm = 48 caratteri',
                ),
                items: const [
                  DropdownMenuItem(value: 58, child: Text('58 mm')),
                  DropdownMenuItem(value: 80, child: Text('80 mm')),
                ],
                onChanged: (value) => setDialogState(
                  () => paperWidthMm = value ?? paperWidthMm,
                ),
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Taglierina automatica'),
                value: supportsCut,
                onChanged: (value) =>
                    setDialogState(() => supportsCut = value),
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
            onPressed: () => Navigator.pop(
              dialogContext,
              _PrinterConfigurationValues(
                paperWidthMm: paperWidthMm,
                supportsCut: supportsCut,
              ),
            ),
            child: const Text('Salva'),
          ),
        ],
      ),
    ),
  );
}
// dart format on