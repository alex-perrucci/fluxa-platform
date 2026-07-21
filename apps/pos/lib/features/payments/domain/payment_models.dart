enum CheckoutStatus {
  open('OPEN', 'Aperto'),
  completed('COMPLETED', 'Completato'),
  cancelled('CANCELLED', 'Annullato');

  const CheckoutStatus(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static CheckoutStatus fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final status in values) {
      if (status.wireValue == wireValue) {
        return status;
      }
    }
    throw FormatException('Stato checkout non supportato: $wireValue');
  }
}

enum PaymentMethod {
  cash('CASH', 'Contanti'),
  card('CARD', 'Carta'),
  other('OTHER', 'Altro');

  const PaymentMethod(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static PaymentMethod fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final method in values) {
      if (method.wireValue == wireValue) {
        return method;
      }
    }
    throw FormatException('Metodo di pagamento non supportato: $wireValue');
  }
}

enum PaymentProvider {
  cash('CASH', 'Contanti'),
  manualTerminal('MANUAL_TERMINAL', 'Terminale manuale'),
  externalTerminal('EXTERNAL_TERMINAL', 'Terminale esterno');

  const PaymentProvider(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static PaymentProvider fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final provider in values) {
      if (provider.wireValue == wireValue) {
        return provider;
      }
    }
    throw FormatException('Provider di pagamento non supportato: $wireValue');
  }
}

enum PaymentStatus {
  pending('PENDING', 'In attesa'),
  captured('CAPTURED', 'Acquisito'),
  failed('FAILED', 'Fallito'),
  cancelled('CANCELLED', 'Annullato');

  const PaymentStatus(this.wireValue, this.label);

  final String wireValue;
  final String label;

  static PaymentStatus fromWire(Object? value) {
    final wireValue = value?.toString();
    for (final status in values) {
      if (status.wireValue == wireValue) {
        return status;
      }
    }
    throw FormatException('Stato pagamento non supportato: $wireValue');
  }
}

class CheckoutListPage {
  const CheckoutListPage({
    required this.page,
    required this.pageSize,
    required this.total,
    required this.items,
  });

  factory CheckoutListPage.fromJson(Map<String, Object?> json) {
    final rawItems = json['items'];
    return CheckoutListPage(
      page: _requiredInt(json, 'page'),
      pageSize: _requiredInt(json, 'pageSize'),
      total: _requiredInt(json, 'total'),
      items: rawItems is List
          ? rawItems
                .map(
                  (value) => CheckoutSession.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <CheckoutSession>[],
    );
  }

  final int page;
  final int pageSize;
  final int total;
  final List<CheckoutSession> items;
}

class CheckoutSession {
  const CheckoutSession({
    required this.id,
    required this.organizationId,
    required this.locationId,
    required this.orderId,
    required this.deviceId,
    required this.createdByUserId,
    required this.clientCheckoutId,
    required this.status,
    required this.currency,
    required this.orderVersionSnapshot,
    required this.orderTotalCents,
    required this.paidCents,
    required this.remainingCents,
    required this.changeCents,
    required this.completedAt,
    required this.cancelledAt,
    required this.cancelReason,
    required this.createdAt,
    required this.updatedAt,
    required this.payments,
  });

  factory CheckoutSession.fromJson(Map<String, Object?> json) {
    final rawPayments = json['payments'];
    return CheckoutSession(
      id: _requiredString(json, 'id'),
      organizationId: _requiredString(json, 'organizationId'),
      locationId: _requiredString(json, 'locationId'),
      orderId: _requiredString(json, 'orderId'),
      deviceId: _requiredString(json, 'deviceId'),
      createdByUserId: _requiredString(json, 'createdByUserId'),
      clientCheckoutId: _requiredString(json, 'clientCheckoutId'),
      status: CheckoutStatus.fromWire(json['status']),
      currency: _requiredString(json, 'currency'),
      orderVersionSnapshot: _requiredInt(json, 'orderVersionSnapshot'),
      orderTotalCents: _requiredInt(json, 'orderTotalCents'),
      paidCents: _requiredInt(json, 'paidCents'),
      remainingCents: _requiredInt(json, 'remainingCents'),
      changeCents: _requiredInt(json, 'changeCents'),
      completedAt: _optionalDateTime(json['completedAt']),
      cancelledAt: _optionalDateTime(json['cancelledAt']),
      cancelReason: _optionalString(json['cancelReason']),
      createdAt: _requiredDateTime(json, 'createdAt'),
      updatedAt: _requiredDateTime(json, 'updatedAt'),
      payments: rawPayments is List
          ? rawPayments
                .map(
                  (value) => PaymentRecord.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <PaymentRecord>[],
    );
  }

  final String id;
  final String organizationId;
  final String locationId;
  final String orderId;
  final String deviceId;
  final String createdByUserId;
  final String clientCheckoutId;
  final CheckoutStatus status;
  final String currency;
  final int orderVersionSnapshot;
  final int orderTotalCents;
  final int paidCents;
  final int remainingCents;
  final int changeCents;
  final DateTime? completedAt;
  final DateTime? cancelledAt;
  final String? cancelReason;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<PaymentRecord> payments;

  int get pendingCents => payments
      .where((payment) => payment.status == PaymentStatus.pending)
      .fold(0, (total, payment) => total + payment.amountCents);

  int get availableCents {
    final available = remainingCents - pendingCents;
    return available < 0 ? 0 : available;
  }

  bool get isOpen => status == CheckoutStatus.open;
  bool get isCompleted => status == CheckoutStatus.completed;
  bool get canCancel => isOpen && paidCents == 0;
}

class PaymentRecord {
  const PaymentRecord({
    required this.id,
    required this.organizationId,
    required this.locationId,
    required this.checkoutSessionId,
    required this.orderId,
    required this.deviceId,
    required this.createdByUserId,
    required this.clientPaymentId,
    required this.method,
    required this.provider,
    required this.status,
    required this.amountCents,
    required this.tenderedCents,
    required this.changeCents,
    required this.providerReference,
    required this.failureCode,
    required this.failureMessage,
    required this.capturedAt,
    required this.failedAt,
    required this.cancelledAt,
    required this.createdAt,
    required this.updatedAt,
    required this.events,
  });

  factory PaymentRecord.fromJson(Map<String, Object?> json) {
    final rawEvents = json['events'];
    return PaymentRecord(
      id: _requiredString(json, 'id'),
      organizationId: _requiredString(json, 'organizationId'),
      locationId: _requiredString(json, 'locationId'),
      checkoutSessionId: _requiredString(json, 'checkoutSessionId'),
      orderId: _requiredString(json, 'orderId'),
      deviceId: _requiredString(json, 'deviceId'),
      createdByUserId: _requiredString(json, 'createdByUserId'),
      clientPaymentId: _requiredString(json, 'clientPaymentId'),
      method: PaymentMethod.fromWire(json['method']),
      provider: PaymentProvider.fromWire(json['provider']),
      status: PaymentStatus.fromWire(json['status']),
      amountCents: _requiredInt(json, 'amountCents'),
      tenderedCents: _optionalInt(json['tenderedCents']),
      changeCents: _requiredInt(json, 'changeCents'),
      providerReference: _optionalString(json['providerReference']),
      failureCode: _optionalString(json['failureCode']),
      failureMessage: _optionalString(json['failureMessage']),
      capturedAt: _optionalDateTime(json['capturedAt']),
      failedAt: _optionalDateTime(json['failedAt']),
      cancelledAt: _optionalDateTime(json['cancelledAt']),
      createdAt: _requiredDateTime(json, 'createdAt'),
      updatedAt: _requiredDateTime(json, 'updatedAt'),
      events: rawEvents is List
          ? rawEvents
                .map(
                  (value) => PaymentEvent.fromJson(
                    Map<String, Object?>.from(value as Map),
                  ),
                )
                .toList(growable: false)
          : const <PaymentEvent>[],
    );
  }

  final String id;
  final String organizationId;
  final String locationId;
  final String checkoutSessionId;
  final String orderId;
  final String deviceId;
  final String createdByUserId;
  final String clientPaymentId;
  final PaymentMethod method;
  final PaymentProvider provider;
  final PaymentStatus status;
  final int amountCents;
  final int? tenderedCents;
  final int changeCents;
  final String? providerReference;
  final String? failureCode;
  final String? failureMessage;
  final DateTime? capturedAt;
  final DateTime? failedAt;
  final DateTime? cancelledAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<PaymentEvent> events;
}

class PaymentEvent {
  const PaymentEvent({
    required this.id,
    required this.paymentId,
    required this.type,
    required this.providerEventId,
    required this.payload,
    required this.createdAt,
  });

  factory PaymentEvent.fromJson(Map<String, Object?> json) {
    final rawPayload = json['payload'];
    return PaymentEvent(
      id: _requiredString(json, 'id'),
      paymentId: _requiredString(json, 'paymentId'),
      type: _requiredString(json, 'type'),
      providerEventId: _optionalString(json['providerEventId']),
      payload: rawPayload is Map
          ? Map<String, Object?>.unmodifiable(
              Map<String, Object?>.from(rawPayload),
            )
          : const <String, Object?>{},
      createdAt: _requiredDateTime(json, 'createdAt'),
    );
  }

  final String id;
  final String paymentId;
  final String type;
  final String? providerEventId;
  final Map<String, Object?> payload;
  final DateTime createdAt;
}

class PaymentOperationResult {
  const PaymentOperationResult({required this.payment, required this.checkout});

  factory PaymentOperationResult.fromJson(Map<String, Object?> json) {
    final rawPayment = json['payment'];
    final rawCheckout = json['checkout'];
    if (rawPayment is! Map || rawCheckout is! Map) {
      throw const FormatException('Risposta pagamento incompleta.');
    }
    return PaymentOperationResult(
      payment: PaymentRecord.fromJson(Map<String, Object?>.from(rawPayment)),
      checkout: CheckoutSession.fromJson(
        Map<String, Object?>.from(rawCheckout),
      ),
    );
  }

  final PaymentRecord payment;
  final CheckoutSession checkout;
}

String formatPaymentMoney(int amountCents, String currency) {
  final negative = amountCents < 0;
  final absolute = amountCents.abs();
  final whole = absolute ~/ 100;
  final cents = (absolute % 100).toString().padLeft(2, '0');
  final symbol = switch (currency.toUpperCase()) {
    'EUR' => '€',
    'USD' => r'$',
    'GBP' => '£',
    _ => currency.toUpperCase(),
  };
  return '${negative ? '-' : ''}$symbol $whole,$cents';
}

String moneyInputValue(int amountCents) {
  final whole = amountCents ~/ 100;
  final cents = (amountCents % 100).abs().toString().padLeft(2, '0');
  return '$whole,$cents';
}

int parseMoneyInput(String rawValue) {
  final normalized = rawValue.trim().replaceAll('€', '').replaceAll(' ', '');
  final match = RegExp(r'^(\d+)(?:[,.](\d{1,2}))?$').firstMatch(normalized);
  if (match == null) {
    throw const FormatException(
      'Inserisci un importo valido con massimo due decimali.',
    );
  }
  final whole = int.parse(match.group(1)!);
  final rawCents = match.group(2) ?? '';
  final cents = rawCents.isEmpty ? 0 : int.parse(rawCents.padRight(2, '0'));
  final result = whole * 100 + cents;
  if (result <= 0) {
    throw const FormatException('L’importo deve essere maggiore di zero.');
  }
  return result;
}

String _requiredString(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is String && value.isNotEmpty) {
    return value;
  }
  throw FormatException('Campo pagamento non valido: $key');
}

int _requiredInt(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is num) {
    return value.toInt();
  }
  throw FormatException('Campo pagamento non valido: $key');
}

int? _optionalInt(Object? value) {
  if (value == null) {
    return null;
  }
  if (value is num) {
    return value.toInt();
  }
  throw const FormatException('Valore numerico facoltativo non valido.');
}

String? _optionalString(Object? value) {
  final normalized = value?.toString().trim();
  return normalized == null || normalized.isEmpty ? null : normalized;
}

DateTime _requiredDateTime(Map<String, Object?> json, String key) {
  final value = DateTime.tryParse(json[key]?.toString() ?? '');
  if (value == null) {
    throw FormatException('Data pagamento non valida: $key');
  }
  return value;
}

DateTime? _optionalDateTime(Object? value) {
  if (value == null) {
    return null;
  }
  final parsed = DateTime.tryParse(value.toString());
  if (parsed == null) {
    throw const FormatException('Data pagamento facoltativa non valida.');
  }
  return parsed;
}
