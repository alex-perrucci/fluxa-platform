import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/payments/domain/payment_models.dart';

void main() {
  test('parses checkout, payments and provider events', () {
    final checkout = CheckoutSession.fromJson(_checkoutJson());

    expect(checkout.status, CheckoutStatus.open);
    expect(checkout.payments, hasLength(2));
    expect(checkout.payments.first.method, PaymentMethod.cash);
    expect(checkout.payments.last.status, PaymentStatus.pending);
    expect(checkout.pendingCents, 400);
    expect(checkout.availableCents, 500);
  });

  test('formats and parses cent-based money without floating point', () {
    expect(formatPaymentMoney(1234, 'EUR'), '€ 12,34');
    expect(parseMoneyInput('12,34'), 1234);
    expect(parseMoneyInput('12.3'), 1230);
    expect(() => parseMoneyInput('12,345'), throwsFormatException);
  });
}

Map<String, Object?> _checkoutJson() => {
  'id': 'checkout-1',
  'organizationId': 'organization-1',
  'locationId': 'location-1',
  'orderId': 'order-1',
  'deviceId': 'device-1',
  'createdByUserId': 'user-1',
  'clientCheckoutId': 'client-checkout-1',
  'requestHash': 'ignored',
  'status': 'OPEN',
  'currency': 'EUR',
  'orderVersionSnapshot': 3,
  'orderTotalCents': 1500,
  'paidCents': 600,
  'remainingCents': 900,
  'changeCents': 100,
  'completedAt': null,
  'cancelledAt': null,
  'cancelReason': null,
  'createdAt': '2026-07-21T10:00:00.000Z',
  'updatedAt': '2026-07-21T10:01:00.000Z',
  'payments': [
    _paymentJson(
      id: 'payment-cash',
      method: 'CASH',
      provider: 'CASH',
      status: 'CAPTURED',
      amountCents: 600,
      tenderedCents: 700,
      changeCents: 100,
    ),
    _paymentJson(
      id: 'payment-card',
      method: 'CARD',
      provider: 'MANUAL_TERMINAL',
      status: 'PENDING',
      amountCents: 400,
      tenderedCents: null,
      changeCents: 0,
    ),
  ],
};

Map<String, Object?> _paymentJson({
  required String id,
  required String method,
  required String provider,
  required String status,
  required int amountCents,
  required int? tenderedCents,
  required int changeCents,
}) => {
  'id': id,
  'organizationId': 'organization-1',
  'locationId': 'location-1',
  'checkoutSessionId': 'checkout-1',
  'orderId': 'order-1',
  'deviceId': 'device-1',
  'createdByUserId': 'user-1',
  'clientPaymentId': 'client-$id',
  'requestHash': 'ignored',
  'method': method,
  'provider': provider,
  'status': status,
  'amountCents': amountCents,
  'tenderedCents': tenderedCents,
  'changeCents': changeCents,
  'providerReference': null,
  'failureCode': null,
  'failureMessage': null,
  'capturedAt': status == 'CAPTURED' ? '2026-07-21T10:02:00.000Z' : null,
  'failedAt': null,
  'cancelledAt': null,
  'createdAt': '2026-07-21T10:01:00.000Z',
  'updatedAt': '2026-07-21T10:02:00.000Z',
  'events': [
    {
      'id': 'event-$id',
      'paymentId': id,
      'type': status == 'CAPTURED' ? 'CAPTURED' : 'CREATED',
      'providerEventId': null,
      'payload': {'amountCents': amountCents},
      'createdAt': '2026-07-21T10:02:00.000Z',
    },
  ],
};
