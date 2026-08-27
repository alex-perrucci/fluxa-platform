import 'package:flutter/foundation.dart';

import '../../../core/network/backend_error.dart';
import '../../../core/payments/external_terminal_bridge.dart';
import '../../orders/domain/order_models.dart';
import '../../orders/domain/uuid_v4.dart';
import '../data/payments_api.dart';
import '../domain/payment_models.dart';

enum CheckoutLoadStatus { idle, loading, ready, failure }

enum CardPaymentFlowOutcome {
  manualFallback,
  approved,
  declined,
  pending,
  failed,
}

class CheckoutController extends ChangeNotifier {
  CheckoutController(this._gateway, {TerminalBridgeGateway? terminalBridge})
    : _terminalBridge = terminalBridge;

  final PaymentsGateway _gateway;
  final TerminalBridgeGateway? _terminalBridge;

  String? _locationId;
  CheckoutSession? _checkout;
  CheckoutLoadStatus _status = CheckoutLoadStatus.idle;
  bool _busy = false;
  String? _errorMessage;
  String? _noticeMessage;
  int _requestVersion = 0;

  String? get locationId => _locationId;
  CheckoutSession? get checkout => _checkout;
  CheckoutLoadStatus get status => _status;
  bool get busy => _busy;
  String? get errorMessage => _errorMessage;
  String? get noticeMessage => _noticeMessage;

  Future<void> bindLocation(String locationId) async {
    if (_locationId == locationId) {
      return;
    }
    _requestVersion += 1;
    _locationId = locationId;
    _checkout = null;
    _status = CheckoutLoadStatus.idle;
    _busy = false;
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  void clearLocation() {
    _requestVersion += 1;
    _locationId = null;
    _checkout = null;
    _status = CheckoutLoadStatus.idle;
    _busy = false;
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  void clearMessages() {
    if (_errorMessage == null && _noticeMessage == null) {
      return;
    }
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  Future<void> setNotice(String message) async {
    _errorMessage = null;
    _noticeMessage = message;
    notifyListeners();
  }

  Future<void> bindCheckoutForOfflineRecovery(CheckoutSession checkout) async {
    _locationId = checkout.locationId;
    _checkout = checkout;
    _status = CheckoutLoadStatus.ready;
    _busy = false;
    _errorMessage = null;
    _noticeMessage = 'Vendita locale pronta per la sincronizzazione.';
    notifyListeners();
  }

  Future<bool> openForOrder(OrderDetail order) async {
    final currentLocationId = _locationId;
    if (currentLocationId == null) {
      _setFailure('Location operativa non disponibile.');
      return false;
    }
    if (order.header.locationId != currentLocationId) {
      _setFailure('L’ordine appartiene a una location diversa.');
      return false;
    }
    if (order.header.status == OrderStatus.held ||
        order.header.status == OrderStatus.cancelled ||
        order.header.status == OrderStatus.paid) {
      _setFailure('Lo stato dell’ordine non consente di iniziare il checkout.');
      return false;
    }
    if (order.items.isEmpty || order.header.totalCents <= 0) {
      _setFailure(
        'L’ordine deve contenere almeno una riga con totale positivo.',
      );
      return false;
    }
    if (_busy) {
      return false;
    }

    final requestVersion = ++_requestVersion;
    _busy = true;
    _status = CheckoutLoadStatus.loading;
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();

    try {
      final openPage = await _gateway.listCheckouts(
        locationId: currentLocationId,
        status: CheckoutStatus.open,
        pageSize: 100,
      );
      if (requestVersion != _requestVersion ||
          _locationId != currentLocationId) {
        return false;
      }

      final existing = _findCheckoutForOrder(openPage.items, order.header.id);
      final CheckoutSession checkout;
      if (existing != null) {
        checkout = await _gateway.getCheckout(existing.id);
      } else if (order.header.status == OrderStatus.open) {
        checkout = await _gateway.openCheckout(
          clientCheckoutId: UuidV4.generate(),
          orderId: order.header.id,
          expectedOrderVersion: order.header.version,
        );
      } else {
        throw const BackendError(
          code: 'CHECKOUT_NOT_FOUND',
          message:
              'L’ordine è in pagamento ma non è stato trovato un checkout aperto.',
        );
      }

      if (requestVersion != _requestVersion ||
          _locationId != currentLocationId) {
        return false;
      }
      _assertCheckoutScope(checkout, currentLocationId, order.header.id);
      _checkout = checkout;
      _status = CheckoutLoadStatus.ready;
      _noticeMessage = existing == null
          ? 'Checkout aperto. Registra il pagamento.'
          : 'Checkout aperto recuperato.';
      return true;
    } on BackendError catch (error) {
      if (error.code == 'ORDER_CHECKOUT_ALREADY_OPEN') {
        final checkoutId = error.details['checkoutId']?.toString();
        if (checkoutId != null && checkoutId.isNotEmpty) {
          try {
            final checkout = await _gateway.getCheckout(checkoutId);
            _assertCheckoutScope(checkout, currentLocationId, order.header.id);
            _checkout = checkout;
            _status = CheckoutLoadStatus.ready;
            _noticeMessage = 'Checkout aperto recuperato.';
            return true;
          } catch (_) {
            // Fall through to the original backend error.
          }
        }
      }
      _errorMessage = _paymentErrorMessage(error);
      _status = CheckoutLoadStatus.failure;
      return false;
    } on FormatException {
      _errorMessage = 'Il backend ha restituito un checkout non valido.';
      _status = CheckoutLoadStatus.failure;
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile aprire il checkout.';
      _status = CheckoutLoadStatus.failure;
      return false;
    } finally {
      if (requestVersion == _requestVersion) {
        _busy = false;
        notifyListeners();
      }
    }
  }

  Future<bool> refresh() async {
    final current = _checkout;
    final currentLocationId = _locationId;
    if (current == null || currentLocationId == null || _busy) {
      return false;
    }
    _setBusy();
    try {
      final refreshed = await _gateway.getCheckout(current.id);
      _assertCheckoutScope(refreshed, currentLocationId, current.orderId);
      _checkout = refreshed;
      _status = CheckoutLoadStatus.ready;
      return true;
    } on BackendError catch (error) {
      _errorMessage = _paymentErrorMessage(error);
      return false;
    } on FormatException {
      _errorMessage = 'Il backend ha restituito un checkout non valido.';
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile aggiornare il checkout.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> addCashPayment({
    required int amountCents,
    required int tenderedCents,
  }) async {
    final checkout = _checkout;
    if (!_canMutate(checkout)) {
      return false;
    }
    if (tenderedCents < amountCents) {
      _setFailure('Il contante ricevuto non può essere inferiore all’importo.');
      return false;
    }
    return _runPaymentOperation(
      () => _gateway.createPayment(
        checkoutId: checkout!.id,
        clientPaymentId: UuidV4.generate(),
        method: PaymentMethod.cash,
        provider: PaymentProvider.cash,
        amountCents: amountCents,
        tenderedCents: tenderedCents,
      ),
      successMessage: 'Pagamento in contanti registrato.',
    );
  }

  Future<bool> addTerminalPayment({
    required PaymentMethod method,
    required PaymentProvider provider,
    required int amountCents,
  }) async {
    final checkout = _checkout;
    if (!_canMutate(checkout)) {
      return false;
    }
    if (method == PaymentMethod.cash || provider == PaymentProvider.cash) {
      _setFailure('Metodo e provider terminale non validi.');
      return false;
    }
    return _runPaymentOperation(
      () => _gateway.createPayment(
        checkoutId: checkout!.id,
        clientPaymentId: UuidV4.generate(),
        method: method,
        provider: provider,
        amountCents: amountCents,
      ),
      successMessage: 'Pagamento terminale creato in attesa.',
    );
  }

  Future<CardPaymentFlowOutcome> startCardPayment({
    required int amountCents,
  }) async {
    final checkout = _checkout;
    if (!_canMutate(checkout) || checkout == null || amountCents <= 0) {
      return CardPaymentFlowOutcome.failed;
    }

    final unresolvedExternal = _latestPendingCard(
      PaymentProvider.externalTerminal,
    );
    if (unresolvedExternal != null) {
      _noticeMessage =
          'Esiste già un pagamento carta da verificare. Non verrà avviato un secondo addebito.';
      notifyListeners();
      return CardPaymentFlowOutcome.pending;
    }

    final bridge = _terminalBridge;
    final bridgeReady =
        bridge != null && bridge.isEnabled && await bridge.preflight();

    if (!bridgeReady) {
      final created = await addTerminalPayment(
        method: PaymentMethod.card,
        provider: PaymentProvider.manualTerminal,
        amountCents: amountCents,
      );
      return created
          ? CardPaymentFlowOutcome.manualFallback
          : CardPaymentFlowOutcome.failed;
    }

    final created = await addTerminalPayment(
      method: PaymentMethod.card,
      provider: PaymentProvider.externalTerminal,
      amountCents: amountCents,
    );
    if (!created) {
      return CardPaymentFlowOutcome.failed;
    }

    final payment = _latestPendingCard(PaymentProvider.externalTerminal);
    final current = _checkout;
    if (payment == null || current == null) {
      _setFailure('Pagamento terminale creato ma non recuperabile.');
      return CardPaymentFlowOutcome.failed;
    }

    final result = await bridge.startPayment(
      paymentId: payment.id,
      amountCents: payment.amountCents,
      currency: current.currency,
    );
    return _applyTerminalBridgeResult(payment, result);
  }

  Future<CardPaymentFlowOutcome> verifyExternalTerminalPayment(
    PaymentRecord payment,
  ) async {
    if (payment.status != PaymentStatus.pending ||
        payment.provider != PaymentProvider.externalTerminal) {
      _setFailure(
        'Il pagamento selezionato non è da verificare sul terminale.',
      );
      return CardPaymentFlowOutcome.failed;
    }
    final bridge = _terminalBridge;
    if (bridge == null || !bridge.isEnabled) {
      _noticeMessage =
          'Bridge terminale non disponibile. Il pagamento resta in attesa: non ripetere l’addebito.';
      notifyListeners();
      return CardPaymentFlowOutcome.pending;
    }

    final result = await bridge.verifyPayment(payment.id);
    return _applyTerminalBridgeResult(payment, result);
  }

  Future<CardPaymentFlowOutcome> _applyTerminalBridgeResult(
    PaymentRecord payment,
    TerminalBridgeResult result,
  ) async {
    switch (result.decision) {
      case TerminalBridgeDecision.approved:
        final reference = result.providerReference;
        if (reference == null) {
          _noticeMessage =
              'Esito terminale non verificabile. Il pagamento resta in attesa.';
          notifyListeners();
          return CardPaymentFlowOutcome.pending;
        }
        final captured = await capturePayment(
          payment: payment,
          providerReference: reference,
          providerEventId: result.providerEventId,
        );
        return captured
            ? CardPaymentFlowOutcome.approved
            : CardPaymentFlowOutcome.failed;
      case TerminalBridgeDecision.declined:
        final failed = await failPayment(
          payment: payment,
          failureCode: 'TERMINAL_DECLINED',
          failureMessage:
              result.message ?? 'Pagamento rifiutato dal terminale.',
          providerEventId: result.providerEventId,
        );
        return failed
            ? CardPaymentFlowOutcome.declined
            : CardPaymentFlowOutcome.failed;
      case TerminalBridgeDecision.pending:
        _errorMessage = null;
        _noticeMessage =
            'Pagamento ancora in elaborazione sul terminale. Usa “Verifica esito”: non ripetere il pagamento.';
        notifyListeners();
        return CardPaymentFlowOutcome.pending;
      case TerminalBridgeDecision.unknown:
        _errorMessage = null;
        _noticeMessage =
            'Esito del terminale non confermato. Il pagamento resta in attesa: verifica lo stesso pagamento, senza crearne un altro.';
        notifyListeners();
        return CardPaymentFlowOutcome.pending;
    }
  }

  Future<bool> capturePayment({
    required PaymentRecord payment,
    required String providerReference,
    String? providerEventId,
  }) async {
    if (payment.status != PaymentStatus.pending) {
      _setFailure('Solo un pagamento in attesa può essere acquisito.');
      return false;
    }
    return _runPaymentOperation(
      () => _gateway.capturePayment(
        paymentId: payment.id,
        mutationId: UuidV4.generate(),
        providerReference: providerReference.trim(),
        providerEventId: _normalize(providerEventId),
      ),
      successMessage: 'Pagamento acquisito.',
    );
  }

  Future<bool> failPayment({
    required PaymentRecord payment,
    required String failureCode,
    String? failureMessage,
    String? providerEventId,
  }) async {
    if (payment.status != PaymentStatus.pending) {
      _setFailure(
        'Solo un pagamento in attesa può essere marcato come fallito.',
      );
      return false;
    }
    return _runPaymentOperation(
      () => _gateway.failPayment(
        paymentId: payment.id,
        mutationId: UuidV4.generate(),
        failureCode: failureCode.trim().toUpperCase(),
        failureMessage: _normalize(failureMessage),
        providerEventId: _normalize(providerEventId),
      ),
      successMessage: 'Pagamento marcato come fallito.',
    );
  }

  Future<bool> cancelPayment(PaymentRecord payment, {String? reason}) async {
    if (payment.status != PaymentStatus.pending) {
      _setFailure('Solo un pagamento in attesa può essere annullato.');
      return false;
    }
    return _runPaymentOperation(
      () => _gateway.cancelPayment(
        paymentId: payment.id,
        mutationId: UuidV4.generate(),
        reason: _normalize(reason),
      ),
      successMessage: 'Pagamento in attesa annullato.',
    );
  }

  Future<bool> cancelCheckout(String reason) async {
    final checkout = _checkout;
    if (checkout == null || !checkout.canCancel || _busy) {
      _setFailure(
        'Il checkout può essere annullato solo se non ha pagamenti acquisiti.',
      );
      return false;
    }
    _setBusy();
    try {
      final updated = await _gateway.cancelCheckout(
        checkoutId: checkout.id,
        mutationId: UuidV4.generate(),
        reason: reason.trim(),
      );
      _assertCheckoutScope(updated, checkout.locationId, checkout.orderId);
      _checkout = updated;
      _status = CheckoutLoadStatus.ready;
      _noticeMessage =
          'Checkout annullato. L’ordine è nuovamente modificabile.';
      return true;
    } on BackendError catch (error) {
      _errorMessage = _paymentErrorMessage(error);
      return false;
    } on FormatException {
      _errorMessage = 'Il backend ha restituito un checkout non valido.';
      return false;
    } catch (_) {
      _errorMessage = 'Impossibile annullare il checkout.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  Future<bool> _runPaymentOperation(
    Future<PaymentOperationResult> Function() operation, {
    required String successMessage,
  }) async {
    final checkout = _checkout;
    if (!_canMutate(checkout)) {
      return false;
    }
    _setBusy();
    try {
      final result = await operation();
      _assertCheckoutScope(
        result.checkout,
        checkout!.locationId,
        checkout.orderId,
      );
      if (result.payment.checkoutSessionId != result.checkout.id ||
          result.payment.orderId != result.checkout.orderId) {
        throw const BackendError(
          message: 'Il pagamento ricevuto non appartiene al checkout corrente.',
        );
      }
      _checkout = result.checkout;
      _status = CheckoutLoadStatus.ready;
      _noticeMessage = result.checkout.isCompleted
          ? 'Pagamento completato. Ordine chiuso come pagato.'
          : successMessage;
      return true;
    } on BackendError catch (error) {
      _errorMessage = _paymentErrorMessage(error);
      if (_shouldRefresh(error)) {
        await _refreshAfterConflict();
      }
      return false;
    } on FormatException {
      _errorMessage = 'Il backend ha restituito un pagamento non valido.';
      return false;
    } catch (_) {
      _errorMessage = 'Operazione di pagamento non riuscita.';
      return false;
    } finally {
      _finishBusy();
    }
  }

  bool _canMutate(CheckoutSession? checkout) {
    if (checkout == null || !checkout.isOpen || _busy) {
      if (checkout == null) {
        _setFailure('Checkout non disponibile.');
      } else if (!checkout.isOpen) {
        _setFailure('Il checkout non è più aperto.');
      }
      return false;
    }
    return true;
  }

  PaymentRecord? _latestPendingCard(PaymentProvider provider) {
    final checkout = _checkout;
    if (checkout == null) {
      return null;
    }
    for (final payment in checkout.payments.reversed) {
      if (payment.status == PaymentStatus.pending &&
          payment.method == PaymentMethod.card &&
          payment.provider == provider) {
        return payment;
      }
    }
    return null;
  }

  CheckoutSession? _findCheckoutForOrder(
    List<CheckoutSession> items,
    String orderId,
  ) {
    for (final item in items) {
      if (item.orderId == orderId && item.status == CheckoutStatus.open) {
        return item;
      }
    }
    return null;
  }

  void _assertCheckoutScope(
    CheckoutSession checkout,
    String locationId,
    String orderId,
  ) {
    if (checkout.locationId != locationId || checkout.orderId != orderId) {
      throw const BackendError(
        message: 'Il checkout ricevuto appartiene a un contesto diverso.',
      );
    }
  }

  bool _shouldRefresh(BackendError error) => {
    'CHECKOUT_NOT_OPEN',
    'PAYMENT_NOT_PENDING',
    'PAYMENT_COMPLETION_CONFLICT',
    'ORDER_PAYMENT_STATE_CONFLICT',
    'ORDER_TOTAL_CHANGED_DURING_CHECKOUT',
  }.contains(error.code);

  Future<void> _refreshAfterConflict() async {
    final checkout = _checkout;
    if (checkout == null) {
      return;
    }
    try {
      final refreshed = await _gateway.getCheckout(checkout.id);
      if (_locationId == refreshed.locationId &&
          checkout.orderId == refreshed.orderId) {
        _checkout = refreshed;
        _status = CheckoutLoadStatus.ready;
      }
    } catch (_) {
      // Preserve the backend error; the operator can retry a full refresh.
    }
  }

  String _paymentErrorMessage(BackendError error) {
    if (error.code == 'ORDER_VERSION_CONFLICT') {
      return 'L’ordine è cambiato. Torna all’ordine, aggiornalo e riprova.';
    }
    if (error.code == 'ORDER_CHECKOUT_ALREADY_OPEN') {
      return 'Esiste già un checkout aperto per questo ordine.';
    }
    if (error.code == 'CHECKOUT_HAS_CAPTURED_PAYMENTS') {
      return 'Il checkout contiene già pagamenti acquisiti e non può essere annullato.';
    }
    if (error.code == 'PAYMENT_AMOUNT_EXCEEDS_AVAILABLE') {
      return 'L’importo supera il residuo disponibile del checkout.';
    }
    return error.message;
  }

  void _setBusy() {
    _busy = true;
    _errorMessage = null;
    _noticeMessage = null;
    notifyListeners();
  }

  void _finishBusy() {
    _busy = false;
    notifyListeners();
  }

  void _setFailure(String message) {
    _errorMessage = message;
    _noticeMessage = null;
    if (_checkout == null) {
      _status = CheckoutLoadStatus.failure;
    }
    notifyListeners();
  }

  String? _normalize(String? value) {
    final normalized = value?.trim();
    return normalized == null || normalized.isEmpty ? null : normalized;
  }
}
