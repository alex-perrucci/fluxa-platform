import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../core/di/providers.dart';
import '../../health/data/health_api.dart';
import '../../health/domain/health_models.dart';

// dart format off
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  OperationalHealth? _health;
  Object? _error;
  bool _loading = false;
  bool _networkOnline = true;

  Future<void> _load() async {
    final locationId = ref
        .read(authControllerProvider)
        .state
        .deviceAssignment
        ?.location
        ?.id;
    if (locationId == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final health = await HealthApi(
        ref.read(apiClientProvider).dio,
      ).operational(locationId: locationId);
      if (!mounted) return;
      setState(() {
        _health = health;
        _networkOnline = true;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _networkOnline = false;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  @override
  Widget build(BuildContext context) {
    final config = ref.watch(appConfigProvider);
    final authController = ref.watch(authControllerProvider);
    final state = authController.state;
    final session = state.session;
    if (session == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final assignment = state.deviceAssignment;
    final location = assignment?.location;
    final canManagePrinters = {'OWNER', 'ADMIN', 'MANAGER'}.contains(session.role);

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Diagnostica POS',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 4),
        const Text(
          'Catalogo, prezzi, locale, cucina e routing sono configurati nel Venue Control Center. '
          'Sul POS restano diagnostica e associazione fisica delle stampanti.',
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                _Row(label: 'Ambiente', value: config.environmentName),
                FutureBuilder<PackageInfo>(
                  future: PackageInfo.fromPlatform(),
                  builder: (context, snapshot) => _Row(
                    label: 'Versione',
                    value: snapshot.hasData
                        ? '${snapshot.data!.version}+${snapshot.data!.buildNumber}'
                        : 'Caricamento…',
                  ),
                ),
                _Row(label: 'Device', value: session.device.name),
                _Row(
                  label: 'Modalità',
                  value: assignment?.assignment.operatorMode.wireValue ?? 'AUTO',
                ),
                _Row(
                  label: 'Sede',
                  value: location == null
                      ? 'Non assegnata'
                      : '${location.code} — ${location.name}',
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (_loading) const LinearProgressIndicator(),
        if (_error != null)
          Card(
            child: ListTile(
              leading: const Icon(Icons.cloud_off),
              title: const Text('API non raggiungibile'),
              subtitle: Text(_error.toString()),
            ),
          ),
        if (_health case final health?)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  _StatusRow(
                    label: 'Rete',
                    status: _networkOnline
                        ? HealthStatus.ok
                        : HealthStatus.down,
                  ),
                  _StatusRow(label: 'API', status: health.apiStatus),
                  _Row(label: 'Latenza API', value: '${health.apiLatencyMs} ms'),
                  _StatusRow(
                    label: 'Stampanti',
                    status: health.printerStatus,
                    detail: '${health.printerCount} configurate',
                  ),
                  _StatusRow(
                    label: 'Fiscal worker',
                    status: health.fiscalStatus,
                    detail: health.fiscalProvider ?? 'Non configurato',
                  ),
                  _StatusRow(
                    label: 'Terminale',
                    status: health.paymentStatus,
                    detail: health.paymentProvider ?? 'Non configurato',
                  ),
                  _StatusRow(
                    label: 'Complessivo',
                    status: health.overallStatus,
                  ),
                ],
              ),
            ),
          ),
        if (_health?.lastPrintJob case final job?)
          Card(
            child: ListTile(
              leading: const Icon(Icons.print),
              title: const Text('Ultimo job di stampa'),
              subtitle: Text(
                '${job['printerName'] ?? ''} · '
                '${job['documentType'] ?? ''} · '
                '${job['status'] ?? ''}',
              ),
            ),
          ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Ripristino',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                for (final suggestion in
                    _health?.suggestions ??
                        const ['Aggiorna la diagnostica per ricevere indicazioni.'])
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Text('• $suggestion'),
                  ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _loading ? null : _load,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Aggiorna diagnostica'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _health == null
                      ? null
                      : () async {
                          await Clipboard.setData(
                            ClipboardData(
                              text: _health!.exportJson(
                                networkOnline: _networkOnline,
                              ),
                            ),
                          );
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Diagnostica JSON copiata senza segreti.',
                                ),
                              ),
                            );
                          }
                        },
                  icon: const Icon(Icons.copy),
                  label: const Text('Copia diagnostica JSON'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: const Key('refresh-operational-context'),
                  onPressed: state.busy
                      ? null
                      : authController.refreshOperationalContext,
                  icon: const Icon(Icons.sync),
                  label: const Text('Sincronizza configurazione web'),
                ),
                if (canManagePrinters) ...[
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    key: const Key('configure-printers'),
                    onPressed: state.busy ? null : () => context.push('/printer-setup'),
                    icon: const Icon(Icons.print_outlined),
                    label: const Text('Configura stampanti'),
                  ),
                ],
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: state.busy ? null : authController.logout,
                  icon: const Icon(Icons.logout),
                  label: const Text('Esci'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.label,
    required this.status,
    this.detail,
  });

  final String label;
  final HealthStatus status;
  final String? detail;

  @override
  Widget build(BuildContext context) => _Row(
    label: label,
    value: detail == null
        ? status.wireValue
        : '${status.wireValue} · $detail',
  );
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 118, child: Text(label)),
        Expanded(child: SelectableText(value, maxLines: 4)),
      ],
    ),
  );
}
// dart format on
