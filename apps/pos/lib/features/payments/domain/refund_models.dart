class RefundQuote {
  const RefundQuote({
    required this.paymentId,
    required this.method,
    required this.provider,
    required this.currency,
    required this.capturedCents,
    required this.refundedCents,
    required this.pendingRefundCents,
    required this.refundableCents,
    required this.fullyRefunded,
  });

  factory RefundQuote.fromJson(Map<String, Object?> json) => RefundQuote(
    paymentId: _string(json, 'paymentId'),
    method: _string(json, 'method'),
    provider: _string(json, 'provider'),
    currency: _string(json, 'currency'),
    capturedCents: _integer(json, 'capturedCents'),
    refundedCents: _integer(json, 'refundedCents'),
    pendingRefundCents: _integer(json, 'pendingRefundCents'),
    refundableCents: _integer(json, 'refundableCents'),
    fullyRefunded: json['fullyRefunded'] == true,
  );

  final String paymentId;
  final String method;
  final String provider;
  final String currency;
  final int capturedCents;
  final int refundedCents;
  final int pendingRefundCents;
  final int refundableCents;
  final bool fullyRefunded;
}

class PaymentRefund {
  const PaymentRefund({
    required this.id,
    required this.paymentId,
    required this.orderId,
    required this.status,
    required this.amountCents,
    required this.currency,
    required this.reason,
    required this.providerReference,
  });

  factory PaymentRefund.fromJson(Map<String, Object?> json) => PaymentRefund(
    id: _string(json, 'id'),
    paymentId: _string(json, 'paymentId'),
    orderId: _string(json, 'orderId'),
    status: _string(json, 'status'),
    amountCents: _integer(json, 'amountCents'),
    currency: _string(json, 'currency'),
    reason: _string(json, 'reason'),
    providerReference: json['providerReference']?.toString(),
  );

  final String id;
  final String paymentId;
  final String orderId;
  final String status;
  final int amountCents;
  final String currency;
  final String reason;
  final String? providerReference;
}

class RefundOperationResult {
  const RefundOperationResult({required this.refund, required this.quote});

  factory RefundOperationResult.fromJson(Map<String, Object?> json) {
    final refund = json['refund'];
    final quote = json['quote'];
    if (refund is! Map || quote is! Map) {
      throw const FormatException('Risposta rimborso incompleta.');
    }
    return RefundOperationResult(
      refund: PaymentRefund.fromJson(Map<String, Object?>.from(refund)),
      quote: RefundQuote.fromJson(Map<String, Object?>.from(quote)),
    );
  }

  final PaymentRefund refund;
  final RefundQuote quote;
}

String _string(Map<String, Object?> json, String key) {
  final value = json[key]?.toString();
  if (value == null || value.isEmpty) {
    throw FormatException('Campo rimborso non valido: $key');
  }
  return value;
}

int _integer(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is num) return value.toInt();
  throw FormatException('Campo rimborso non valido: $key');
}
