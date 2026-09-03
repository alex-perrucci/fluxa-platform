import 'dart:typed_data';

import '../domain/fiscal_receipt_layout.dart';

bool get fiscalReceiptPdfActionsSupported => false;

typedef FiscalReceiptPrinter =
    Future<String> Function(FiscalReceiptLayoutData receipt);

void configureFiscalReceiptPrinter(FiscalReceiptPrinter? printer) {}

Future<String> openFiscalReceiptPdf(Uint8List bytes, String filename) =>
    Future.error(
      UnsupportedError('PDF fiscale non supportato su questa piattaforma.'),
    );

Future<String> saveFiscalReceiptPdf(Uint8List bytes, String filename) =>
    Future.error(
      UnsupportedError('PDF fiscale non supportato su questa piattaforma.'),
    );

Future<String> printFiscalReceiptLayout(FiscalReceiptLayoutData receipt) =>
    Future.error(
      UnsupportedError(
        'Stampa del documento fiscale non supportata su questa piattaforma.',
      ),
    );
