import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../orders/domain/order_models.dart';
import '../domain/fiscal_models.dart';
import '../domain/fiscal_runtime.dart';
import 'fiscal_controller.dart';
import 'fiscal_screen.dart';

class OperatorFiscalScreen extends ConsumerStatefulWidget {
  const OperatorFiscalScreen({super.key});

  @override
  ConsumerState<OperatorFiscalScreen> createState() =>
      _OperatorFiscalScreenState();
}

class _OperatorFiscalScreenState extends ConsumerState<OperatorFiscalScreen> {
  String? _scheduledLocationId;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider).state;
    final fiscal = ref.watch(fiscalControllerProvider);
    final location = auth.deviceAssignment?.location;

    if (location == null) {
      return const FluxaEmptyView(
        icon: Icons.receipt_long_outlined,
        title: 'Fiscale non disponibile',
        message: 'Questa postazione non è ancora associata a una sede.',
      );
    }

    _scheduleLoad(location.id, fiscal);
    if (fiscal.locationId != location.id ||
        (fiscal.status == FiscalLoadStatus.loading &&
            fiscal.documents.isEmpty &&
            fiscal.runtime == null)) {
      return const FluxaLoadingView(label: 'Controllo scontrini fiscali');
    }

    final documents = fiscal.documents;
    final problems = documents
        .where((document) => document.status.requiresAttention)
        .toList(growable: false);
    final pending = documents
        .where((document) => document.status.isPending)
        .toList(growable: false);
    final missing = fiscal.ordersToFiscalize;
    final runtime = fiscal.runtime;
    final allGood =
        runtime?.isReady == true &&
        problems.isEmpty &&
        pending.isEmpty &&
        missing.isEmpty &&
        fiscal.errorMessage == null;

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
                    'Fiscale',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const Text(
                    'Qui devi intervenire solo se Fluxa segnala un problema.',
                  ),
                ],
              ),
            ),
            TextButton.icon(
              onPressed: () => context.go('/fiscal/manage'),
              icon: const Icon(Icons.tune),
              label: const Text('Storico e gestione'),
            ),
          ],
        ),
        const SizedBox(height: 14),
        OperatorFiscalSummary(
          runtime: runtime,
          allGood: allGood,
          missingCount: missing.length,
          pendingCount: pending.length,
          problemCount: problems.length,
          errorMessage: fiscal.errorMessage,
        ),
        if (missing.isNotEmpty) ...[
          const SizedBox(height: 14),
          _ExceptionCard(
            title: 'Scontrini da recuperare',
            message:
                'Il pagamento è concluso, ma per queste vendite non risulta ancora un documento fiscale.',
            children: missing
                .map(
                  (order) => _MissingFiscalOrder(
                    order: order,
                    busy: fiscal.busy,
                    onRecover: () => _recover(location.id, order),
                  ),
                )
                .toList(growable: false),
          ),
        ],
        if (problems.isNotEmpty) ...[
          const SizedBox(height: 14),
          _ExceptionCard(
            title: 'Richiedono attenzione',
            message:
                'Apri la gestione fiscale per vedere errore e azioni disponibili. Gli esiti UNKNOWN non vanno ritentati automaticamente.',
            children: problems
                .map(
                  (document) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      document.status == FiscalDocumentStatus.unknown
                          ? Icons.help_outline
                          : document.status == FiscalDocumentStatus.authRequired
                          ? Icons.lock_outline
                          : Icons.error_outline,
                    ),
                    title: Text(document.documentNumber ?? 'Documento fiscale'),
                    subtitle: Text(document.status.label),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.go('/fiscal/manage'),
                  ),
                )
                .toList(growable: false),
          ),
        ],
        if (pending.isNotEmpty) ...[
          const SizedBox(height: 14),
          Card(
            child: ListTile(
              leading: const Icon(Icons.hourglass_top),
              title: Text('${pending.length} scontrini in elaborazione'),
              subtitle: const Text(
                'Fluxa continua a controllarli automaticamente.',
              ),
              trailing: const CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        ],
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: fiscal.busy ? null : _refreshRuntime,
          icon: const Icon(Icons.refresh),
          label: const Text('Controlla adesso'),
        ),
      ],
    );
  }

  void _scheduleLoad(String locationId, FiscalController fiscal) {
    if (_scheduledLocationId == locationId &&
        fiscal.locationId == locationId &&
        fiscal.statusFilter == null &&
        fiscal.typeFilter == null) {
      return;
    }
    _scheduledLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      fiscal.setStatusFilter(null);
      fiscal.setTypeFilter(null);
      if (fiscal.locationId == locationId) {
        await fiscal.refresh(silent: true);
      } else {
        await fiscal.bindLocation(locationId);
      }
      if (mounted) setState(() {});
    });
  }

  Future<void> _refreshRuntime() async {
    final auth = ref.read(authControllerProvider);
    await auth.refreshOperationalContext();
    if (!mounted) return;

    final fiscal = ref.read(fiscalControllerProvider);
    final location = auth.state.deviceAssignment?.location;
    if (location == null) {
      fiscal.clearContext();
      return;
    }

    _scheduledLocationId = location.id;
    if (fiscal.locationId == location.id) {
      await fiscal.refresh();
    } else {
      await fiscal.bindLocation(location.id);
    }
  }

  Future<void> _recover(String locationId, OrderHeader order) async {
    final lotteryCode = await showLotteryCodeDialog(context, order.number);
    if (lotteryCode == null || !mounted) return;
    await ref
        .read(posWorkflowCoordinatorProvider)
        .recoverFiscalDocument(
          locationId: locationId,
          orderId: order.id,
          lotteryCode: lotteryCode,
        );
    if (!mounted) return;
    await ref.read(fiscalControllerProvider).refresh(silent: true);
  }
}

class OperatorFiscalSummary extends StatelessWidget {
  const OperatorFiscalSummary({
    required this.runtime,
    required this.allGood,
    required this.missingCount,
    required this.pendingCount,
    required this.problemCount,
    required this.errorMessage,
    super.key,
  });

  final FiscalRuntimeConfiguration? runtime;
  final bool allGood;
  final int missingCount;
  final int pendingCount;
  final int problemCount;
  final String? errorMessage;

  @override
  Widget build(BuildContext context) {
    final runtimeStatus = runtime?.status;
    final verificationError =
        runtimeStatus == FiscalRuntimeStatus.verificationError;
    final configurationAttention = switch (runtimeStatus) {
      FiscalRuntimeStatus.notConfigured ||
      FiscalRuntimeStatus.disabled ||
      FiscalRuntimeStatus.authRequired ||
      FiscalRuntimeStatus.attention => true,
      _ => false,
    };
    final attention =
        configurationAttention || missingCount > 0 || problemCount > 0;

    final title = verificationError
        ? 'VERIFICA NON DISPONIBILE'
        : allGood
        ? 'OPERATIVO'
        : attention
        ? 'SERVE ATTENZIONE'
        : 'ELABORAZIONE IN CORSO';
    final message = switch (runtimeStatus) {
      FiscalRuntimeStatus.notConfigured =>
        'La fiscalizzazione non è configurata per questa sede.',
      FiscalRuntimeStatus.disabled =>
        'La fiscalizzazione è configurata ma al momento è disabilitata.',
      FiscalRuntimeStatus.authRequired =>
        'È necessario ripristinare l’accesso fiscale. Contatta l’assistenza Fluxa.',
      FiscalRuntimeStatus.attention =>
        'Esiste un esito fiscale da verificare. Non ripetere automaticamente l’emissione.',
      FiscalRuntimeStatus.verificationError =>
        runtime?.errorMessage ??
            'Impossibile verificare lo stato fiscale. Controlla la connessione o riprova.',
      FiscalRuntimeStatus.ready when errorMessage != null => errorMessage!,
      FiscalRuntimeStatus.ready when missingCount > 0 || problemCount > 0 =>
        '$missingCount da recuperare · $problemCount con errore',
      FiscalRuntimeStatus.ready when pendingCount > 0 =>
        '$pendingCount scontrini stanno terminando automaticamente.',
      FiscalRuntimeStatus.ready => runtime?.autoIssueOnPaid == true
          ? 'La fiscalizzazione è attiva. Gli scontrini vengono emessi automaticamente al pagamento.'
          : 'La fiscalizzazione è attiva. L’emissione automatica non è attiva.',
      null => errorMessage ?? 'Verifica dello stato fiscale in corso.',
    };

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              allGood
                  ? Icons.verified_outlined
                  : verificationError
                  ? Icons.cloud_off_outlined
                  : attention
                  ? Icons.warning_amber
                  : Icons.hourglass_top,
              size: 48,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 4),
                  Text(message),
                  if (runtime?.provider != null &&
                      runtime?.environment != null) ...[
                    const SizedBox(height: 12),
                    Text('Provider: ${runtime!.provider!.label}'),
                    Text('Ambiente: ${runtime!.environment!.label}'),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ExceptionCard extends StatelessWidget {
  const _ExceptionCard({
    required this.title,
    required this.message,
    required this.children,
  });

  final String title;
  final String message;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(message),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    ),
  );
}

class _MissingFiscalOrder extends StatelessWidget {
  const _MissingFiscalOrder({
    required this.order,
    required this.busy,
    required this.onRecover,
  });

  final OrderHeader order;
  final bool busy;
  final VoidCallback onRecover;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: const Icon(Icons.receipt_long_outlined),
    title: Text(order.number),
    subtitle: Text(formatOrderMoney(order.totalCents, order.currency)),
    trailing: FilledButton.tonal(
      onPressed: busy ? null : onRecover,
      child: const Text('Recupera'),
    ),
  );
}
