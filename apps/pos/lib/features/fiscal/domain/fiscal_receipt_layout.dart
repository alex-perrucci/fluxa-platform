class FiscalReceiptLayoutData {
  const FiscalReceiptLayoutData({
    required this.documentId,
    required this.provider,
    required this.status,
    required this.fiscalId,
    required this.documentNumber,
    required this.documentDate,
    required this.externalId,
    required this.issuedAt,
    required this.currency,
    required this.totalCents,
    required this.cashPaymentCents,
    required this.electronicPaymentCents,
    required this.paidCents,
    required this.unpaidCents,
    required this.totalVatCents,
    required this.issuer,
    required this.items,
    required this.vatSummaries,
  });

  factory FiscalReceiptLayoutData.fromJson(Map<String, Object?> json) =>
      FiscalReceiptLayoutData(
        documentId: _string(json, 'documentId'),
        provider: _string(json, 'provider'),
        status: _string(json, 'status'),
        fiscalId: _string(json, 'fiscalId'),
        documentNumber: _optionalString(json['documentNumber']),
        documentDate: _optionalString(json['documentDate']),
        externalId: _optionalString(json['externalId']),
        issuedAt: _optionalDate(json['issuedAt']),
        currency: _string(json, 'currency'),
        totalCents: _integer(json, 'totalCents'),
        cashPaymentCents: _integer(json, 'cashPaymentCents'),
        electronicPaymentCents: _integer(json, 'electronicPaymentCents'),
        paidCents: _integer(json, 'paidCents'),
        unpaidCents: _integer(json, 'unpaidCents'),
        totalVatCents: _integer(json, 'totalVatCents'),
        issuer: FiscalReceiptIssuer.fromJson(_map(json['issuer'])),
        items: _maps(
          json['items'],
        ).map(FiscalReceiptItem.fromJson).toList(growable: false),
        vatSummaries: _maps(
          json['vatSummaries'],
        ).map(FiscalReceiptVatSummary.fromJson).toList(growable: false),
      );

  final String documentId;
  final String provider;
  final String status;
  final String fiscalId;
  final String? documentNumber;
  final String? documentDate;
  final String? externalId;
  final DateTime? issuedAt;
  final String currency;
  final int totalCents;
  final int cashPaymentCents;
  final int electronicPaymentCents;
  final int paidCents;
  final int unpaidCents;
  final int totalVatCents;
  final FiscalReceiptIssuer issuer;
  final List<FiscalReceiptItem> items;
  final List<FiscalReceiptVatSummary> vatSummaries;
}

class FiscalReceiptIssuer {
  const FiscalReceiptIssuer({
    required this.displayName,
    required this.legalName,
    required this.vatNumber,
    required this.addressLine1,
    required this.addressLine2,
    required this.postalCode,
    required this.city,
    required this.province,
    required this.countryCode,
    required this.timezone,
  });

  factory FiscalReceiptIssuer.fromJson(Map<String, Object?> json) =>
      FiscalReceiptIssuer(
        displayName: _string(json, 'displayName'),
        legalName: _string(json, 'legalName'),
        vatNumber: _string(json, 'vatNumber'),
        addressLine1: _string(json, 'addressLine1'),
        addressLine2: _optionalString(json['addressLine2']),
        postalCode: _string(json, 'postalCode'),
        city: _string(json, 'city'),
        province: _optionalString(json['province']),
        countryCode: _string(json, 'countryCode'),
        timezone: _string(json, 'timezone'),
      );

  final String displayName;
  final String legalName;
  final String vatNumber;
  final String addressLine1;
  final String? addressLine2;
  final String postalCode;
  final String city;
  final String? province;
  final String countryCode;
  final String timezone;
}

class FiscalReceiptItem {
  const FiscalReceiptItem({
    required this.id,
    required this.lineNo,
    required this.description,
    required this.quantityAmount,
    required this.quantityScale,
    required this.unitPriceCents,
    required this.discountCents,
    required this.finalGrossCents,
    required this.vatRateBasisPoints,
    required this.vatNatureCode,
  });

  factory FiscalReceiptItem.fromJson(Map<String, Object?> json) =>
      FiscalReceiptItem(
        id: _string(json, 'id'),
        lineNo: _integer(json, 'lineNo'),
        description: _string(json, 'description'),
        quantityAmount: _integer(json, 'quantityAmount'),
        quantityScale: _integer(json, 'quantityScale'),
        unitPriceCents: _integer(json, 'unitPriceCents'),
        discountCents: _integer(json, 'discountCents'),
        finalGrossCents: _integer(json, 'finalGrossCents'),
        vatRateBasisPoints: _integer(json, 'vatRateBasisPoints'),
        vatNatureCode: _optionalString(json['vatNatureCode']),
      );

  final String id;
  final int lineNo;
  final String description;
  final int quantityAmount;
  final int quantityScale;
  final int unitPriceCents;
  final int discountCents;
  final int finalGrossCents;
  final int vatRateBasisPoints;
  final String? vatNatureCode;

  String get displayQuantity {
    if (quantityScale <= 0) return quantityAmount.toString();
    final divisor = _pow10(quantityScale);
    final whole = quantityAmount ~/ divisor;
    final fraction = (quantityAmount % divisor).abs().toString().padLeft(
      quantityScale,
      '0',
    );
    return '$whole,$fraction';
  }

  String get vatLabel => vatNatureCode?.trim().isNotEmpty == true
      ? vatNatureCode!.trim()
      : '${_rate(vatRateBasisPoints)}%';
}

class FiscalReceiptVatSummary {
  const FiscalReceiptVatSummary({
    required this.id,
    required this.vatKey,
    required this.vatRateBasisPoints,
    required this.vatNatureCode,
    required this.grossCents,
    required this.netCents,
    required this.taxCents,
  });

  factory FiscalReceiptVatSummary.fromJson(Map<String, Object?> json) =>
      FiscalReceiptVatSummary(
        id: _string(json, 'id'),
        vatKey: json['vatKey']?.toString() ?? '',
        vatRateBasisPoints: _integer(json, 'vatRateBasisPoints'),
        vatNatureCode: _optionalString(json['vatNatureCode']),
        grossCents: _integer(json, 'grossCents'),
        netCents: _integer(json, 'netCents'),
        taxCents: _integer(json, 'taxCents'),
      );

  final String id;
  final String vatKey;
  final int vatRateBasisPoints;
  final String? vatNatureCode;
  final int grossCents;
  final int netCents;
  final int taxCents;

  String get rateLabel => vatNatureCode?.trim().isNotEmpty == true
      ? vatNatureCode!.trim()
      : '${_rate(vatRateBasisPoints)}%';
}

String formatReceiptMoney(int cents) {
  final negative = cents < 0;
  final absolute = cents.abs();
  return '${negative ? '-' : ''}${absolute ~/ 100},${(absolute % 100).toString().padLeft(2, '0')}';
}

String _rate(int basisPoints) {
  if (basisPoints % 100 == 0) return '${basisPoints ~/ 100}';
  return (basisPoints / 100).toStringAsFixed(2).replaceAll('.', ',');
}

int _pow10(int exponent) {
  var value = 1;
  for (var i = 0; i < exponent; i += 1) value *= 10;
  return value;
}

Map<String, Object?> _map(Object? value) {
  if (value is! Map) throw const FormatException('Oggetto fiscale non valido.');
  return Map<String, Object?>.from(value);
}

List<Map<String, Object?>> _maps(Object? value) {
  if (value is! List) return const [];
  return value.map(_map).toList(growable: false);
}

String _string(Map<String, Object?> json, String key) {
  final value = json[key]?.toString().trim();
  if (value == null || value.isEmpty) {
    throw FormatException('Campo $key mancante.');
  }
  return value;
}

String? _optionalString(Object? value) {
  final text = value?.toString().trim();
  return text == null || text.isEmpty ? null : text;
}

int _integer(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is num) return value.toInt();
  final parsed = int.tryParse(value?.toString() ?? '');
  if (parsed == null) throw FormatException('Campo $key non numerico.');
  return parsed;
}

DateTime? _optionalDate(Object? value) =>
    DateTime.tryParse(value?.toString() ?? '');
