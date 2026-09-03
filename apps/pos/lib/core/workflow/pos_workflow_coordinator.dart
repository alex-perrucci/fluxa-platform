import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../features/fiscal/data/fiscal_api.dart';
import '../../features/fiscal/domain/fiscal_models.dart';
import '../../features/fiscal/domain/fiscal_runtime.dart';
import '../../features/fiscal/platform/fiscal_receipt_pdf_handler.dart';
import '../../features/fiscal/presentation/fiscal_controller.dart';
import '../../features/hospitality/presentation/table_controller.dart';
import '../../features/orders/domain/order_models.dart';
import '../../features/orders/presentation/order_controller.dart';
import '../../features/payments/presentation/checkout_controller.dart';
import '../../features/printing/presentation/printing_controller.dart';
import 'automatic_payment_receipt_trigger.dart';

enum PosWorkflowStatus { idle, working, ready, attention }

class PosWorkflowCoordinator extends ChangeNotifier {
  PosWorkflowCoordinator({
    required OrderController orders,
    required CheckoutController checkout,
    required FiscalController fiscal,
    required TableController tables,
    required PrintingController printing,
    required FiscalGateway fiscalGateway,
  }) : _orders = orders,
       _checkout = checkout,
       _fiscal = fiscal,
       _tables = tables,
       _printing = printing,
       _fiscalGateway = fiscalGateway {
    _checkout.addListener(_onCheckoutChanged);
  }

  final OrderController _orders;
  final CheckoutController _checkout;
  final FiscalController _fiscal;
  final TableController _tables;
  final PrintingController _printing;
  final FiscalGateway _fiscalGateway;

  final AutomaticPaymentReceiptTrigger _automaticPaymentReceiptTrigger =
      AutomaticPaymentReceiptTrigger();
  final Set<String> _printingDocuments = <String>{};
  final Set<String> _handledCompletedCheckouts = <String>{};
  final Map<String, bool> _observedCheckoutCompletion = <String, bool>{};
  final Map<String, Future<void>> _finalizations = <String, Future<void>>{};

  PosWorkflowStatus _status = PosWorkflowStatus.idle;
  String? _message;

  PosWorkflowStatus get status => _status;
  String? get message => _message;
  bool get busy => _status == PosWorkflowStatus.working;
  bool get needsAttention => _status == PosWorkflowStatus.attention;

  Future<void> synchronizeLocation(String locationId) async {
    final jobs = <Future<void>>[];

    if (_orders.locationId == locationId) {
      jobs.add(_orders.refreshOperationalState());
    } else {
      jobs.add(_orders.bindLocation(locationId));
    }

    if (_tables.locationId == locationId) {
      jobs.add(_tables.refreshOperationalState());
    } else {
      jobs.add(_tables.bindLocation(locationId));
    }

    if (_fiscal.locationId == locationId) {
      jobs.add(_fiscal.refresh(silent: true));
    } else {
      jobs.add(_fiscal.bindLocation(locationId));
    }

    jobs.add(_printing.refresh());
    await Future.wait(jobs);
  }

  Future<void> completePaidSale({
    required String locationId,
    required String orderId,
    String? checkoutId,
  }) async {
    final existing = _finalizations[orderId];
    if (existing != null) {
      await existing;
      return;
    }

    final future = _completePaidSale(
      locationId: locationId,
      orderId: orderId,
      checkoutId: checkoutId,
    );
    _finalizations[orderId] = future;
    try {
      await future;
    } finally {
      if (identical(_finalizations[orderId], future)) {
        _finalizations.remove(orderId);
      }
    }
  }

  Future<void> reconcileCancelledOrder({
    required String locationId,
    required String orderId,
    required OrderServiceMode serviceMode,
  }) async {
    _setStatus(PosWorkflowStatus.working, 'Aggiornamento ordine annullato…');
    try {
      if (serviceMode == OrderServiceMode.table) {
        await _closeTableWhenPossible(
          locationId,
          orderId,
          reason: 'Chiusura automatica dopo annullamento ordine',
          operationLabel: 'Ordine annullato',
        );
      }

      await _orders.refreshOrders();
      if (_tables.locationId == locationId && !_tables.busy) {
        unawaited(_tables.refreshOperationalState());
      }
      if (_status != PosWorkflowStatus.attention) {
        _setStatus(PosWorkflowStatus.ready, 'Ordine annullato.');
      }
    } catch (_) {
      _setAttention(
        'Ordine annullato. Alcuni dati operativi richiedono un aggiornamento.',
      );
    }
  }

  Future<void> _completePaidSale({
    required String locationId,
    required String orderId,
    String? checkoutId,
  }) async {
    _setStatus(PosWorkflowStatus.working, 'Chiusura vendita…');
    try {
      if (_orders.locationId != locationId) {
        await _orders.bindLocation(locationId);
      }
      if (_orders.activeOrder?.header.id != orderId) {
        await _orders.selectOrder(orderId);
      } else {
        await _orders.refreshOperationalState();
      }

      final order = _orders.activeOrder;
      if (order == null || order.header.id != orderId) {
        _setAttention(
          'Pagamento registrato. Impossibile rileggere la vendita: controlla Ordini.',
        );
        return;
      }
      if (order.header.status != OrderStatus.paid) {
        _setAttention(
          'Il pagamento è stato registrato ma la vendita non risulta ancora conclusa.',
        );
        return;
      }

      if (order.header.serviceMode == OrderServiceMode.table) {
        await _closeTableWhenPossible(locationId, orderId);
      }
      final document = await _ensureFiscalDocument(
        locationId: locationId,
        orderId: orderId,
      );

      final usesOfficialAdeReceipt =
          _fiscal.runtime?.provider == FiscalProvider.adeWeb;
      if (!usesOfficialAdeReceipt) {
        final completedCheckoutId =
            checkoutId ?? _completedCheckoutIdForOrder(orderId);
        if (completedCheckoutId != null) {
          await _enqueueAutomaticPaymentReceipt(completedCheckoutId);
        } else {
          _setAttention(
            'Pagamento completato, ma il checkout concluso non è disponibile per la stampa automatica. La ristampa manuale resta disponibile.',
          );
        }
      }

      if (document != null) {
        unawaited(_finishFiscalReceiptInBackground(locationId, orderId));
      }

      unawaited(_refreshAfterSale(locationId));
      if (_status != PosWorkflowStatus.attention) {
        _setStatus(
          PosWorkflowStatus.ready,
          usesOfficialAdeReceipt
              ? 'Vendita completata. Stampa del documento fiscale AdE in corso.'
              : 'Vendita completata.',
        );
      }
    } catch (_) {
      _setAttention(
        'Pagamento completato. Alcune operazioni automatiche sono da controllare.',
      );
    }
  }

  Future<void> recoverFiscalDocument({
    required String locationId,
    required String orderId,
    String? lotteryCode,
  }) async {
    _setStatus(PosWorkflowStatus.working, 'Recupero scontrino fiscale…');
    final document = await _ensureFiscalDocument(
      locationId: locationId,
      orderId: orderId,
      allowManualIssue: true,
      lotteryCode: lotteryCode,
    );
    if (document == null) {
      return;
    }
    unawaited(_finishFiscalReceiptInBackground(locationId, orderId));
    if (_status != PosWorkflowStatus.attention) {
      _setStatus(PosWorkflowStatus.ready, 'Scontrino fiscale in elaborazione.');
    }
  }

  void clearMessage() {
    if (_message == null && _status == PosWorkflowStatus.idle) {
      return;
    }
    _status = PosWorkflowStatus.idle;
    _message = null;
    notifyListeners();
  }

  void _onCheckoutChanged() {
    final checkout = _checkout.checkout;
    if (checkout == null) {
      return;
    }

    final completed = checkout.isCompleted;
    final previous = _observedCheckoutCompletion[checkout.id];
    _observedCheckoutCompletion[checkout.id] = completed;

    if (previous != false ||
        !completed ||
        !_handledCompletedCheckouts.add(checkout.id)) {
      return;
    }

    unawaited(
      completePaidSale(
        locationId: checkout.locationId,
        orderId: checkout.orderId,
        checkoutId: checkout.id,
      ),
    );
  }

  String? _completedCheckoutIdForOrder(String orderId) {
    final checkout = _checkout.checkout;
    if (checkout == null ||
        checkout.orderId != orderId ||
        !checkout.isCompleted) {
      return null;
    }
    return checkout.id;
  }

  Future<void> _enqueueAutomaticPaymentReceipt(String checkoutId) async {
    final outcome = await _automaticPaymentReceiptTrigger.onCheckoutState(
      checkoutId: checkoutId,
      completed: true,
      enqueueReceipt: () => _printing.requestPaymentReceipt(checkoutId),
    );

    if (outcome == AutomaticPaymentReceiptOutcome.failed) {
      _setAttention(
        _printing.errorMessage == null
            ? 'Pagamento completato, ma la stampa automatica della ricevuta non è riuscita. Usa la ristampa manuale senza ripetere il pagamento.'
            : 'Pagamento completato, ma la stampa automatica della ricevuta non è riuscita: ${_printing.errorMessage} La ristampa manuale resta disponibile.',
      );
    }
  }

  Future<FiscalDocument?> _ensureFiscalDocument({
    required String locationId,
    required String orderId,
    bool allowManualIssue = false,
    String? lotteryCode,
  }) async {
    if (_fiscal.locationId == locationId) {
      await _fiscal.refresh(silent: true);
    } else {
      await _fiscal.bindLocation(locationId);
    }

    final runtime = _fiscal.runtime;
    if (runtime == null ||
        runtime.status == FiscalRuntimeStatus.verificationError) {
      _setAttention(
        'Vendita pagata. Impossibile verificare lo stato fiscale: controlla la connessione o riprova da Fiscale.',
      );
      return null;
    }
    if (runtime.status == FiscalRuntimeStatus.notConfigured) {
      _setAttention(
        'Vendita pagata. La fiscalizzazione non è configurata per questa sede.',
      );
      return null;
    }
    if (runtime.status == FiscalRuntimeStatus.disabled) {
      _setAttention(
        'Vendita pagata. La fiscalizzazione è disabilitata per questa sede.',
      );
      return null;
    }
    if (runtime.status == FiscalRuntimeStatus.authRequired) {
      _setAttention(
        'Vendita pagata. È necessario ripristinare l’accesso fiscale prima dell’emissione.',
      );
      return null;
    }
    if (!runtime.isOperationallyConfigured) {
      _setAttention(
        'Vendita pagata. La configurazione fiscale della sede richiede verifica.',
      );
      return null;
    }

    var document = _fiscal.documentForOrder(orderId);
    if (document == null && !runtime.autoIssueOnPaid && !allowManualIssue) {
      _setAttention(
        'Vendita pagata. L’emissione automatica dello scontrino è disattivata per questa sede.',
      );
      return null;
    }

    if (document == null) {
      final issued = await _fiscal.issueOrder(
        orderId,
        lotteryCode: lotteryCode,
      );
      if (!issued) {
        _setAttention(
          _fiscal.errorMessage ??
              'Vendita pagata. Lo scontrino fiscale richiede attenzione.',
        );
        return null;
      }
      document = _fiscal.documentForOrder(orderId);
    }

    if (document == null) {
      _setAttention(
        'Vendita pagata. Lo scontrino fiscale non è ancora disponibile.',
      );
      return null;
    }

    if (document.status == FiscalDocumentStatus.rejected ||
        document.status == FiscalDocumentStatus.cancelled) {
      _setAttention(
        'Vendita pagata. Lo scontrino fiscale è da controllare in Fiscale.',
      );
    }
    return document;
  }

  Future<void> _finishFiscalReceiptInBackground(
    String locationId,
    String orderId,
  ) async {
    FiscalDocument? document = _fiscal.documentForOrder(orderId);

    for (var attempt = 0; attempt < 15; attempt += 1) {
      if (document?.status == FiscalDocumentStatus.issued) {
        await _printOfficialReceipt(document!);
        return;
      }
      if (document?.status == FiscalDocumentStatus.rejected ||
          document?.status == FiscalDocumentStatus.cancelled) {
        _setAttention(
          'Vendita completata. Lo scontrino fiscale richiede attenzione.',
        );
        return;
      }

      await Future<void>.delayed(const Duration(seconds: 2));
      if (_fiscal.locationId != locationId) {
        return;
      }
      await _fiscal.refresh(silent: true);
      document = _fiscal.documentForOrder(orderId);
    }

    if (document?.status.isPending == true) {
      _setAttention(
        'Vendita completata. Scontrino fiscale ancora in elaborazione: controlla Fiscale se non viene stampato.',
      );
    }
  }

  Future<void> _printOfficialReceipt(FiscalDocument document) async {
    final providerHasOfficialReceipt =
        document.provider == FiscalProvider.openapiSmartReceipts ||
        document.provider == FiscalProvider.adeWeb;
    if (!providerHasOfficialReceipt ||
        !fiscalReceiptPdfActionsSupported ||
        !_printingDocuments.add(document.id)) {
      return;
    }

    try {
      final receipt = await _fiscalGateway.downloadReceiptLayout(document.id);
      await printFiscalReceiptLayout(receipt);
    } catch (_) {
      _setAttention(
        document.provider == FiscalProvider.adeWeb
            ? 'Documento fiscale AdE emesso, ma la stampa automatica non è riuscita.'
            : 'Scontrino fiscale emesso, ma la stampa automatica non è riuscita.',
      );
    } finally {
      _printingDocuments.remove(document.id);
    }
  }

  Future<void> _closeTableWhenPossible(
    String locationId,
    String orderId, {
    String reason = 'Chiusura automatica dopo incasso',
    String operationLabel = 'Vendita completata',
  }) async {
    if (_tables.locationId != locationId) {
      await _tables.bindLocation(locationId);
    } else {
      await _tables.refreshOperationalState();
    }
    if (_tables.busy) {
      _setAttention(
        '$operationLabel. Il tavolo è occupato da un’altra operazione e non è stato liberato automaticamente.',
      );
      return;
    }

    final closed = await _tables.closeSessionForSettledOrder(
      orderId,
      reason: reason,
    );
    if (!closed) {
      _setAttention(
        '$operationLabel. Il tavolo non è stato liberato automaticamente.',
      );
    }
  }

  Future<void> _refreshAfterSale(String locationId) async {
    try {
      await Future.wait([
        _orders.refreshOrders(),
        _tables.locationId == locationId
            ? _tables.refreshOperationalState()
            : _tables.bindLocation(locationId),
        _fiscal.locationId == locationId
            ? _fiscal.refresh(silent: true)
            : _fiscal.bindLocation(locationId),
        _printing.refresh(),
      ]);
    } catch (_) {
      // The payment is already authoritative. Each section can refresh again.
    }
  }

  void _setAttention(String message) {
    _setStatus(PosWorkflowStatus.attention, message);
  }

  void _setStatus(PosWorkflowStatus status, String? message) {
    _status = status;
    _message = message;
    notifyListeners();
  }

  @override
  void dispose() {
    _checkout.removeListener(_onCheckoutChanged);
    super.dispose();
  }
}
