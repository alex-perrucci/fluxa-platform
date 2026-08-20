import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/network/backend_error.dart';
import '../../../core/widgets/async_states.dart';
import '../../orders/domain/order_models.dart';
import '../data/fiscal_api.dart';
import '../domain/fiscal_models.dart';
import '../domain/fiscal_runtime.dart';
import '../platform/fiscal_receipt_pdf_handler.dart';
import 'fiscal_controller.dart';

class FiscalScreen extends ConsumerStatefulWidget {
  const FiscalScreen({super.key});

  @override
  ConsumerState<FiscalScreen> createState() => _FiscalScreenState();
}

class _FiscalScreenState extends ConsumerState<FiscalScreen> {
  String? _scheduledLocationId;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final controller = ref.watch(fiscalControllerProvider);
    final fiscalApi = ref.watch(fiscalApiProvider);
    final location = auth.state.deviceAssignment?.location;
    final role = auth.state.session?.role;
    if (!{
      'OWNER',
      'ADMIN',
      'MANAGER',
      'CASHIER',
      'ACCOUNTANT',
      'SUPPORT_READONLY',
    }.contains(role)) {
      return const FluxaEmptyView(
        icon: Icons.lock_outline,
        title: 'Accesso fiscale non autorizzato',
        message: 'Il ruolo corrente non può consultare i documenti fiscali.',
      );
    }
    if (location == null) {
      return const FluxaEmptyView(
        icon: Icons.storefront_outlined,
        title: 'Location non disponibile',
        message:
            'Completa il contesto operativo prima di aprire i documenti fiscali.',
      );
    }
    _scheduleBind(controller, location.id);
    if (controller.locationId != location.id) {
      return const FluxaLoadingView(label: 'Allineamento fiscale');
    }
    return FiscalView(
      controller: controller,
      locationName: location.name,
      role: role,
      downloadReceiptPdf: fiscalApi.downloadReceiptPdf,
    );
  }

  void _scheduleBind(FiscalController controller, String locationId) {
    if (controller.locationId == locationId ||
        _scheduledLocationId == locationId) {
      return;
    }
    _scheduledLocationId = locationId;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await controller.bindLocation(locationId);
      } finally {
        if (mounted && _scheduledLocationId == locationId) {
          setState(() => _scheduledLocationId = null);
        }
      }
    });
  }
}

class FiscalView extends StatelessWidget {
  const FiscalView({
    required this.controller,
    required this.locationName,
    required this.role,
    this.downloadReceiptPdf,
    super.key,
  });

  final FiscalController controller;
  final String locationName;
  final String? role;
  final Future<FiscalReceiptPdfData> Function(String documentId)?
  downloadReceiptPdf;

  bool get _canIssue => {'OWNER', 'ADMIN', 'MANAGER', 'CASHIER'}.contains(role);
  bool get _canRetry => {'OWNER', 'ADMIN', 'MANAGER'}.contains(role);
  bool get _canVoid => {'OWNER', 'ADMIN'}.contains(role);

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: controller,
    builder: (context, child) {
      if (controller.status == FiscalLoadStatus.loading &&
          controller.documents.isEmpty &&
          controller.runtime == null) {
        return const FluxaLoadingView(label: 'Caricamento fiscalizzazione');
      }
      return ListView(
        key: const Key('fiscal-screen-list'),
        padding: const EdgeInsets.all(20),
        children: [
          _FiscalHeader(locationName: locationName, controller: controller),
          const SizedBox(height: 12),
          if (controller.errorMessage != null)
            _MessageCard(
              message: controller.errorMessage!,
              error: true,
              onDismiss: controller.clearMessages,
            )
          else if (controller.noticeMessage != null)
            _MessageCard(
              message: controller.noticeMessage!,
              error: false,
              onDismiss: controller.clearMessages,
            ),
          if (controller.errorMessage != null ||
              controller.noticeMessage != null)
            const SizedBox(height: 12),
          _FiscalRuntimeCard(runtime: controller.runtime),
          const SizedBox(height: 16),
          _OrdersToFiscalizeCard(
            orders: controller.ordersToFiscalize,
            canIssue: _canIssue,
            busy: controller.busy,
            onIssue: (order) => _issue(context, order),
          ),
          const SizedBox(height: 16),
          _FiscalFilters(controller: controller),
          const SizedBox(height: 12),
          _DocumentsCard(
            controller: controller,
            canRetry: _canRetry,
            canVoid: _canVoid,
            downloadReceiptPdf: downloadReceiptPdf,
            onRetry: (document) => _retry(context, document),
            onVoid: (document) => _void(context, document),
          ),
        ],
      );
    },
  );

  Future<void> _issue(BuildContext context, OrderHeader order) async {
    final lotteryCode = await showLotteryCodeDialog(context, order.number);
    if (lotteryCode == null || !context.mounted) return;
    final success = await controller.issueOrder(
      order.id,
      lotteryCode: lotteryCode,
    );
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            success
                ? controller.noticeMessage ?? 'Fiscalizzazione accodata.'
                : controller.errorMessage ?? 'Fiscalizzazione non riuscita.',
          ),
        ),
      );
    }
  }

  Future<void> _retry(BuildContext context, FiscalDocument document) async {
    final success = await controller.retryDocument(document);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            success
                ? 'Documento rimesso in coda.'
                : controller.errorMessage ?? 'Retry non riuscito.',
          ),
        ),
      );
    }
  }

  Future<void> _void(BuildContext context, FiscalDocument document) async {
    final reason = await showVoidFiscalDialog(context);
    if (reason == null || !context.mounted) return;
    final success = await controller.voidDocument(document, reason);
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            success
                ? 'Annullamento fiscale accodato.'
                : controller.errorMessage ?? 'Annullamento non riuscito.',
          ),
        ),
      );
    }
  }
}

class _FiscalHeader extends StatelessWidget {
  const _FiscalHeader({required this.locationName, required this.controller});
  final String locationName;
  final FiscalController controller;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Documenti fiscali',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            Text('$locationName · ${controller.documents.length} documenti'),
          ],
        ),
      ),
      IconButton.filledTonal(
        key: const Key('fiscal-refresh-button'),
        tooltip: 'Aggiorna fiscalizzazione',
        onPressed: controller.busy ? null : () => controller.refresh(),
        icon: const Icon(Icons.refresh),
      ),
    ],
  );
}

class _FiscalRuntimeCard extends StatelessWidget {
  const _FiscalRuntimeCard({required this.runtime});
  final FiscalRuntimeConfiguration? runtime;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.account_balance_outlined),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Stato fiscale della sede',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              if (runtime != null)
                Chip(label: Text(runtime!.operatorStatusLabel)),
            ],
          ),
          const SizedBox(height: 10),
          if (runtime == null)
            const Text('Verifica della configurazione fiscale in corso.')
          else if (runtime!.status == FiscalRuntimeStatus.verificationError)
            Text(
              runtime!.errorMessage ??
                  'Impossibile verificare lo stato fiscale. Riprova.',
            )
          else if (runtime!.status == FiscalRuntimeStatus.notConfigured)
            const Text('Nessuna fiscalizzazione configurata per questa sede.')
          else ...[
            if (runtime!.provider != null && runtime!.environment != null)
              Text(
                '${runtime!.provider!.label} · ${runtime!.environment!.label}',
              ),
            Text(
              runtime!.autoIssueOnPaid
                  ? 'Emissione automatica al pagamento: attiva'
                  : 'Emissione automatica al pagamento: non attiva',
            ),
            if (runtime!.status == FiscalRuntimeStatus.authRequired)
              const Text(
                'È necessario ripristinare l’accesso fiscale tramite Fluxa.',
              ),
            if (runtime!.status == FiscalRuntimeStatus.attention)
              const Text(
                'L’ultimo esito fiscale richiede una verifica. Gli esiti UNKNOWN non vanno ritentati automaticamente.',
              ),
          ],
          const SizedBox(height: 10),
          const Text(
            'Le impostazioni tecniche del provider sono gestite dal Platform Control Center.',
          ),
        ],
      ),
    ),
  );
}

class _OrdersToFiscalizeCard extends StatelessWidget {
  const _OrdersToFiscalizeCard({
    required this.orders,
    required this.canIssue,
    required this.busy,
    required this.onIssue,
  });
  final List<OrderHeader> orders;
  final bool canIssue;
  final bool busy;
  final ValueChanged<OrderHeader> onIssue;

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Ordini pagati da fiscalizzare',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          if (orders.isEmpty)
            const Text('Nessun ordine pagato in attesa di fiscalizzazione.')
          else
            ...orders.map(
              (order) => ListTile(
                key: Key('fiscal-pending-order-${order.id}'),
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.receipt_long_outlined),
                title: Text(order.number),
                subtitle: Text(
                  '${order.businessDate} · ${formatFiscalMoney(order.totalCents, order.currency)}',
                ),
                trailing: FilledButton.tonal(
                  onPressed: !canIssue || busy ? null : () => onIssue(order),
                  child: const Text('Fiscalizza'),
                ),
              ),
            ),
          if (!canIssue && orders.isNotEmpty)
            const Text(
              'Il ruolo corrente può consultare i documenti ma non emetterli.',
            ),
        ],
      ),
    ),
  );
}

class _FiscalFilters extends StatelessWidget {
  const _FiscalFilters({required this.controller});
  final FiscalController controller;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      FilterChip(
        selected: controller.typeFilter == null,
        label: const Text('Tutti i tipi'),
        onSelected: controller.busy
            ? null
            : (_) => controller.setTypeFilter(null),
      ),
      ...FiscalDocumentType.values.map(
        (type) => FilterChip(
          selected: controller.typeFilter == type,
          label: Text(type.label),
          onSelected: controller.busy
              ? null
              : (_) => controller.setTypeFilter(type),
        ),
      ),
      const SizedBox(width: 8),
      FilterChip(
        selected: controller.statusFilter == null,
        label: const Text('Tutti gli stati'),
        onSelected: controller.busy
            ? null
            : (_) => controller.setStatusFilter(null),
      ),
      ...FiscalDocumentStatus.values.map(
        (status) => FilterChip(
          selected: controller.statusFilter == status,
          label: Text(status.label),
          onSelected: controller.busy
              ? null
              : (_) => controller.setStatusFilter(status),
        ),
      ),
    ],
  );
}

class _DocumentsCard extends StatelessWidget {
  const _DocumentsCard({
    required this.controller,
    required this.canRetry,
    required this.canVoid,
    required this.onRetry,
    required this.onVoid,
    this.downloadReceiptPdf,
  });
  final FiscalController controller;
  final bool canRetry;
  final bool canVoid;
  final ValueChanged<FiscalDocument> onRetry;
  final ValueChanged<FiscalDocument> onVoid;
  final Future<FiscalReceiptPdfData> Function(String documentId)?
  downloadReceiptPdf;

  @override
  Widget build(BuildContext context) {
    final selected = controller.selectedDocument;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Storico fiscale',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            if (controller.documents.isEmpty)
              const Text('Nessun documento fiscale disponibile.')
            else
              ...controller.documents.map(
                (document) => ListTile(
                  key: Key('fiscal-document-${document.id}'),
                  selected: selected?.id == document.id,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    document.type == FiscalDocumentType.sale
                        ? Icons.receipt_long_outlined
                        : Icons.undo_outlined,
                  ),
                  title: Text(document.documentNumber ?? document.id),
                  subtitle: Text(
                    '${document.type.label} · ${formatFiscalMoney(document.totalCents, document.currency)} · v${document.version}',
                  ),
                  trailing: Chip(label: Text(document.status.label)),
                  onTap: controller.busy
                      ? null
                      : () => controller.selectDocument(document.id),
                ),
              ),
            if (selected != null) ...[
              const Divider(height: 28),
              _FiscalDocumentDetail(
                document: selected,
                canRetry: canRetry,
                canVoid: canVoid,
                busy: controller.busy,
                downloadReceiptPdf: downloadReceiptPdf,
                onRetry: () => onRetry(selected),
                onVoid: () => onVoid(selected),
                onClose: controller.clearSelection,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _FiscalDocumentDetail extends StatelessWidget {
  const _FiscalDocumentDetail({
    required this.document,
    required this.canRetry,
    required this.canVoid,
    required this.busy,
    required this.onRetry,
    required this.onVoid,
    required this.onClose,
    this.downloadReceiptPdf,
  });
  final FiscalDocument document;
  final bool canRetry;
  final bool canVoid;
  final bool busy;
  final VoidCallback onRetry;
  final VoidCallback onVoid;
  final VoidCallback onClose;
  final Future<FiscalReceiptPdfData> Function(String documentId)?
  downloadReceiptPdf;

  bool get _officialPdfAvailable =>
      downloadReceiptPdf != null &&
      fiscalReceiptPdfActionsSupported &&
      document.provider == FiscalProvider.openapiSmartReceipts &&
      document.externalId != null &&
      (document.status == FiscalDocumentStatus.issued ||
          document.status == FiscalDocumentStatus.voided);

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Row(
        children: [
          Expanded(
            child: Text(
              'Dettaglio documento',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
          IconButton(onPressed: onClose, icon: const Icon(Icons.close)),
        ],
      ),
      Text(
        'Provider: ${document.provider.label} · ${document.environment.label}',
      ),
      Text('Ordine: ${document.orderId}'),
      Text(
        'Totale: ${formatFiscalMoney(document.totalCents, document.currency)}',
      ),
      Text(
        'Contanti: ${formatFiscalMoney(document.cashPaymentCents, document.currency)}',
      ),
      Text(
        'Elettronico: ${formatFiscalMoney(document.electronicPaymentCents, document.currency)}',
      ),
      if (document.documentNumber != null)
        Text('Numero fiscale: ${document.documentNumber}'),
      if (document.documentDate != null)
        Text('Data documento: ${document.documentDate}'),
      if (document.externalId != null)
        Text('ID provider: ${document.externalId}'),
      if (document.errorMessage != null) ...[
        const SizedBox(height: 8),
        Text(
          '${document.errorCode ?? 'ERRORE'}: ${document.errorMessage}',
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        ),
      ],
      if (_officialPdfAvailable) ...[
        const SizedBox(height: 14),
        Text(
          'Scontrino fiscale ufficiale',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 4),
        const Text('PDF originale recuperato da OpenAPI.'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            FilledButton.tonalIcon(
              key: const Key('fiscal-open-pdf-button'),
              onPressed: busy
                  ? null
                  : () => _runPdfAction(
                      context,
                      openFiscalReceiptPdf,
                      'PDF fiscale aperto.',
                    ),
              icon: const Icon(Icons.picture_as_pdf_outlined),
              label: const Text('Apri PDF'),
            ),
            OutlinedButton.icon(
              key: const Key('fiscal-save-pdf-button'),
              onPressed: busy
                  ? null
                  : () => _runPdfAction(
                      context,
                      saveFiscalReceiptPdf,
                      'PDF fiscale salvato in Download.',
                    ),
              icon: const Icon(Icons.download_outlined),
              label: const Text('Salva PDF'),
            ),
            OutlinedButton.icon(
              key: const Key('fiscal-print-pdf-button'),
              onPressed: busy
                  ? null
                  : () => _runPdfAction(
                      context,
                      printFiscalReceiptPdf,
                      'PDF fiscale inviato alla stampa Windows.',
                    ),
              icon: const Icon(Icons.print_outlined),
              label: const Text('Stampa PDF'),
            ),
          ],
        ),
      ],
      if (document.items.isNotEmpty) ...[
        const SizedBox(height: 12),
        Text('Righe', style: Theme.of(context).textTheme.titleMedium),
        ...document.items.map(
          (item) => ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: Text(item.description),
            subtitle: Text('${item.displayQuantity} · IVA ${item.vatRateCode}'),
            trailing: Text(
              formatFiscalMoney(item.finalGrossCents, document.currency),
            ),
          ),
        ),
      ],
      if (document.attemptHistory.isNotEmpty) ...[
        const SizedBox(height: 12),
        Text('Tentativi', style: Theme.of(context).textTheme.titleMedium),
        ...document.attemptHistory.map(
          (attempt) => ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: CircleAvatar(child: Text('${attempt.attemptNo}')),
            title: Text(attempt.outcome),
            subtitle: attempt.errorMessage == null
                ? null
                : Text(
                    '${attempt.errorCode ?? 'ERRORE'} · ${attempt.errorMessage}',
                  ),
          ),
        ),
      ],
      const SizedBox(height: 12),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          if (document.canRetry)
            FilledButton.tonalIcon(
              key: const Key('fiscal-retry-button'),
              onPressed: !canRetry || busy ? null : onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Riprova'),
            ),
          if (document.canVoid)
            OutlinedButton.icon(
              key: const Key('fiscal-void-button'),
              onPressed: !canVoid || busy ? null : onVoid,
              icon: const Icon(Icons.undo),
              label: const Text('Annulla documento'),
            ),
        ],
      ),
    ],
  );

  Future<void> _runPdfAction(
    BuildContext context,
    Future<String> Function(Uint8List bytes, String filename) action,
    String successMessage,
  ) async {
    final download = downloadReceiptPdf;
    if (download == null) return;
    try {
      final pdf = await download(document.id);
      await action(pdf.bytes, pdf.filename);
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(successMessage)));
      }
    } on BackendError catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Operazione sul PDF fiscale non riuscita.'),
          ),
        );
      }
    }
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
      trailing: IconButton(onPressed: onDismiss, icon: const Icon(Icons.close)),
    ),
  );
}

Future<String?> showLotteryCodeDialog(
  BuildContext context,
  String orderNumber,
) async {
  var lotteryCode = '';
  return showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text('Fiscalizza $orderNumber'),
      content: TextFormField(
        initialValue: lotteryCode,
        onChanged: (value) => lotteryCode = value,
        textCapitalization: TextCapitalization.characters,
        maxLength: 8,
        decoration: const InputDecoration(
          labelText: 'Codice lotteria facoltativo',
          helperText: 'Lascia vuoto se non richiesto',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('Annulla'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, lotteryCode.trim()),
          child: const Text('Fiscalizza'),
        ),
      ],
    ),
  );
}

Future<String?> showVoidFiscalDialog(BuildContext context) async {
  var reasonText = '';
  return showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Annullamento fiscale'),
      content: TextFormField(
        initialValue: reasonText,
        onChanged: (value) => reasonText = value,
        maxLength: 300,
        minLines: 2,
        maxLines: 4,
        decoration: const InputDecoration(labelText: 'Motivo'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('Indietro'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(dialogContext, reasonText.trim()),
          child: const Text('Conferma'),
        ),
      ],
    ),
  );
}

class AcubeSandboxValues {
  const AcubeSandboxValues({
    required this.fiscalId,
    this.receiptEmail,
    this.displayName,
  });
  final String fiscalId;
  final String? receiptEmail;
  final String? displayName;
}

Future<AcubeSandboxValues?> showAcubeSandboxDialog(
  BuildContext context,
  FiscalProfile? profile,
) async {
  var fiscalIdText = profile?.fiscalId ?? '';
  var emailText = profile?.receiptEmail ?? '';
  var nameText = profile?.displayName ?? '';
  return showDialog<AcubeSandboxValues>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: const Text('Configura A-Cube sandbox'),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.science_outlined),
                title: Text('Ambiente SANDBOX'),
                subtitle: Text(
                  'Le credenziali A-Cube restano nei segreti del fiscal-worker.',
                ),
              ),
              TextFormField(
                initialValue: fiscalIdText,
                onChanged: (value) => fiscalIdText = value,
                keyboardType: TextInputType.number,
                maxLength: 11,
                decoration: const InputDecoration(
                  labelText: 'Partita IVA / fiscal ID',
                ),
              ),
              TextFormField(
                initialValue: nameText,
                onChanged: (value) => nameText = value,
                decoration: const InputDecoration(
                  labelText: 'Denominazione facoltativa',
                ),
              ),
              TextFormField(
                initialValue: emailText,
                onChanged: (value) => emailText = value,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  labelText: 'Email ricevute facoltativa',
                ),
              ),
            ],
          ),
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
            AcubeSandboxValues(
              fiscalId: fiscalIdText.trim(),
              receiptEmail: emailText.trim().isEmpty ? null : emailText.trim(),
              displayName: nameText.trim().isEmpty ? null : nameText.trim(),
            ),
          ),
          child: const Text('Salva'),
        ),
      ],
    ),
  );
}
