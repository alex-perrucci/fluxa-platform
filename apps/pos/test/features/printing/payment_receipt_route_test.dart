import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/printing/domain/payment_receipt_route.dart';
import 'package:fluxa_pos/features/printing/domain/printing_models.dart';

void main() {
  test('finds the active general payment receipt route', () {
    final route = paymentReceiptRouteFromPayload([
      {
        'id': 'kitchen-route',
        'documentType': 'KITCHEN_TICKET',
        'printerId': 'kitchen-printer',
        'printerName': 'Cucina',
        'copies': 1,
        'active': true,
      },
      {
        'id': 'receipt-route',
        'documentType': 'PAYMENT_RECEIPT',
        'kitchenStationId': null,
        'printerId': 'receipt-printer',
        'printerName': 'BANCO',
        'copies': 1,
        'active': true,
      },
    ]);

    expect(route, isNotNull);
    expect(route!.printerId, 'receipt-printer');
    expect(route.printerName, 'BANCO');
  });

  test('ignores disabled payment receipt routes', () {
    final route = paymentReceiptRouteFromPayload([
      {
        'id': 'receipt-route',
        'documentType': 'PAYMENT_RECEIPT',
        'printerId': 'receipt-printer',
        'printerName': 'BANCO',
        'copies': 1,
        'active': false,
      },
    ]);

    expect(route, isNull);
  });

  test('only active receipt or generic printers can receive payment receipts', () {
    expect(canReceivePaymentReceipts(_printer(PrinterPurpose.receipt)), isTrue);
    expect(canReceivePaymentReceipts(_printer(PrinterPurpose.generic)), isTrue);
    expect(canReceivePaymentReceipts(_printer(PrinterPurpose.kitchen)), isFalse);
    expect(
      canReceivePaymentReceipts(
        _printer(PrinterPurpose.receipt, status: PrinterStatus.disabled),
      ),
      isFalse,
    );
  });
}

PrinterDevice _printer(
  PrinterPurpose purpose, {
  PrinterStatus status = PrinterStatus.active,
}) => PrinterDevice(
  id: 'printer-${purpose.wireValue}',
  organizationId: 'organization-1',
  locationId: 'location-1',
  code: 'PRINTER',
  name: 'Stampante',
  purpose: purpose,
  agentDeviceId: 'device-1',
  driver: 'ESC_POS_TEXT',
  paperWidthMm: 80,
  charactersPerLine: 48,
  supportsCut: true,
  supportsDrawer: false,
  status: status,
  lastSeenAt: null,
  agentVersion: null,
  statusMessage: null,
  createdAt: DateTime.utc(2026, 8, 20),
  updatedAt: DateTime.utc(2026, 8, 20),
);
