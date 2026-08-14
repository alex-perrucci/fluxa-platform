import 'dart:typed_data';

bool get fiscalReceiptPdfActionsSupported => false;

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
