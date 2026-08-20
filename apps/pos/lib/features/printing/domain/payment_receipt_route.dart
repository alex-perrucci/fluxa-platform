import 'printing_models.dart';

class PaymentReceiptRoute {
  const PaymentReceiptRoute({
    required this.id,
    required this.printerId,
    required this.printerName,
    required this.copies,
    required this.active,
  });

  factory PaymentReceiptRoute.fromJson(Map<String, Object?> json) {
    if (json['documentType']?.toString() !=
        PrintDocumentType.paymentReceipt.wireValue) {
      throw const FormatException(
        'La configurazione non riguarda le ricevute di pagamento.',
      );
    }
    final id = json['id']?.toString().trim() ?? '';
    final printerId = json['printerId']?.toString().trim() ?? '';
    if (id.isEmpty || printerId.isEmpty) {
      throw const FormatException('Configurazione stampante incompleta.');
    }
    final printerName = json['printerName']?.toString().trim();
    final copiesValue = json['copies'];
    final copies = copiesValue is int
        ? copiesValue
        : int.tryParse(copiesValue?.toString() ?? '') ?? 1;
    return PaymentReceiptRoute(
      id: id,
      printerId: printerId,
      printerName: printerName == null || printerName.isEmpty
          ? printerId
          : printerName,
      copies: copies,
      active: json['active'] != false,
    );
  }

  final String id;
  final String printerId;
  final String printerName;
  final int copies;
  final bool active;
}

List<PaymentReceiptRoute> paymentReceiptRoutesFromPayload(Object? payload) {
  if (payload is! List) {
    throw const FormatException('Elenco configurazioni stampante non valido.');
  }
  final routes = <PaymentReceiptRoute>[];
  for (final raw in payload) {
    if (raw is! Map) {
      continue;
    }
    final json = Map<String, Object?>.from(raw);
    if (json['documentType']?.toString() !=
        PrintDocumentType.paymentReceipt.wireValue) {
      continue;
    }
    if (json['kitchenStationId'] != null || json['active'] == false) {
      continue;
    }
    routes.add(PaymentReceiptRoute.fromJson(json));
  }
  return List<PaymentReceiptRoute>.unmodifiable(routes);
}

PaymentReceiptRoute? paymentReceiptRouteFromPayload(Object? payload) {
  final routes = paymentReceiptRoutesFromPayload(payload);
  return routes.isEmpty ? null : routes.first;
}

bool canReceivePaymentReceipts(PrinterDevice printer) =>
    printer.status == PrinterStatus.active &&
    (printer.purpose == PrinterPurpose.receipt ||
        printer.purpose == PrinterPurpose.generic);
