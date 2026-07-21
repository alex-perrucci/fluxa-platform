import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/core/network/backend_error.dart';
import 'package:fluxa_pos/features/orders/domain/order_models.dart';
import 'package:fluxa_pos/features/payments/data/payments_api.dart';
import 'package:fluxa_pos/features/payments/domain/payment_models.dart';
import 'package:fluxa_pos/features/payments/presentation/checkout_controller.dart';

void main() {
  test('reuses the existing open checkout for the selected order', () async {
    final existing = _checkout();
    final gateway = _FakePaymentsGateway(
      listed: CheckoutListPage(
        page: 1,
        pageSize: 25,
        total: 1,
        items: [existing],
      ),
      checkout: existing,
    );
    final controller = CheckoutController(gateway);

    await controller.bindLocation('location-1');
    final opened = await controller.openForOrder(_order());

    expect(opened, isTrue);
    expect(controller.checkout?.id, 'checkout-1');
    expect(gateway.openCalls, 0);
    expect(gateway.getCalls, 1);
  });

  test('cash payment updates the checkout to completed', () async {
    final open = _checkout();
    final completed = _checkout(
      status: CheckoutStatus.completed,
      paidCents: 1500,
      remainingCents: 0,
      changeCents: 500,
      payments: [_cashPayment()],
    );
    final gateway = _FakePaymentsGateway(
      listed: const CheckoutListPage(
        page: 1,
        pageSize: 25,
        total: 0,
        items: [],
      ),
      checkout: open,
      paymentResult: PaymentOperationResult(
        payment: _cashPayment(),
        checkout: completed,
      ),
    );
    final controller = CheckoutController(gateway);

    await controller.bindLocation('location-1');
    expect(await controller.openForOrder(_order()), isTrue);
    expect(
      await controller.addCashPayment(amountCents: 1500, tenderedCents: 2000),
      isTrue,
    );

    expect(controller.checkout?.status, CheckoutStatus.completed);
    expect(controller.checkout?.changeCents, 500);
    expect(controller.noticeMessage, contains('Ordine chiuso'));
  });

  test('location change discards the previous financial context', () async {
    final gateway = _FakePaymentsGateway(
      listed: const CheckoutListPage(
        page: 1,
        pageSize: 25,
        total: 0,
        items: [],
      ),
      checkout: _checkout(),
    );
    final controller = CheckoutController(gateway);

    await controller.bindLocation('location-1');
    await controller.openForOrder(_order());
    expect(controller.checkout, isNotNull);

    await controller.bindLocation('location-2');

    expect(controller.checkout, isNull);
    expect(controller.locationId, 'location-2');
    expect(controller.status, CheckoutLoadStatus.idle);
  });

  test('surfaces an order version conflict without forcing checkout', () async {
    final gateway = _FakePaymentsGateway(
      listed: const CheckoutListPage(
        page: 1,
        pageSize: 25,
        total: 0,
        items: [],
      ),
      checkout: _checkout(),
      openError: const BackendError(
        code: 'ORDER_VERSION_CONFLICT',
        message: 'Version conflict.',
      ),
    );
    final controller = CheckoutController(gateway);

    await controller.bindLocation('location-1');
    final opened = await controller.openForOrder(_order());

    expect(opened, isFalse);
    expect(controller.checkout, isNull);
    expect(controller.errorMessage, contains('ordine è cambiato'));
  });
}

class _FakePaymentsGateway implements PaymentsGateway {
  _FakePaymentsGateway({
    required this.listed,
    required this.checkout,
    this.paymentResult,
    this.openError,
  });

  final CheckoutListPage listed;
  CheckoutSession checkout;
  final PaymentOperationResult? paymentResult;
  final BackendError? openError;
  int openCalls = 0;
  int getCalls = 0;

  @override
  Future<CheckoutListPage> listCheckouts({
    required String locationId,
    CheckoutStatus? status,
    int page = 1,
    int pageSize = 25,
  }) async => listed;

  @override
  Future<CheckoutSession> getCheckout(String checkoutId) async {
    getCalls += 1;
    return checkout;
  }

  @override
  Future<PaymentRecord> getPayment(String paymentId) async =>
      paymentResult?.payment ?? _cashPayment();

  @override
  Future<CheckoutSession> openCheckout({
    required String clientCheckoutId,
    required String orderId,
    required int expectedOrderVersion,
  }) async {
    openCalls += 1;
    final error = openError;
    if (error != null) {
      throw error;
    }
    return checkout;
  }

  @override
  Future<PaymentOperationResult> createPayment({
    required String checkoutId,
    required String clientPaymentId,
    required PaymentMethod method,
    required PaymentProvider provider,
    required int amountCents,
    int? tenderedCents,
  }) async {
    final result = paymentResult;
    if (result == null) {
      throw StateError('Missing fake payment result.');
    }
    checkout = result.checkout;
    return result;
  }

  @override
  Future<PaymentOperationResult> capturePayment({
    required String paymentId,
    required String mutationId,
    required String providerReference,
    String? providerEventId,
  }) async => _requirePaymentResult();

  @override
  Future<PaymentOperationResult> failPayment({
    required String paymentId,
    required String mutationId,
    required String failureCode,
    String? failureMessage,
    String? providerEventId,
  }) async => _requirePaymentResult();

  @override
  Future<PaymentOperationResult> cancelPayment({
    required String paymentId,
    required String mutationId,
    String? reason,
  }) async => _requirePaymentResult();

  @override
  Future<CheckoutSession> cancelCheckout({
    required String checkoutId,
    required String mutationId,
    required String reason,
  }) async => checkout;

  PaymentOperationResult _requirePaymentResult() {
    final result = paymentResult;
    if (result == null) {
      throw StateError('Missing fake payment result.');
    }
    checkout = result.checkout;
    return result;
  }
}

OrderDetail _order() => OrderDetail(
  header: OrderHeader(
    id: 'order-1',
    organizationId: 'organization-1',
    locationId: 'location-1',
    deviceId: 'device-1',
    createdByUserId: 'user-1',
    clientOrderId: 'client-order-1',
    number: '20260721-0001',
    businessDate: '2026-07-21',
    status: OrderStatus.open,
    serviceMode: OrderServiceMode.counter,
    customerNote: null,
    currency: 'EUR',
    version: 3,
    subtotalCents: 1500,
    discountCents: 0,
    totalCents: 1500,
    netTotalCents: 1229,
    taxTotalCents: 271,
    heldAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: DateTime.utc(2026, 7, 21, 10),
    updatedAt: DateTime.utc(2026, 7, 21, 10),
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
      categoryCodeSnapshot: 'BEVANDE',
      categoryNameSnapshot: 'Bevande',
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
      createdAt: DateTime.utc(2026, 7, 21, 10),
      updatedAt: DateTime.utc(2026, 7, 21, 10),
    ),
  ],
  adjustments: const [],
  vatSummaries: const [],
);

CheckoutSession _checkout({
  CheckoutStatus status = CheckoutStatus.open,
  int paidCents = 0,
  int remainingCents = 1500,
  int changeCents = 0,
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
  orderVersionSnapshot: 3,
  orderTotalCents: 1500,
  paidCents: paidCents,
  remainingCents: remainingCents,
  changeCents: changeCents,
  completedAt: status == CheckoutStatus.completed
      ? DateTime.utc(2026, 7, 21, 10, 5)
      : null,
  cancelledAt: null,
  cancelReason: null,
  createdAt: DateTime.utc(2026, 7, 21, 10),
  updatedAt: DateTime.utc(2026, 7, 21, 10, 5),
  payments: payments,
);

PaymentRecord _cashPayment() => PaymentRecord(
  id: 'payment-1',
  organizationId: 'organization-1',
  locationId: 'location-1',
  checkoutSessionId: 'checkout-1',
  orderId: 'order-1',
  deviceId: 'device-1',
  createdByUserId: 'user-1',
  clientPaymentId: 'client-payment-1',
  method: PaymentMethod.cash,
  provider: PaymentProvider.cash,
  status: PaymentStatus.captured,
  amountCents: 1500,
  tenderedCents: 2000,
  changeCents: 500,
  providerReference: null,
  failureCode: null,
  failureMessage: null,
  capturedAt: DateTime.utc(2026, 7, 21, 10, 5),
  failedAt: null,
  cancelledAt: null,
  createdAt: DateTime.utc(2026, 7, 21, 10, 5),
  updatedAt: DateTime.utc(2026, 7, 21, 10, 5),
  events: const [],
);
