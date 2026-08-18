import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../health/data/health_api.dart';
import '../../health/domain/health_models.dart';

class OperatorDiagnosticsScreen extends ConsumerStatefulWidget {
  const OperatorDiagnosticsScreen({super.key});

  @override
  ConsumerState<OperatorDiagnosticsScreen> createState() =>
      _OperatorDiagnosticsScreenState();
}

class _OperatorDiagnosticsScreenState
    extends ConsumerState<OperatorDiagnosticsScreen> {
  OperationalHealth? _health;
  String? _error;
  bool _loading = false;
  String? _scheduledLocationId;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).state;
    final location = auth.deviceAssignment?.location;
    final session = auth.session;

    if (location == null || session == null) {
      return const Center(
        child: Text('Diagnostica non disponibile: postazione non configurata.'),
      );
    }

    _scheduleLoad(location.id);
    final health = _health;
    final ready = health != null &&
        health.apiStatus == HealthStatus.ok &&
        health.printerStatus != HealthStatus.down &&
        health.fiscalStatus != HealthStatus.down;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Diagnostica',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  Text('${location.name} · ${session.device.name}'),
                ],
              ),
            ),
            TextButton.icon(
              onPressed: () => context.go('/settings/manage'),
              icon: const Icon(Icons.tune),
              label: const Text('Dettagli tecnici'),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _OverallCard(ready: ready, loading: _loading, error: _error),
        const SizedBox(height: 14),
        if (health != null) ...[
          _HumanStatusRow(
            icon: Icons.cloud_done_outlined,
            title: 'Server Fluxa',
            value: _humanStatus(health.apiStatus),
            status: health.apiStatus,
            detail: '${health.apiLatencyMs} ms',
          ),
          _HumanStatusRow(
            icon: Icons.print_outlined,
            title: 'Stampanti',
            value: _printerLabel(health),
            status: health.printerStatus,
            detail: '${health.printerCount} configurate',
          ),
          _HumanStatusRow(
            icon: Icons.receipt_long_outlined,
            title: 'Scontrini fiscali',
            value: _fiscalLabel(health),
            status: health.fiscalStatus,
            detail: _providerLabel(health.fiscalProvider),
          ),
          _HumanStatusRow(
            icon: Icons.credit_card,
            title: 'Pagamenti con carta',
            value: _paymentLabel(health),
            status: _paymentDisplayStatus(health),
            detail: _paymentDetail(health),
          ),
        ] else if (_loading)
          const Padding(
            padding: EdgeInsets.all(32),
            child: Center(child: CircularProgressIndicator()),
          )
        else
          Card(
            child: ListTile(
              leading: const Icon(Icons.cloud_off_outlined),
              title: const Text('Impossibile controllare la postazione'),
              subtitle: Text(_error ?? 'Riprova tra poco.'),
            ),
          ),
        const SizedBox(height: 14),
        FilledButton.tonalIcon(
          onPressed: _loading ? null : () => _load(location.id),
          icon: const Icon(Icons.refresh),
          label: const Text('CONTROLLA ADESSO'),
        ),
        const SizedBox(height: 8),
        TextButton.icon(
          onPressed: auth.busy ? null : auth.refreshOperationalContext,
          icon: const Icon(Icons.sync),
          label: const Text('Ricarica configurazione della postazione'),
        ),
      ],
    );
  }

  void _scheduleLoad(String locationId) {
    if (_scheduledLocationId == locationId) return;
    _scheduledLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) => _load(locationId));
  }

  Future<void> _load(String locationId) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final health = await HealthApi(
        ref.read(apiClientProvider).dio,
      ).operational(locationId: locationId);
      if (!mounted) return;
      setState(() => _health = health);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _health = null;
        _error = 'Server Fluxa non raggiungibile. Controlla la connessione.';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _humanStatus(HealthStatus status) => switch (status) {
    HealthStatus.ok => 'Pronto',
    HealthStatus.degraded => 'Da controllare',
    HealthStatus.down => 'Non disponibile',
    HealthStatus.notConfigured => 'Non configurato',
    HealthStatus.unknown => 'Stato sconosciuto',
  };

  String _printerLabel(OperationalHealth health) {
    if (health.printerCount == 0) return 'Non configurate';
    return _humanStatus(health.printerStatus);
  }

  String _fiscalLabel(OperationalHealth health) =>
      _humanStatus(health.fiscalStatus);

  String _providerLabel(String? provider) => switch (provider) {
    'OPENAPI_SMART_RECEIPTS' => 'OpenAPI Smart Receipts',
    'ACUBE_SMART_RECEIPTS' => 'A-Cube Smart Receipts',
    'MOCK' => 'Ambiente di test',
    null => 'Nessun provider configurato',
    _ => provider!,
  };

  HealthStatus _paymentDisplayStatus(OperationalHealth health) {
    if (health.paymentProvider == null ||
        health.paymentProvider == 'MANUAL_TERMINAL') {
      return HealthStatus.ok;
    }
    return health.paymentStatus;
  }

  String _paymentLabel(OperationalHealth health) {
    final provider = health.paymentProvider;
    if (provider == null || provider == 'MANUAL_TERMINAL') {
      return 'Modalità manuale';
    }
    if (provider == 'EXTERNAL_TERMINAL') {
      return _humanStatus(health.paymentStatus);
    }
    return _humanStatus(health.paymentStatus);
  }

  String _paymentDetail(OperationalHealth health) {
    final provider = health.paymentProvider;
    if (provider == null || provider == 'MANUAL_TERMINAL') {
      return 'Il cassiere conferma l’esito mostrato sul POS bancario.';
    }
    if (provider == 'EXTERNAL_TERMINAL') {
      return 'Terminale di pagamento integrato';
    }
    return provider;
  }
}

class _OverallCard extends StatelessWidget {
  const _OverallCard({
    required this.ready,
    required this.loading,
    required this.error,
  });

  final bool ready;
  final bool loading;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final title = loading
        ? 'CONTROLLO IN CORSO'
        : error != null
        ? 'CONNESSIONE DA CONTROLLARE'
        : ready
        ? 'POSTAZIONE PRONTA'
        : 'SERVE ATTENZIONE';
    final subtitle = loading
        ? 'Fluxa sta verificando i servizi della postazione.'
        : error ??
              (ready
                  ? 'Puoi lavorare normalmente.'
                  : 'Guarda sotto quale servizio richiede attenzione.');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Icon(
              loading
                  ? Icons.sync
                  : ready
                  ? Icons.verified_outlined
                  : Icons.warning_amber,
              size: 48,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 4),
                  Text(subtitle),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HumanStatusRow extends StatelessWidget {
  const _HumanStatusRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.status,
    required this.detail,
  });

  final IconData icon;
  final String title;
  final String value;
  final HealthStatus status;
  final String detail;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
      leading: Icon(icon, size: 32),
      title: Text(title, style: Theme.of(context).textTheme.titleMedium),
      subtitle: Text(detail),
      trailing: _StatusBadge(status: status, label: value),
    ),
  );
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status, required this.label});

  final HealthStatus status;
  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final background = switch (status) {
      HealthStatus.ok => scheme.primaryContainer,
      HealthStatus.degraded || HealthStatus.unknown => scheme.secondaryContainer,
      HealthStatus.down => scheme.errorContainer,
      HealthStatus.notConfigured => scheme.surfaceContainerHighest,
    };
    return Container(
      constraints: const BoxConstraints(maxWidth: 180),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
    );
  }
}
