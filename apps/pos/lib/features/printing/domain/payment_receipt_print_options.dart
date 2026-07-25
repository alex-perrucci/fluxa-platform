class PaymentReceiptPrinterOption {
  const PaymentReceiptPrinterOption({
    required this.id,
    required this.code,
    required this.name,
    required this.purpose,
  });

  factory PaymentReceiptPrinterOption.fromJson(Map<String, Object?> json) =>
      PaymentReceiptPrinterOption(
        id: _requiredString(json, 'id'),
        code: _requiredString(json, 'code'),
        name: _requiredString(json, 'name'),
        purpose: _requiredString(json, 'purpose'),
      );

  final String id;
  final String code;
  final String name;
  final String purpose;
}

class PaymentReceiptPrintOptions {
  const PaymentReceiptPrintOptions({
    required this.checkoutId,
    required this.locationId,
    required this.defaultRouteConfigured,
    required this.printers,
  });

  factory PaymentReceiptPrintOptions.fromJson(Map<String, Object?> json) {
    final rawPrinters = json['printers'];
    return PaymentReceiptPrintOptions(
      checkoutId: _requiredString(json, 'checkoutId'),
      locationId: _requiredString(json, 'locationId'),
      defaultRouteConfigured: json['defaultRouteConfigured'] == true,
      printers: rawPrinters is List
          ? rawPrinters
                .whereType<Map>()
                .map(
                  (value) => PaymentReceiptPrinterOption.fromJson(
                    Map<String, Object?>.from(value),
                  ),
                )
                .toList(growable: false)
          : const [],
    );
  }

  final String checkoutId;
  final String locationId;
  final bool defaultRouteConfigured;
  final List<PaymentReceiptPrinterOption> printers;
}

String _requiredString(Map<String, Object?> json, String key) {
  final value = json[key]?.toString();
  if (value == null || value.isEmpty) {
    throw FormatException('Campo $key mancante nelle opzioni di stampa.');
  }
  return value;
}
