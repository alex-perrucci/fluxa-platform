import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/di/providers.dart';
import '../../../core/widgets/async_states.dart';
import '../../orders/domain/order_models.dart';
import '../domain/fiscal_models.dart';
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
            fiscal.profile == null)) {
      return const FluxaLoadingView(label: 'Controllo scontrini fiscali');
    }

    final documents = fiscal.documents;
    final problems = documents
        .where(
          (document) =>
              document.status == FiscalDocumentStatus.rejected ||
              document.status == FiscalDocumentStatus.cancelled,
        )
        .toList(growable: false);
    final pending = documents
        .where((document) => document.status.isPending)
        .toList(growable: false);
    final missing = fiscal.ordersToFiscalize;
    final profileReady = fiscal.profile?.enabled == true;
    final allGood =
        profileReady &&
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
        _FiscalSummary(
          allGood: allGood,
          profileReady: profileReady,
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
                'Apri la gestione fiscale per vedere errore e azioni disponibili.',
            children: problems
                .map(
                  (document) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.error_outline),
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
          onPressed: fiscal.busy ? null : () => fiscal.refresh(),
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

class _FiscalSummary extends StatelessWidget {
  const _FiscalSummary({
    required this.allGood,
    required this.profileReady,
    required this.missingCount,
    required this.pendingCount,
    required this.problemCount,
    required this.errorMessage,
  });

  final bool allGood;
  final bool profileReady;
  final int missingCount;
  final int pendingCount;
  final int problemCount;
  final String? errorMessage;

  @override
  Widget build(BuildContext context) {
    final attention =
        !allGood && (missingCount > 0 || problemCount > 0 || !profileReady);
    final title = allGood
        ? 'TUTTO A POSTO'
        : attention
        ? 'SERVE ATTENZIONE'
        : 'ELABORAZIONE IN CORSO';
    final message = !profileReady
        ? 'La fiscalizzazione non è configurata per questa sede.'
        : errorMessage != null
        ? errorMessage!
        : missingCount > 0 || problemCount > 0
        ? '$missingCount da recuperare · $problemCount con errore'
        : '$pendingCount scontrini stanno terminando automaticamente.';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Icon(
              allGood
                  ? Icons.verified_outlined
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
