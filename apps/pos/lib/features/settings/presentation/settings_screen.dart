import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../../core/di/providers.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  late final TextEditingController _deviceName;

  @override
  void initState() {
    super.initState();
    _deviceName = TextEditingController();
  }

  @override
  void dispose() {
    _deviceName.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final config = ref.watch(appConfigProvider);
    final authController = ref.watch(authControllerProvider);
    final state = authController.state;
    final session = state.session!;
    final contextAssignment = state.deviceAssignment;
    final location = contextAssignment?.location;
    if (_deviceName.text.isEmpty) {
      _deviceName.text = session.device.name;
    }
    final themeController = ref.watch(themeControllerProvider);

    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(
          'Impostazioni tecniche',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 20),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                _Row(label: 'Ambiente', value: config.environmentName),
                _Row(label: 'API URL', value: config.apiBaseUrl),
                FutureBuilder<PackageInfo>(
                  future: PackageInfo.fromPlatform(),
                  builder: (context, snapshot) => _Row(
                    label: 'Versione app',
                    value: snapshot.hasData
                        ? '${snapshot.data!.version}+${snapshot.data!.buildNumber}'
                        : 'Caricamento…',
                  ),
                ),
                _Row(label: 'Device ID', value: session.device.id),
                _Row(
                  label: 'Installation ID',
                  value: session.device.installationId,
                ),
                _Row(label: 'Piattaforma', value: session.device.platform),
                _Row(
                  label: 'Modello',
                  value: session.device.model ?? 'Non disponibile',
                ),
                _Row(
                  label: 'Stato operativo',
                  value:
                      contextAssignment?.operationalStatus.wireValue ??
                      state.status.name,
                ),
                _Row(
                  label: 'Organization ID',
                  value: session.organizationId ?? 'Non selezionata',
                ),
                _Row(
                  label: 'Location ID',
                  value: location?.id ?? 'Non assegnata',
                ),
                _Row(
                  label: 'Location',
                  value: location == null
                      ? 'Non disponibile'
                      : '${location.code} — ${location.name}',
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Nome dispositivo',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _deviceName,
                  decoration: const InputDecoration(labelText: 'Nome'),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: state.busy
                      ? null
                      : () => authController.updateDeviceName(_deviceName.text),
                  child: const Text('Aggiorna dispositivo'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: state.busy
                      ? null
                      : authController.refreshOperationalContext,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Aggiorna contesto operativo'),
                ),
              ],
            ),
          ),
        ),
        if ({'OWNER', 'ADMIN', 'MANAGER'}.contains(session.role)) ...[
          const SizedBox(height: 16),
          Card(
            child: Column(
              children: [
                ListTile(
                  key: const Key('open-admin-page'),
                  leading: const Icon(Icons.admin_panel_settings_outlined),
                  title: const Text('Configurazione amministrativa'),
                  subtitle: const Text(
                    'Crea utenti, catalogo, listini, tavoli, cucina, stampanti e configurazione fiscale.',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/admin'),
                ),
                const Divider(height: 1),
                ListTile(
                  key: const Key('open-admin-management-page'),
                  leading: const Icon(Icons.tune_outlined),
                  title: const Text('Gestisci e modifica dati'),
                  subtitle: const Text(
                    'Modifica, archivia o disattiva entità e configura graficamente le rotte di stampa.',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/admin/manage'),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Tema', style: Theme.of(context).textTheme.titleLarge),
                RadioListTile<ThemeMode>(
                  value: ThemeMode.system,
                  groupValue: themeController.mode,
                  onChanged: (value) {
                    if (value != null) {
                      themeController.setMode(value);
                    }
                  },
                  title: const Text('Sistema'),
                ),
                RadioListTile<ThemeMode>(
                  value: ThemeMode.light,
                  groupValue: themeController.mode,
                  onChanged: (value) {
                    if (value != null) {
                      themeController.setMode(value);
                    }
                  },
                  title: const Text('Chiaro'),
                ),
                RadioListTile<ThemeMode>(
                  value: ThemeMode.dark,
                  groupValue: themeController.mode,
                  onChanged: (value) {
                    if (value != null) {
                      themeController.setMode(value);
                    }
                  },
                  title: const Text('Scuro'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: state.busy ? null : authController.logout,
          icon: const Icon(Icons.logout),
          label: const Text('Esci'),
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
        SizedBox(width: 140, child: Text(label)),
        Expanded(child: SelectableText(value)),
      ],
    ),
  );
}
