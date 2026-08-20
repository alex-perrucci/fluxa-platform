import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/di/providers.dart';
import '../../../core/network/backend_error.dart';
import '../domain/payment_receipt_route.dart';
import '../domain/printing_models.dart';

class PaymentReceiptRoutingAction extends ConsumerWidget {
  const PaymentReceiptRoutingAction({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider).state;
    final printing = ref.watch(printingControllerProvider);
    final location = auth.deviceAssignment?.location;
    final session = auth.session;
    if (location == null || session == null) {
      return const SizedBox.shrink();
    }

    final canManage = _canManageReceiptRouting(session.role);
    return FilledButton.tonalIcon(
      key: const Key('payment-receipt-routing-open'),
      onPressed: () => showDialog<void>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Ricevute automatiche'),
          content: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: 680,
              maxHeight: MediaQuery.sizeOf(dialogContext).height * 0.72,
            ),
            child: SingleChildScrollView(
              child: PaymentReceiptRoutingCard(
                locationId: location.id,
                locationName: location.name,
                printers: printing.printers,
                canManage: canManage,
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Chiudi'),
            ),
          ],
        ),
      ),
      icon: const Icon(Icons.receipt_long_outlined),
      label: const Text('Ricevute automatiche'),
    );
  }
}

class PaymentReceiptRoutingCard extends ConsumerStatefulWidget {
  const PaymentReceiptRoutingCard({
    required this.locationId,
    required this.locationName,
    required this.printers,
    required this.canManage,
    super.key,
  });

  final String locationId;
  final String locationName;
  final List<PrinterDevice> printers;
  final bool canManage;

  @override
  ConsumerState<PaymentReceiptRoutingCard> createState() =>
      _PaymentReceiptRoutingCardState();
}

class _PaymentReceiptRoutingCardState
    extends ConsumerState<PaymentReceiptRoutingCard> {
  List<PaymentReceiptRoute> _routes = const [];
  String? _selectedPrinterId;
  String? _errorMessage;
  bool _loading = true;
  bool _saving = false;

  PaymentReceiptRoute? get _route => _routes.isEmpty ? null : _routes.first;

  @override
  void initState() {
    super.initState();
    Future<void>.microtask(_load);
  }

  @override
  void didUpdateWidget(covariant PaymentReceiptRoutingCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.locationId != widget.locationId) {
      Future<void>.microtask(_load);
    }
  }

  List<PrinterDevice> get _availablePrinters => widget.printers
      .where(canReceivePaymentReceipts)
      .toList(growable: false);

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _errorMessage = null;
    });
    try {
      final response = await ref.read(apiClientProvider).dio.get<Object?>(
        'print-routes',
        queryParameters: {'locationId': widget.locationId},
      );
      final routes = paymentReceiptRoutesFromPayload(response.data);
      final route = routes.isEmpty ? null : routes.first;
      if (!mounted) return;
      setState(() {
        _routes = routes;
        _selectedPrinterId = _availablePrinters.any(
          (printer) => printer.id == route?.printerId,
        )
            ? route?.printerId
            : null;
        _loading = false;
      });
    } on DioException catch (error) {
      _finishLoadWithError(BackendError.fromDioException(error).message);
    } on FormatException {
      _finishLoadWithError(
        'Fluxa non riesce a leggere la scelta della stampante. Riprova.',
      );
    } catch (_) {
      _finishLoadWithError(
        'Impossibile controllare dove vengono stampate le ricevute.',
      );
    }
  }

  void _finishLoadWithError(String message) {
    if (!mounted) return;
    setState(() {
      _loading = false;
      _errorMessage = message;
    });
  }

  Future<void> _save() async {
    if (_saving || !widget.canManage) return;
    setState(() {
      _saving = true;
      _errorMessage = null;
    });
    try {
      final dio = ref.read(apiClientProvider).dio;
      final printerId = _selectedPrinterId;
      PaymentReceiptRoute? nextRoute;
      if (printerId == null) {
        for (final route in _routes) {
          await dio.delete<Object?>('print-routes/${route.id}');
        }
      } else {
        final response = await dio.put<Map<String, Object?>>(
          'print-routes',
          data: {
            'locationId': widget.locationId,
            'documentType': PrintDocumentType.paymentReceipt.wireValue,
            'printerId': printerId,
            'copies': 1,
            'active': true,
          },
        );
        final data = response.data;
        if (data == null) {
          throw const FormatException('Configurazione stampante vuota.');
        }
        nextRoute = PaymentReceiptRoute.fromJson(data);
        for (final route in _routes) {
          if (route.id != nextRoute.id) {
            await dio.delete<Object?>('print-routes/${route.id}');
          }
        }
      }
      if (!mounted) return;
      setState(() {
        _routes = nextRoute == null ? const [] : [nextRoute];
        _selectedPrinterId = nextRoute?.printerId;
        _saving = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            nextRoute == null
                ? 'Stampa automatica delle ricevute disattivata.'
                : 'Ricevute inviate automaticamente a ${nextRoute.printerName}.',
          ),
        ),
      );
    } on DioException catch (error) {
      _finishSaveWithError(BackendError.fromDioException(error).message);
    } on FormatException {
      _finishSaveWithError('Fluxa non ha confermato la scelta. Riprova.');
    } catch (_) {
      _finishSaveWithError(
        'Impossibile salvare la stampante per le ricevute.',
      );
    }
  }

  void _finishSaveWithError(String message) {
    if (!mounted) return;
    setState(() {
      _saving = false;
      _errorMessage = message;
    });
  }

  @override
  Widget build(BuildContext context) {
    final printers = _availablePrinters;
    final route = _route;
    final routeMissingFromList = route != null &&
        !printers.any((printer) => printer.id == route.printerId);
    return Card(
      key: const Key('payment-receipt-routing-card'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.receipt_long_outlined),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Dove stampare le ricevute',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const Text(
                        'Scegli la stampante che Fluxa userà automaticamente dopo un pagamento.',
                      ),
                      Text(
                        'La scelta vale per tutte le casse di ${widget.locationName}.',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                IconButton(
                  key: const Key('payment-receipt-routing-refresh'),
                  tooltip: 'Controlla di nuovo',
                  onPressed: _loading || _saving ? null : _load,
                  icon: const Icon(Icons.refresh),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_loading)
              const Row(
                children: [
                  SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 10),
                  Text('Controllo della stampante per le ricevute...'),
                ],
              )
            else if (printers.isEmpty)
              const Text(
                'Non ci sono stampanti attive adatte alle ricevute. Attivane una di tipo Ricevute o Generica, poi torna qui.',
              )
            else
              LayoutBuilder(
                builder: (context, constraints) {
                  final selector = DropdownButtonFormField<String?>(
                    key: const Key('payment-receipt-printer-selector'),
                    value: _selectedPrinterId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Stampante per le ricevute',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    items: [
                      const DropdownMenuItem<String?>(
                        value: null,
                        child: Text('Non stampare automaticamente'),
                      ),
                      ...printers.map(
                        (printer) => DropdownMenuItem<String?>(
                          value: printer.id,
                          child: Text(
                            printer.name,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                    onChanged: !widget.canManage || _saving
                        ? null
                        : (value) => setState(
                            () => _selectedPrinterId = value,
                          ),
                  );
                  final save = FilledButton.icon(
                    key: const Key('payment-receipt-routing-save'),
                    onPressed: !widget.canManage || _saving ? null : _save,
                    icon: _saving
                        ? const SizedBox.square(
                            dimension: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.check),
                    label: const Text('Salva scelta'),
                  );
                  if (constraints.maxWidth < 680) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        selector,
                        const SizedBox(height: 10),
                        save,
                      ],
                    );
                  }
                  return Row(
                    children: [
                      Expanded(child: selector),
                      const SizedBox(width: 10),
                      save,
                    ],
                  );
                },
              ),
            if (_routes.length > 1) ...[
              const SizedBox(height: 8),
              const Text(
                'Sono state trovate più stampanti per le ricevute. Salva una scelta per usarne una sola.',
              ),
            ],
            if (routeMissingFromList) ...[
              const SizedBox(height: 8),
              const Text(
                'La stampante usata in precedenza non è più disponibile. Scegline una nuova.',
              ),
            ],
            if (_errorMessage != null) ...[
              const SizedBox(height: 8),
              Text(
                _errorMessage!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ] else if (!_loading && printers.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                route == null
                    ? 'Adesso le ricevute non vengono stampate automaticamente.'
                    : 'Adesso le ricevute dei pagamenti escono su ${route.printerName}.',
              ),
            ],
            if (!widget.canManage) ...[
              const SizedBox(height: 8),
              const Text('Solo un responsabile può cambiare questa scelta.'),
            ],
          ],
        ),
      ),
    );
  }
}

bool _canManageReceiptRouting(String? role) =>
    role == 'OWNER' || role == 'ADMIN' || role == 'MANAGER';
