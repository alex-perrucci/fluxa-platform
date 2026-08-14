import 'dart:typed_data';

bool get fiscalReceiptPdfActionsSupported => false;

typedef FiscalReceiptPrinter = Future<String> Function(
  Uint8List bytes,
  String filename,
);

void configureFiscalReceiptPrinter(FiscalReceiptPrinter? printer) {}

Future<String> openFiscalReceiptPdf(Uint8List bytes, String filename) =>
    Future.error(
      UnsupportedError('PDF fiscale non supportato su questa piattaforma.'),
    );

Future<String> saveFiscalReceiptPdf(Uint8List bytes, String filename) =>
    Future.error(
      UnsupportedError('PDF fiscale non supportato su questa piattaforma.'),
    );

Future<String> printFiscalReceiptPdf(Uint8List bytes, String filename) =>
    Future.error(
      UnsupportedError(
        'Stampa PDF fiscale non supportata su questa piattaforma.',
      ),
    );
