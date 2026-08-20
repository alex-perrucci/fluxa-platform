enum FiscalProvider {
  mock('MOCK', 'Mock'),
  acubeSmartReceipts('ACUBE_SMART_RECEIPTS', 'A-Cube Smart Receipts'),
  openapiSmartReceipts('OPENAPI_SMART_RECEIPTS', 'OpenAPI Smart Receipts'),
  adeWeb('ADE_WEB', 'Agenzia delle Entrate');

  const FiscalProvider(this.wireValue, this.label);
  final String wireValue;
  final String label;

  static FiscalProvider fromWire(Object? value) => values.firstWhere(
    (item) => item.wireValue == value?.toString(),
    orElse: () =>
        throw FormatException('Provider fiscale non supportato: $value'),
  );
}

enum FiscalEnvironment {
  sandbox('SANDBOX', 'Sandbox'),
  production('PRODUCTION', 'Produzione');

  const FiscalEnvironment(this.wireValue, this.label);
  final String wireValue;
  final String label;

  static FiscalEnvironment fromWire(Object? value) => values.firstWhere(
    (item) => item.wireValue == value?.toString(),
    orElse: () =>
        throw FormatException('Ambiente fiscale non supportato: $value'),
  );
}

enum FiscalDocumentType {
  sale('SALE', 'Vendita'),
  voidDocument('VOID', 'Annullamento');

  const FiscalDocumentType(this.wireValue, this.label);
  final String wireValue;
  final String label;

  static FiscalDocumentType fromWire(Object? value) => values.firstWhere(
    (item) => item.wireValue == value?.toString(),
    orElse: () => throw FormatException('Tipo fiscale non supportato: $value'),
  );
}

enum FiscalDocumentStatus {
  queued('QUEUED', 'In coda'),
  processing('PROCESSING', 'In elaborazione'),
  issued('ISSUED', 'Emesso'),
  retry('RETRY', 'Da ritentare'),
  rejected('REJECTED', 'Rifiutato'),
  unknown('UNKNOWN', 'Esito da verificare'),
  authRequired('AUTH_REQUIRED', 'Accesso AdE richiesto'),
  voided('VOIDED', 'Annullato fiscalmente'),
  cancelled('CANCELLED', 'Cancellato');

  const FiscalDocumentStatus(this.wireValue, this.label);
  final String wireValue;
  final String label;

  bool get isPending =>
      this == FiscalDocumentStatus.queued ||
      this == FiscalDocumentStatus.processing ||
      this == FiscalDocumentStatus.retry;

  bool get requiresAttention =>
      this == FiscalDocumentStatus.rejected ||
      this == FiscalDocumentStatus.cancelled ||
      this == FiscalDocumentStatus.unknown ||
      this == FiscalDocumentStatus.authRequired;

  static FiscalDocumentStatus fromWire(Object? value) => values.firstWhere(
    (item) => item.wireValue == value?.toString(),
    orElse: () => throw FormatException('Stato fiscale non supportato: $value'),
  );
}

class FiscalProfile {
  const FiscalProfile({
    required this.id,
    required this.organizationId,
    required this.locationId,
    required this.provider,
    required this.environment,
    required this.fiscalId,
    required this.enabled,
    required this.autoIssueOnPaid,
    required this.receiptEmail,
    required this.displayName,
    required this.version,
    required this.createdAt,
    required this.updatedAt,
  });

  factory FiscalProfile.fromJson(Map<String, Object?> json) => FiscalProfile(
    id: _string(json, 'id'),
    organizationId: _string(json, 'organizationId'),
    locationId: _string(json, 'locationId'),
    provider: FiscalProvider.fromWire(json['provider']),
    environment: FiscalEnvironment.fromWire(json['environment']),
    fiscalId: _string(json, 'fiscalId'),
    enabled: json['enabled'] == true,
    autoIssueOnPaid: json['autoIssueOnPaid'] == true,
    receiptEmail: _optionalString(json['receiptEmail']),
    displayName: _optionalString(json['displayName']),
    version: _integer(json, 'version'),
    createdAt: _date(json, 'createdAt'),
    updatedAt: _date(json, 'updatedAt'),
  );

  final String id;
  final String organizationId;
  final String locationId;
  final FiscalProvider provider;
  final FiscalEnvironment environment;
  final String fiscalId;
  final bool enabled;
  final bool autoIssueOnPaid;
  final String? receiptEmail;
  final String? displayName;
  final int version;
  final DateTime createdAt;
  final DateTime updatedAt;

  String get maskedFiscalId => fiscalId.length == 11
      ? '${fiscalId.substring(0, 3)}•••••${fiscalId.substring(8)}'
      : fiscalId;
}

class FiscalDocumentPage {
  const FiscalDocumentPage({
    required this.page,
    required this.pageSize,
    required this.total,
    required this.items,
  });

  factory FiscalDocumentPage.fromJson(Map<String, Object?> json) =>
      FiscalDocumentPage(
        page: _integer(json, 'page'),
        pageSize: _integer(json, 'pageSize'),
        total: _integer(json, 'total'),
        items: _maps(
          json['items'],
        ).map(FiscalDocument.fromJson).toList(growable: false),
      );

  final int page;
  final int pageSize;
  final int total;
  final List<FiscalDocument> items;
}

class FiscalDocument {
  const FiscalDocument({
    required this.id,
    required this.organizationId,
    required this.locationId,
    required this.orderId,
    required this.parentDocumentId,
    required this.type,
    required this.status,
    required this.provider,
    required this.environment,
    required this.fiscalId,
    required this.currency,
    required this.totalCents,
    required this.cashPaymentCents,
    required this.electronicPaymentCents,
    required this.externalId,
    required this.externalStatus,
    required this.documentNumber,
    required this.documentDate,
    required this.errorCode,
    required this.errorMessage,
    required this.attempts,
    required this.maxAttempts,
    required this.nextAttemptAt,
    required this.version,
    required this.payload,
    required this.providerResponse,
    required this.createdAt,
    required this.updatedAt,
    required this.issuedAt,
    required this.voidedAt,
    required this.items,
    required this.vatSummaries,
    required this.attemptHistory,
  });

  factory FiscalDocument.fromJson(Map<String, Object?> json) => FiscalDocument(
    id: _string(json, 'id'),
    organizationId: _string(json, 'organizationId'),
    locationId: _string(json, 'locationId'),
    orderId: _string(json, 'orderId'),
    parentDocumentId: _optionalString(json['parentDocumentId']),
    type: FiscalDocumentType.fromWire(json['type']),
    status: FiscalDocumentStatus.fromWire(json['status']),
    provider: FiscalProvider.fromWire(json['provider']),
    environment: FiscalEnvironment.fromWire(json['environment']),
    fiscalId: _string(json, 'fiscalId'),
    currency: _string(json, 'currency'),
    totalCents: _integer(json, 'totalCents'),
    cashPaymentCents: _integer(json, 'cashPaymentCents'),
    electronicPaymentCents: _integer(json, 'electronicPaymentCents'),
    externalId: _optionalString(json['externalId']),
    externalStatus: _optionalString(json['externalStatus']),
    documentNumber: _optionalString(json['documentNumber']),
    documentDate: _optionalString(json['documentDate']),
    errorCode: _optionalString(json['errorCode']),
    errorMessage: _optionalString(json['errorMessage']),
    attempts: json['attempts'] is List
        ? (json['attempts'] as List).length
        : _integer(json, 'attempts'),
    maxAttempts: _integer(json, 'maxAttempts'),
    nextAttemptAt: _date(json, 'nextAttemptAt'),
    version: _integer(json, 'version'),
    payload: _optionalMap(json['payload']) ?? const {},
    providerResponse: _optionalMap(json['providerResponse']),
    createdAt: _date(json, 'createdAt'),
    updatedAt: _date(json, 'updatedAt'),
    issuedAt: _optionalDate(json['issuedAt']),
    voidedAt: _optionalDate(json['voidedAt']),
    items: _maps(
      json['items'],
    ).map(FiscalDocumentItem.fromJson).toList(growable: false),
    vatSummaries: _maps(
      json['vatSummaries'],
    ).map(FiscalVatSummary.fromJson).toList(growable: false),
    attemptHistory: _maps(
      json['attempts'],
    ).map(FiscalAttempt.fromJson).toList(growable: false),
  );

  final String id;
  final String organizationId;
  final String locationId;
  final String orderId;
  final String? parentDocumentId;
  final FiscalDocumentType type;
  final FiscalDocumentStatus status;
  final FiscalProvider provider;
  final FiscalEnvironment environment;
  final String fiscalId;
  final String currency;
  final int totalCents;
  final int cashPaymentCents;
  final int electronicPaymentCents;
  final String? externalId;
  final String? externalStatus;
  final String? documentNumber;
  final String? documentDate;
  final String? errorCode;
  final String? errorMessage;
  final int attempts;
  final int maxAttempts;
  final DateTime nextAttemptAt;
  final int version;
  final Map<String, Object?> payload;
  final Map<String, Object?>? providerResponse;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? issuedAt;
  final DateTime? voidedAt;
  final List<FiscalDocumentItem> items;
  final List<FiscalVatSummary> vatSummaries;
  final List<FiscalAttempt> attemptHistory;

  bool get canRetry =>
      status == FiscalDocumentStatus.retry ||
      status == FiscalDocumentStatus.rejected;
  bool get canVoid =>
      provider != FiscalProvider.adeWeb &&
      type == FiscalDocumentType.sale &&
      status == FiscalDocumentStatus.issued &&
      externalId != null;
}

class FiscalDocumentItem {
  const FiscalDocumentItem({
    required this.id,
    required this.lineNo,
    required this.description,
    required this.quantityAmount,
    required this.quantityScale,
    required this.unitPriceCents,
    required this.grossCents,
    required this.discountCents,
    required this.finalGrossCents,
    required this.vatRateBasisPoints,
    required this.vatNatureCode,
    required this.vatRateCode,
  });

  factory FiscalDocumentItem.fromJson(
    Map<String, Object?> json,
  ) => FiscalDocumentItem(
    id: _stringAny(json, const ['id']),
    lineNo: _intAny(json, const ['lineNo', 'line_no']),
    description: _stringAny(json, const ['description']),
    quantityAmount: _intAny(json, const ['quantityAmount', 'quantity_amount']),
    quantityScale: _intAny(json, const ['quantityScale', 'quantity_scale']),
    unitPriceCents: _intAny(json, const ['unitPriceCents', 'unit_price_cents']),
    grossCents: _intAny(json, const ['grossCents', 'gross_cents']),
    discountCents: _intAny(json, const ['discountCents', 'discount_cents']),
    finalGrossCents: _intAny(json, const [
      'finalGrossCents',
      'final_gross_cents',
    ]),
    vatRateBasisPoints: _intAny(json, const [
      'vatRateBasisPoints',
      'vat_rate_basis_points',
    ]),
    vatNatureCode: _optionalString(
      json['vatNatureCode'] ?? json['vat_nature_code'],
    ),
    vatRateCode: _stringAny(json, const ['vatRateCode', 'vat_rate_code']),
  );

  final String id;
  final int lineNo;
  final String description;
  final int quantityAmount;
  final int quantityScale;
  final int unitPriceCents;
  final int grossCents;
  final int discountCents;
  final int finalGrossCents;
  final int vatRateBasisPoints;
  final String? vatNatureCode;
  final String vatRateCode;

  String get displayQuantity {
    if (quantityScale <= 0) return quantityAmount.toString();
    final divisor = _pow10(quantityScale);
    final whole = quantityAmount ~/ divisor;
    final fraction = (quantityAmount % divisor).toString().padLeft(
      quantityScale,
      '0',
    );
    return '$whole.$fraction';
  }
}

class FiscalVatSummary {
  const FiscalVatSummary({
    required this.id,
    required this.vatKey,
    required this.vatRateBasisPoints,
    required this.vatNatureCode,
    required this.grossCents,
    required this.netCents,
    required this.taxCents,
  });

  factory FiscalVatSummary.fromJson(Map<String, Object?> json) =>
      FiscalVatSummary(
        id: _stringAny(json, const ['id']),
        vatKey: _stringAny(json, const ['vatKey', 'vat_key']),
        vatRateBasisPoints: _intAny(json, const [
          'vatRateBasisPoints',
          'vat_rate_basis_points',
        ]),
        vatNatureCode: _optionalString(
          json['vatNatureCode'] ?? json['vat_nature_code'],
        ),
        grossCents: _intAny(json, const ['grossCents', 'gross_cents']),
        netCents: _intAny(json, const ['netCents', 'net_cents']),
        taxCents: _intAny(json, const ['taxCents', 'tax_cents']),
      );

  final String id;
  final String vatKey;
  final int vatRateBasisPoints;
  final String? vatNatureCode;
  final int grossCents;
  final int netCents;
  final int taxCents;

  String get rateLabel => vatNatureCode != null
      ? vatNatureCode!
      : '${(vatRateBasisPoints / 100).toStringAsFixed(2)}%';
}

class FiscalAttempt {
  const FiscalAttempt({
    required this.attemptNo,
    required this.outcome,
    required this.errorCode,
    required this.errorMessage,
    required this.startedAt,
    required this.finishedAt,
  });

  factory FiscalAttempt.fromJson(Map<String, Object?> json) => FiscalAttempt(
    attemptNo: _integer(json, 'attemptNo'),
    outcome: _string(json, 'outcome'),
    errorCode: _optionalString(json['errorCode']),
    errorMessage: _optionalString(json['errorMessage']),
    startedAt: _date(json, 'startedAt'),
    finishedAt: _optionalDate(json['finishedAt']),
  );

  final int attemptNo;
  final String outcome;
  final String? errorCode;
  final String? errorMessage;
  final DateTime startedAt;
  final DateTime? finishedAt;
}

String formatFiscalMoney(int cents, String currency) {
  final negative = cents < 0;
  final absolute = cents.abs();
  final value =
      '${absolute ~/ 100},${(absolute % 100).toString().padLeft(2, '0')}';
  return '${negative ? '-' : ''}$value $currency';
}

String _string(Map<String, Object?> json, String key) {
  final value = json[key]?.toString();
  if (value == null || value.isEmpty) {
    throw FormatException('Campo $key mancante.');
  }
  return value;
}

int _integer(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is num) return value.toInt();
  final parsed = int.tryParse(value?.toString() ?? '');
  if (parsed == null) throw FormatException('Campo $key non numerico.');
  return parsed;
}

DateTime _date(Map<String, Object?> json, String key) {
  final value = DateTime.tryParse(json[key]?.toString() ?? '');
  if (value == null) throw FormatException('Campo $key non valido.');
  return value;
}

String _stringAny(Map<String, Object?> json, List<String> keys) {
  for (final key in keys) {
    final value = json[key]?.toString();
    if (value != null && value.isNotEmpty) return value;
  }
  throw FormatException('Campo ${keys.join('/')} mancante.');
}

int _intAny(Map<String, Object?> json, List<String> keys) {
  for (final key in keys) {
    final value = json[key];
    if (value is num) return value.toInt();
    final parsed = int.tryParse(value?.toString() ?? '');
    if (parsed != null) return parsed;
  }
  throw FormatException('Campo ${keys.join('/')} non numerico.');
}

String? _optionalString(Object? value) {
  final text = value?.toString().trim();
  return text == null || text.isEmpty ? null : text;
}

DateTime? _optionalDate(Object? value) =>
    DateTime.tryParse(value?.toString() ?? '');

Map<String, Object?>? _optionalMap(Object? value) {
  if (value is! Map) return null;
  return Map<String, Object?>.from(value);
}

List<Map<String, Object?>> _maps(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((item) => Map<String, Object?>.from(item))
      .toList(growable: false);
}

int _pow10(int scale) {
  var value = 1;
  for (var index = 0; index < scale; index += 1) {
    value *= 10;
  }
  return value;
}
