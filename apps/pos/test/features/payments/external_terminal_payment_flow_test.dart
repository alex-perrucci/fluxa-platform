import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/payments/external_terminal_bridge.dart';
import 'package:fluxa_pos/features/orders/domain/order_models.dart';
import 'package:fluxa_pos/features/payments/data/payments_api.dart';
import 'package:fluxa_pos/features/payments/domain/payment_models.dart';
import 'package:fluxa_pos/features/payments/presentation/checkout_controller.dart';

void main() {
  test('card stays manual when the bridge is not ready', () async {
    final gateway = _Gateway();
    final bridge = _Bridge(enabled: false);
    final controller = CheckoutController(gateway, terminalBridge: bridge);

    await _open(controller);
    final outcome = await controller.startCardPayment(amountCents: 1500);

    expect(outcome, CardPaymentFlowOutcome.manualFallback);
    expect(gateway.lastCreatedProvider, PaymentProvider.manualTerminal);
    expect(bridge.startCalls, 0);
  });

  test(
    'ambiguous bridge result stays pending and is never charged twice',
    () async {
      final gateway = _Gateway();
      final bridge = _Bridge(
        startResult: TerminalBridgeResult.unknown,
        verifyResult: const TerminalBridgeResult(
          decision: TerminalBridgeDecision.pending,
        ),
      );
      final controller = CheckoutController(gateway, terminalBridge: bridge);

      await _open(controller);
      final first = await controller.startCardPayment(amountCents: 1500);
      final second = await controller.startCardPayment(amountCents: 1500);

      expect(first, CardPaymentFlowOutcome.pending);
      expect(second, CardPaymentFlowOutcome.pending);
      expect(gateway.lastCreatedProvider, PaymentProvider.externalTerminal);
      expect(gateway.createCalls, 1);
      expect(bridge.startCalls, 1);
      expect(
        controller.checkout?.payments.single.status,
        PaymentStatus.pending,
      );
      expect(controller.noticeMessage, contains('secondo addebito'));
    },
  );

  test(
    'verify resolves the same pending external payment without restarting it',
    () async {
      final gateway = _Gateway();
      final bridge = _Bridge(
        startResult: TerminalBridgeResult.unknown,
        verifyResult: const TerminalBridgeResult(
          decision: TerminalBridgeDecision.approved,
          providerReference: 'terminal-ref-1',
          providerEventId: 'event-1',
        ),
      );
      final controller = CheckoutController(gateway, terminalBridge: bridge);

      await _open(controller);
      expect(
        await controller.startCardPayment(amountCents: 1500),
        CardPaymentFlowOutcome.pending,
      );
      final pending = controller.checkout!.payments.single;
      final outcome = await controller.verifyExternalTerminalPayment(pending);

      expect(outcome, CardPaymentFlowOutcome.approved);
      expect(bridge.startCalls, 1);
      expect(bridge.verifyCalls, 1);
      expect(gateway.captureCalls, 1);
      expect(controller.checkout?.status, CheckoutStatus.completed);
    },
  );
}

Future<void> _open(CheckoutController controller) async {
  await controller.bindLocation('location-1');
  expect(await controller.openForOrder(_order()), isTrue);
}

class _Bridge implements TerminalBridgeGateway {
  _Bridge({
    this.enabled = true,
    this.startResult = const TerminalBridgeResult(
      decision: TerminalBridgeDecision.approved,
      providerReference: 'terminal-ref',
    ),
    this.verifyResult = const TerminalBridgeResult(
      decision: TerminalBridgeDecision.approved,
      providerReference: 'terminal-ref',
    ),
  });

  final bool enabled;
  final TerminalBridgeResult startResult;
  final TerminalBridgeResult verifyResult;
  int startCalls = 0;
  int verifyCalls = 0;

  @override
  bool get isEnabled => enabled;

  @override
  Future<bool> preflight() async => enabled;

  @override
  Future<TerminalBridgeResult> startPayment({
    required String paymentId,
    required int amountCents,
    required String currency,
  }) async {
    startCalls += 1;
    return startResult;
  }

  @override
  Future<TerminalBridgeResult> verifyPayment(String paymentId) async {
    verifyCalls += 1;
    return verifyResult;
  }
}

class _Gateway implements PaymentsGateway {
  CheckoutSession current = _checkout();
  PaymentProvider? lastCreatedProvider;
  int createCalls = 0;
  int captureCalls = 0;

  @override
  Future<CheckoutListPage> listCheckouts({
    required String locationId,
    CheckoutStatus? status,
    int page = 1,
    int pageSize = 25,
  }) async =>
      const CheckoutListPage(page: 1, pageSize: 25, total: 0, items: []);

  @override
  Future<CheckoutSession> getCheckout(String checkoutId) async => current;

  @override
  Future<PaymentRecord> getPayment(String paymentId) async =>
      current.payments.firstWhere((payment) => payment.id == paymentId);

  @override
  Future<CheckoutSession> openCheckout({
    required String clientCheckoutId,
    required String orderId,
    required int expectedOrderVersion,
  }) async => current;

  @override
  Future<PaymentOperationResult> createPayment({
    required String checkoutId,
    required String clientPaymentId,
    required PaymentMethod method,
    required PaymentProvider provider,
    required int amountCents,
    int? tenderedCents,
  }) async {
    createCalls += 1;
    lastCreatedProvider = provider;
    final payment = _payment(
      provider: provider,
      status: provider == PaymentProvider.cash
          ? PaymentStatus.captured
          : PaymentStatus.pending,
    );
    current = _checkout(payments: [payment]);
    return PaymentOperationResult(payment: payment, checkout: current);
  }

  @override
  Future<PaymentOperationResult> capturePayment({
    required String paymentId,
    required String mutationId,
    required String providerReference,
    String? providerEventId,
  }) async {
    captureCalls += 1;
    final payment = _payment(
      provider: PaymentProvider.externalTerminal,
      status: PaymentStatus.captured,
      providerReference: providerReference,
    );
    current = _checkout(
      status: CheckoutStatus.completed,
      paidCents: 1500,
      remainingCents: 0,
      payments: [payment],
    );
    return PaymentOperationResult(payment: payment, checkout: current);
  }

  @override
  Future<PaymentOperationResult> failPayment({
    required String paymentId,
    required String mutationId,
    required String failureCode,
    String? failureMessage,
    String? providerEventId,
  }) async {
    final payment = _payment(
      provider: PaymentProvider.externalTerminal,
      status: PaymentStatus.failed,
    );
    current = _checkout(payments: [payment]);
    return PaymentOperationResult(payment: payment, checkout: current);
  }

  @override
  Future<PaymentOperationResult> cancelPayment({
    required String paymentId,
    required String mutationId,
    String? reason,
  }) async {
    final payment = _payment(
      provider: PaymentProvider.manualTerminal,
      status: PaymentStatus.cancelled,
    );
    current = _checkout(payments: [payment]);
    return PaymentOperationResult(payment: payment, checkout: current);
  }

  @override
  Future<CheckoutSession> cancelCheckout({
    required String checkoutId,
    required String mutationId,
    required String reason,
  }) async => current;
}

OrderDetail _order() => OrderDetail(
  header: OrderHeader(
    id: 'order-1',
    organizationId: 'organization-1',
    locationId: 'location-1',
    deviceId: 'device-1',
    createdByUserId: 'user-1',
    clientOrderId: 'client-order-1',
    number: '20260825-0001',
    businessDate: '2026-08-25',
    status: OrderStatus.open,
    serviceMode: OrderServiceMode.counter,
    customerNote: null,
    currency: 'EUR',
    version: 1,
    subtotalCents: 1500,
    discountCents: 0,
    totalCents: 1500,
    netTotalCents: 1229,
    taxTotalCents: 271,
    heldAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: DateTime.utc(2026, 8, 25),
    updatedAt: DateTime.utc(2026, 8, 25),
  ),
  items: [
    OrderItem(
      id: 'item-1',
      clientItemId: 'client-item-1',
      productId: 'product-1',
      variantId: null,
      productCodeSnapshot: 'CAFFE',
      productNameSnapshot: 'Caffè',
      variantCodeSnapshot: null,
      variantNameSnapshot: null,
      skuSnapshot: null,
      barcodeSnapshot: null,
      categoryIdSnapshot: 'category-1',
      categoryCodeSnapshot: 'BAR',
      categoryNameSnapshot: 'Bar',
      unitSnapshot: 'EACH',
      quantityAmount: 1,
      quantityScale: 0,
      unitPriceCents: 1500,
      grossTotalCents: 1500,
      allocatedDiscountCents: 0,
      finalGrossCents: 1500,
      finalNetCents: 1229,
      finalTaxCents: 271,
      vatRateIdSnapshot: 'vat-1',
      vatCodeSnapshot: 'IVA22',
      vatRateBasisPointsSnapshot: 2200,
      vatNatureCodeSnapshot: null,
      priceListIdSnapshot: 'price-list-1',
      note: null,
      sortOrder: 0,
      createdAt: DateTime.utc(2026, 8, 25),
      updatedAt: DateTime.utc(2026, 8, 25),
    ),
  ],
  adjustments: const [],
  vatSummaries: const [],
);

CheckoutSession _checkout({
  CheckoutStatus status = CheckoutStatus.open,
  int paidCents = 0,
  int remainingCents = 1500,
  List<PaymentRecord> payments = const [],
}) => CheckoutSession(
  id: 'checkout-1',
  organizationId: 'organization-1',
  locationId: 'location-1',
  orderId: 'order-1',
  deviceId: 'device-1',
  createdByUserId: 'user-1',
  clientCheckoutId: 'client-checkout-1',
  status: status,
  currency: 'EUR',
  orderVersionSnapshot: 1,
  orderTotalCents: 1500,
  paidCents: paidCents,
  remainingCents: remainingCents,
  changeCents: 0,
  completedAt: status == CheckoutStatus.completed
      ? DateTime.utc(2026, 8, 25, 12, 1)
      : null,
  cancelledAt: null,
  cancelReason: null,
  createdAt: DateTime.utc(2026, 8, 25, 12),
  updatedAt: DateTime.utc(2026, 8, 25, 12),
  payments: payments,
);

PaymentRecord _payment({
  required PaymentProvider provider,
  required PaymentStatus status,
  String? providerReference,
}) => PaymentRecord(
  id: 'payment-1',
  organizationId: 'organization-1',
  locationId: 'location-1',
  checkoutSessionId: 'checkout-1',
  orderId: 'order-1',
  deviceId: 'device-1',
  createdByUserId: 'user-1',
  clientPaymentId: 'client-payment-1',
  method: provider == PaymentProvider.cash
      ? PaymentMethod.cash
      : PaymentMethod.card,
  provider: provider,
  status: status,
  amountCents: 1500,
  tenderedCents: null,
  changeCents: 0,
  providerReference: providerReference,
  failureCode: status == PaymentStatus.failed ? 'TERMINAL_DECLINED' : null,
  failureMessage: null,
  capturedAt: status == PaymentStatus.captured
      ? DateTime.utc(2026, 8, 25, 12, 1)
      : null,
  failedAt: status == PaymentStatus.failed
      ? DateTime.utc(2026, 8, 25, 12, 1)
      : null,
  cancelledAt: status == PaymentStatus.cancelled
      ? DateTime.utc(2026, 8, 25, 12, 1)
      : null,
  createdAt: DateTime.utc(2026, 8, 25, 12),
  updatedAt: DateTime.utc(2026, 8, 25, 12),
  events: const [],
);
