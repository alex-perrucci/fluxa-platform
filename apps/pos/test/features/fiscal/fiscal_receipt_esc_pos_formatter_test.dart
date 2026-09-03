import 'package:flutter_test/flutter_test.dart';
import 'package:fluxa_pos/features/fiscal/domain/fiscal_models.dart';
import 'package:fluxa_pos/features/fiscal/platform/fiscal_receipt_esc_pos_formatter.dart';

void main() {
  const header = FiscalReceiptHeader(
    locationName: 'Torteria Berlicabarbis',
    merchantLegalName: 'Crug SRL',
    addressLine1: 'Via Cernaia 44',
    addressLine2: null,
    postalCode: '10121',
    city: 'Torino',
    province: 'TO',
  );

  test('formats an AdE receipt for 58mm without overflowing 32 columns', () {
    final document = _document();
    final lines = buildFiscalReceiptTextLines(
      document: document,
      header: header,
      charactersPerLine: 32,
    );

    expect(lines.every((line) => line.length <= 32), isTrue);
    expect(lines, contains('DOCUMENTO COMMERCIALE'));
    expect(lines.any((line) => line.contains('TOTALE COMPLESSIVO')), isTrue);
    expect(lines.any((line) => line.contains('di cui IVA')), isTrue);
    expect(lines.any((line) => line.contains('Pagamento contante')), isTrue);
    expect(lines.any((line) => line.contains('Pagamento elettronico')), isTrue);
    expect(lines.any((line) => line.contains('DOCUMENTO N. 0402-0073')), isTrue);
    expect(lines.any((line) => line.contains('ID AdE 27843')), isTrue);
    expect(lines.any((line) => line.contains('P.IVA 10706570016')), isTrue);
  });

  test('formats the same receipt for 80mm using 48 columns', () {
    final lines = buildFiscalReceiptTextLines(
      document: _document(),
      header: header,
      charactersPerLine: 48,
    );

    expect(lines.every((line) => line.length <= 48), isTrue);
    expect(
      lines.any((line) => line.contains('1 Tortino di riso molto lungo')),
      isTrue,
    );
    expect(lines.any((line) => line.contains('22%')), isTrue);
    expect(lines.any((line) => line.contains('21,00')), isTrue);
  });

  test('emits ESC/POS init and cutter when enabled', () {
    final bytes = buildFiscalReceiptEscPos(
      document: _document(),
      header: header,
      charactersPerLine: 32,
      supportsCut: true,
    );

    expect(bytes.take(2).toList(), [0x1B, 0x40]);
    expect(bytes.sublist(bytes.length - 3), [0x1D, 0x56, 0x00]);
  });
}

FiscalDocument _document() => FiscalDocument.fromJson({
  'id': '11111111-1111-1111-1111-111111111111',
  'organizationId': '22222222-2222-2222-2222-222222222222',
  'locationId': '33333333-3333-3333-3333-333333333333',
  'orderId': '44444444-4444-4444-4444-444444444444',
  'parentDocumentId': null,
  'type': 'SALE',
  'status': 'ISSUED',
  'provider': 'ADE_WEB',
  'environment': 'PRODUCTION',
  'fiscalId': '10706570016',
  'currency': 'EUR',
  'totalCents': 2100,
  'cashPaymentCents': 500,
  'electronicPaymentCents': 1600,
  'externalId': '27843',
  'externalStatus': 'ISSUED',
  'documentNumber': '0402-0073',
  'documentDate': '2026-09-03T13:38:00+02:00',
  'errorCode': null,
  'errorMessage': null,
  'attempts': [
    {
      'attemptNo': 1,
      'outcome': 'ISSUED',
      'errorCode': null,
      'errorMessage': null,
      'startedAt': '2026-09-03T11:38:00.000Z',
      'finishedAt': '2026-09-03T11:38:01.000Z',
    },
  ],
  'maxAttempts': 5,
  'nextAttemptAt': '2026-09-03T11:38:00.000Z',
  'version': 2,
  'payload': {},
  'providerResponse': {},
  'createdAt': '2026-09-03T11:37:58.000Z',
  'updatedAt': '2026-09-03T11:38:01.000Z',
  'issuedAt': '2026-09-03T11:38:01.000Z',
  'voidedAt': null,
  'items': [
    {
      'id': 'a',
      'lineNo': 1,
      'description': 'Puffetti',
      'quantityAmount': 1,
      'quantityScale': 0,
      'unitPriceCents': 200,
      'grossCents': 200,
      'discountCents': 0,
      'finalGrossCents': 200,
      'vatRateBasisPoints': 1000,
      'vatNatureCode': null,
      'vatRateCode': '10',
    },
    {
      'id': 'b',
      'lineNo': 2,
      'description': 'Tortino di riso molto lungo con descrizione aggiuntiva',
      'quantityAmount': 1,
      'quantityScale': 0,
      'unitPriceCents': 500,
      'grossCents': 500,
      'discountCents': 0,
      'finalGrossCents': 500,
      'vatRateBasisPoints': 1000,
      'vatNatureCode': null,
      'vatRateCode': '10',
    },
    {
      'id': 'c',
      'lineNo': 3,
      'description': 'Prodotto aliquota ordinaria',
      'quantityAmount': 1,
      'quantityScale': 0,
      'unitPriceCents': 1400,
      'grossCents': 1400,
      'discountCents': 0,
      'finalGrossCents': 1400,
      'vatRateBasisPoints': 2200,
      'vatNatureCode': null,
      'vatRateCode': '22',
    },
  ],
  'vatSummaries': [
    {
      'id': 'v1',
      'vatKey': '10',
      'vatRateBasisPoints': 1000,
      'vatNatureCode': null,
      'grossCents': 700,
      'netCents': 636,
      'taxCents': 64,
    },
    {
      'id': 'v2',
      'vatKey': '22',
      'vatRateBasisPoints': 2200,
      'vatNatureCode': null,
      'grossCents': 1400,
      'netCents': 1148,
      'taxCents': 252,
    },
  ],
});
