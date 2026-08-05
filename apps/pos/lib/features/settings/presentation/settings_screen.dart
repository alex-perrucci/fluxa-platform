import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../core/di/providers.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider);
    final authController = ref.watch(authControllerProvider);
    final state = authController.state;
    final session = state.session!;
    final assignment = state.deviceAssignment;
    final location = assignment?.location;

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Diagnostica POS',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 4),
        const Text(
          'La configurazione di dispositivo, stampanti e fiscale viene gestita dal Control Center web.',
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                _Row(label: 'Ambiente', value: config.environmentName),
                _Row(label: 'API', value: config.apiBaseUrl),
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
                _Row(label: 'Device ID', value: session.device.id),
                _Row(
                  label: 'Modalità',
                  value:
                      assignment?.assignment.operatorMode.wireValue ?? 'AUTO',
                ),
                _Row(
                  label: 'Stato',
                  value:
                      assignment?.operationalStatus.wireValue ??
                      state.status.name,
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
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Azioni locali',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  key: const Key('refresh-operational-context'),
                  onPressed: state.busy
                      ? null
                      : authController.refreshOperationalContext,
                  icon: const Icon(Icons.sync),
                  label: const Text('Sincronizza configurazione web'),
                ),
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
        Expanded(child: SelectableText(value, maxLines: 3)),
      ],
    ),
  );
}
